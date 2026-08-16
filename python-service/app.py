import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify

app = Flask(__name__)

def base64_to_cv2(base64_str):
    if ',' in base64_str:
        base64_str = base64_str.split(',')[1]
    img_data = base64.b64decode(base64_str)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img

def cv2_to_base64(img):
    _, buffer = cv2.imencode('.jpg', img)
    base64_str = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/jpeg;base64,{base64_str}"

def find_plate_contour(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Apply bilateral filter to remove noise while keeping edges sharp
    blur = cv2.bilateralFilter(gray, 11, 17, 17)
    edged = cv2.Canny(blur, 30, 200)

    # Find contours
    contours, _ = cv2.findContours(edged.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    # Sort by area (descending)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    plate_contour = None
    for c in contours:
        # Approximate the contour
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.018 * peri, True)
        
        # Plates are roughly rectangular
        if len(approx) == 4:
            x, y, w, h = cv2.boundingRect(approx)
            aspect_ratio = w / float(h)
            
            # Check for typical Indian plate aspect ratio (wider than tall, approx 2 to 5.5)
            if 2.0 <= aspect_ratio <= 6.0:
                # Also check minimum size to avoid small noise
                if w * h > 3000: 
                    plate_contour = approx
                    break
    
    return plate_contour

@app.route('/localize', methods=['POST'])
def localize():
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
            
            # Add a slight padding to the crop
            pad_x = int(w * 0.05)
            pad_y = int(h * 0.1)
            
            x1 = max(0, x - pad_x)
            y1 = max(0, y - pad_y)
            x2 = min(img.shape[1], x + w + pad_x)
            y2 = min(img.shape[0], y + h + pad_y)
            
            cropped = img[y1:y2, x1:x2]
            cropped_base64 = cv2_to_base64(cropped)
            return jsonify({'plate_found': True, 'image': cropped_base64})
        
        return jsonify({'plate_found': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5001)
