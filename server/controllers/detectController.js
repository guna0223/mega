const BusEntry = require("../models/BusEntry");
const Bus = require("../models/Bus");
const { extractPlateNumber, matchPlateToRegisteredBus, PLATE_REGEX } = require("../utils/ocr");

let globalFrameBuffer = [];

async function localizePlate(base64Image) {
  try {
    const response = await fetch("http://localhost:5001/localize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64Image }),
    });
    if (!response.ok) {
      throw new Error(`Python service returned ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("Python localization service failed:", err.message);
    throw new Error("PYTHON_OFFLINE");
  }
}

// POST /api/detect
async function detectPlate(req, res) {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ message: "No image provided" });

    let localization;
    try {
      localization = await localizePlate(image);
    } catch (err) {
      if (err.message === "PYTHON_OFFLINE") {
        return res.status(503).json({ message: "Python localization service is offline" });
      }
      throw err;
    }

    if (!localization || !localization.plate_found) {
      require('fs').appendFileSync('debug.log', `[${new Date().toISOString()}] No plate localized by python service.\n`);
      return res.status(202).json({ message: "No plate localized in frame" });
    }

    const plateCropBase64 = localization.image;

    // 2. Run OCR only on the crop
    const { plateNumber, confidence, rawText } = await extractPlateNumber(plateCropBase64);
    require('fs').appendFileSync('debug.log', `[${new Date().toISOString()}] OCR Read: ${rawText}, Conf: ${confidence}\n`);

    // 3. Stricter Rules Validation
    // Require minimum confidence 60%
    if (confidence < 60) {
      require('fs').appendFileSync('debug.log', `[${new Date().toISOString()}] Dropped due to low confidence.\n`);
      return res.status(202).json({ message: "Confidence too low (< 60%), discarded.", rawText });
    }

    // Require full regex match, not just partial
    // We extracted `plateNumber` using `.match(PLATE_REGEX)` in ocr.js, which finds substrings.
    // Let's enforce strict full match on the cleaned raw string.
    const cleanedRaw = rawText.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const STRICT_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;
    const isStrictRegexMatch = STRICT_REGEX.test(cleanedRaw);

    const registeredBuses = await Bus.find({ isActive: true });
    
    // Attempt fuzzy match
    const matchResult = matchPlateToRegisteredBus(rawText, registeredBuses);
    const matchedPlate = matchResult.matchedPlate;

    // RULE: Reads that don't match any registered bus MUST perfectly match the strict regex to be accepted.
    if (!matchedPlate && !isStrictRegexMatch) {
       require('fs').appendFileSync('debug.log', `[${new Date().toISOString()}] Rejected: Not registered and failed strict regex (${cleanedRaw})\n`);
       return res.status(202).json({ message: "Unmatched read and invalid format discarded.", rawText });
    }

    const finalPlate = matchedPlate || cleanedRaw;

    // Clean up old frames from buffer
    const now = Date.now();
    globalFrameBuffer = globalFrameBuffer.filter(f => now - f.timestamp < 3000);

    // Add current frame
    globalFrameBuffer.push({ finalPlate, confidence, timestamp: now });

    // Consensus Check
    let consensusReached = false;

    if (confidence >= 75) {
       consensusReached = true;
    } else {
       const count = globalFrameBuffer.filter(f => f.finalPlate === finalPlate).length;
       if (count >= 2) {
         consensusReached = true;
       }
    }

    if (!consensusReached) {
      return res.status(202).json({ message: "Reading plate...", rawText });
    }

    // Consensus reached, clear buffer for this plate
    globalFrameBuffer = globalFrameBuffer.filter(f => f.finalPlate !== finalPlate);

    // IN/OUT logic with cooldown
    const lastEntry = await BusEntry.findOne({ plateNumber: finalPlate }).sort({ timestamp: -1 });

    if (lastEntry) {
      const timeDiffMs = Date.now() - new Date(lastEntry.timestamp).getTime();
      if (timeDiffMs < 60000) {
        return res.status(409).json({
          message: "Plate already logged recently. Waiting for cooldown.",
          plateNumber: finalPlate
        });
      }
    }

    const status = !lastEntry || lastEntry.status === "OUT" ? "IN" : "OUT";

    const entry = await BusEntry.create({
      plateNumber: finalPlate,
      status,
      imageUrl: plateCropBase64, // Save the crop!
      detectedConfidence: confidence,
      matchedBus: !!matchedPlate, // Boolean flag based on fuzzy match
      matchConfidence: matchResult.score,
      rawOcrText: rawText
    });

    const io = req.app.get("io");
    io.emit("new-entry", entry);

    res.status(201).json({ entry, rawText });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/detect/manual
async function manualEntry(req, res) {
  try {
    const { plateNumber, status, imageUrl } = req.body;
    if (!plateNumber || !status) {
      return res.status(400).json({ message: "plateNumber and status are required" });
    }

    const entry = await BusEntry.create({
      plateNumber: plateNumber.toUpperCase(),
      status,
      imageUrl,
      isManualOverride: true,
      matchedBus: true,
      matchConfidence: 100,
      rawOcrText: "MANUAL"
    });

    const io = req.app.get("io");
    io.emit("new-entry", entry);

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { detectPlate, manualEntry };
