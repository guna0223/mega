import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify
import easyocr
import re
import os
import sys
import time
import zipfile
import pymongo
from datetime import datetime, timezone

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional; env vars can be set another way

app = Flask(__name__)

# ---------------------------------------------------------------------------
# EasyOCR model download (manual, with retries)
# ---------------------------------------------------------------------------
# easyocr's built-in downloader uses urllib, which can fail with
# "ConnectionResetError: [WinError 10054]" behind flaky networks, some
# antivirus tools, or corporate proxies. We download the models ourselves
# using requests (with retries + backoff), verify the file, then point
# easyocr at the already-downloaded models with download_enabled=False so
# it never touches the network.

MODEL_DIR = os.path.join(os.path.expanduser("~"), ".EasyOCR", "model")

MODELS = {
    "craft_mlt_25k.pth": {
        "url": "https://github.com/JaidedAI/EasyOCR/releases/download/pre-v1.1.6/craft_mlt_25k.zip",
        "zip_name": "craft_mlt_25k.zip",
    },
    "english_g2.pth": {
        "url": "https://github.com/JaidedAI/EasyOCR/releases/download/v1.3/english_g2.zip",
        "zip_name": "english_g2.zip",
    },
}


def _download_with_retries(url, dest_path, max_retries=5, timeout=60):
    import requests

    for attempt in range(1, max_retries + 1):
        try:
            print(f"  Downloading {url} (attempt {attempt}/{max_retries})...", file=sys.stderr)
            with requests.get(url, stream=True, timeout=timeout) as r:
                r.raise_for_status()
                with open(dest_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 256):
                        if chunk:
                            f.write(chunk)
            if os.path.getsize(dest_path) > 0:
                return True
            raise IOError("Downloaded file is empty")
        except Exception as e:
            print(f"  Download attempt {attempt} failed: {e}", file=sys.stderr)
            if os.path.exists(dest_path):
                os.remove(dest_path)
            if attempt < max_retries:
                sleep_for = min(2 ** attempt, 30)
                print(f"  Retrying in {sleep_for}s...", file=sys.stderr)
                time.sleep(sleep_for)
    return False


def ensure_easyocr_models():
    os.makedirs(MODEL_DIR, exist_ok=True)

    for model_filename, info in MODELS.items():
        model_path = os.path.join(MODEL_DIR, model_filename)
        if os.path.exists(model_path):
            print(f"Model already present: {model_filename}", file=sys.stderr)
            continue

        zip_path = os.path.join(MODEL_DIR, info["zip_name"])
        print(f"Model missing: {model_filename}. Fetching...", file=sys.stderr)

        if not _download_with_retries(info["url"], zip_path):
            raise RuntimeError(
                f"Failed to download {model_filename} after multiple retries. "
                f"Check your internet connection / firewall / antivirus, or download it "
                f"manually from {info['url']} and unzip it into {MODEL_DIR}"
            )

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(MODEL_DIR)
        finally:
            if os.path.exists(zip_path):
                os.remove(zip_path)

        if not os.path.exists(model_path):
            raise RuntimeError(
                f"Extracted zip but {model_filename} was not found in {MODEL_DIR}. "
                f"The archive layout may have changed upstream."
            )

        print(f"  Ready: {model_filename}", file=sys.stderr)


print("Preparing EasyOCR models...", file=sys.stderr)
try:
    ensure_easyocr_models()
except Exception as e:
    print(f"FATAL: could not prepare EasyOCR models: {e}", file=sys.stderr)
    sys.exit(1)

print("Loading EasyOCR model...", file=sys.stderr)
reader = easyocr.Reader(
    ["en"],
    model_storage_directory=MODEL_DIR,
    download_enabled=False,
)
print("EasyOCR model loaded.", file=sys.stderr)

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
MONGO_URI = os.environ.get("MONGO_URI")
if not MONGO_URI:
    print(
        "FATAL: MONGO_URI environment variable is not set. "
        "Create a .env file (or set the env var) with:\n"
        "  MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    client.admin.command("ping")  # fail fast if creds/network are bad
    db = client["property_rental"]
    bus_entries = db["busentries"]
    buses_coll = db["buses"]
    print("Connected to MongoDB.", file=sys.stderr)
except Exception as e:
    print(f"FATAL: could not connect to MongoDB: {e}", file=sys.stderr)
    sys.exit(1)


def base64_to_cv2(base64_str):
    if ',' in base64_str:
        base64_str = base64_str.split(',')[1]
    img_data = base64.b64decode(base64_str)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Resize image to speed up processing
    height, width = img.shape[:2]
    max_width = 800
    if width > max_width:
        ratio = max_width / float(width)
        img = cv2.resize(img, (max_width, int(height * ratio)))
        
    return img


def cv2_to_base64(img):
    _, buffer = cv2.imencode('.jpg', img)
    base64_str = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/jpeg;base64,{base64_str}"


def find_plate_contour(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.bilateralFilter(gray, 11, 17, 17)
    edged = cv2.Canny(blur, 30, 200)

    contours, _ = cv2.findContours(edged.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    plate_contour = None
    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.018 * peri, True)
        if len(approx) == 4:
            x, y, w, h = cv2.boundingRect(approx)
            aspect_ratio = w / float(h)
            if 1.5 <= aspect_ratio <= 6.0:
                if w * h > 500:
                    plate_contour = approx
                    break
    return plate_contour


global_frame_buffer = []


@app.route('/localize', methods=['POST'])
def localize():
    # Legacy endpoint if needed
    try:
        data = request.json
        if 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        img = base64_to_cv2(data['image'])
        if img is None:
            return jsonify({'error': 'Failed to decode image'}), 400
        plate_contour = find_plate_contour(img)
        if plate_contour is not None:
            x, y, w, h = cv2.boundingRect(plate_contour)
            pad_x, pad_y = int(w * 0.05), int(h * 0.1)
            x1, y1 = max(0, x - pad_x), max(0, y - pad_y)
            x2, y2 = min(img.shape[1], x + w + pad_x), min(img.shape[0], y + h + pad_y)
            cropped = img[y1:y2, x1:x2]
            return jsonify({'plate_found': True, 'image': cv2_to_base64(cropped)})
        return jsonify({'plate_found': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/detect', methods=['POST'])
def detect():
    global global_frame_buffer
    try:
        data = request.json
        if 'image' not in data:
            return jsonify({'message': 'No image provided'}), 400
        img = base64_to_cv2(data['image'])
        if img is None:
            return jsonify({'message': 'Failed to decode image'}), 400

        plate_contour = find_plate_contour(img)
        if plate_contour is None:
            return jsonify({'message': 'No plate localized in frame'}), 202

        # Crop
        x, y, w, h = cv2.boundingRect(plate_contour)
        pad_x, pad_y = int(w * 0.05), int(h * 0.1)
        x1, y1 = max(0, x - pad_x), max(0, y - pad_y)
        x2, y2 = min(img.shape[1], x + w + pad_x), min(img.shape[0], y + h + pad_y)
        cropped = img[y1:y2, x1:x2]
        plateCropBase64 = cv2_to_base64(cropped)

        # OCR
        result = reader.readtext(cropped)
        if not result:
            return jsonify({'message': 'No text found', 'rawText': ''}), 202

        # We might have multiple text boxes, let's join them or pick the most confident one
        best_text = ""
        best_conf = 0
        for bbox, text, conf in result:
            if conf > best_conf:
                best_conf = conf
                best_text = text

        rawText = best_text
        confidence = float(best_conf * 100)

        if confidence < 40:
            return jsonify({'message': 'Confidence too low', 'rawText': rawText}), 202

        # Clean raw string
        cleanedRaw = re.sub(r'[^A-Z0-9]', '', rawText.upper())
        finalPlate = cleanedRaw

        if len(finalPlate) < 4:
            return jsonify({'message': 'Invalid format', 'rawText': rawText}), 202

        # Filter buffer
        now = datetime.now(timezone.utc).timestamp() * 1000
        global_frame_buffer = [f for f in global_frame_buffer if now - f['timestamp'] < 3000]
        global_frame_buffer.append({'finalPlate': finalPlate, 'confidence': confidence, 'timestamp': now})

        consensusReached = False
        if confidence >= 40:
            consensusReached = True
        else:
            count = len([f for f in global_frame_buffer if f['finalPlate'] == finalPlate])
            if count >= 2:
                consensusReached = True

        if not consensusReached:
            return jsonify({'message': 'Reading plate...', 'rawText': rawText}), 202

        global_frame_buffer = [f for f in global_frame_buffer if f['finalPlate'] != finalPlate]

        # IN/OUT Logic & DB Save
        # Find last entry
        last_entry = bus_entries.find_one({"plateNumber": finalPlate}, sort=[("timestamp", -1)])

        if last_entry:
            last_ts = last_entry.get('timestamp')
            if isinstance(last_ts, str):
                try:
                    # attempt to parse if string
                    last_ts_dt = datetime.fromisoformat(last_ts.replace('Z', '+00:00'))
                    last_time = last_ts_dt.timestamp() * 1000
                except Exception:
                    last_time = 0
            else:
                # Should be datetime object
                if last_ts.tzinfo is None:
                    last_ts = last_ts.replace(tzinfo=timezone.utc)
                last_time = last_ts.timestamp() * 1000

            timeDiffMs = now - last_time
            if timeDiffMs < 10000:
                return jsonify({'message': 'Plate already logged recently. Waiting for cooldown (10s).', 'plateNumber': finalPlate}), 409

        status = "IN" if not last_entry or last_entry.get("status") == "OUT" else "OUT"

        # Check if matched bus
        matched_bus = buses_coll.find_one({"plateNumber": finalPlate, "isActive": True})

        new_entry = {
            "plateNumber": finalPlate,
            "status": status,
            "imageUrl": plateCropBase64,
            "detectedConfidence": confidence,
            "isManualOverride": False,
            "matchedBus": bool(matched_bus),
            "matchConfidence": confidence,
            "rawOcrText": rawText,
            "timestamp": datetime.now(timezone.utc)
        }

        inserted = bus_entries.insert_one(new_entry)
        new_entry['_id'] = str(inserted.inserted_id)
        # convert datetime to string for json serialization
        new_entry['timestamp'] = new_entry['timestamp'].isoformat()

        return jsonify({'entry': new_entry, 'rawText': rawText}), 201

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'message': str(e)}), 500


if __name__ == '__main__':
    app.run(port=5001, debug=False)