const BusEntry = require("../models/BusEntry");
const Bus = require("../models/Bus");

// We no longer need local OCR, everything is handled by strong Python API endpoint
// We just act as a proxy and WebSocket emitter.

// POST /api/detect
async function detectPlate(req, res) {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ message: "No image provided" });

    // Call Python endpoint that does OCR, IN/OUT, and DB saving
    const response = await fetch("http://localhost:5001/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image })
    });
    
    if (!response.ok) {
      if (response.status === 409) {
          const data = await response.json();
          return res.status(409).json(data);
      }
      if (response.status === 202) {
          const data = await response.json();
          return res.status(202).json(data);
      }
      throw new Error(`Python service returned ${response.status}`);
    }

    const data = await response.json();
    
    // The Python endpoint returns the created entry from DB
    if (data.entry) {
        // Emit to all connected React clients to update the UI in real-time
        const io = req.app.get("io");
        io.emit("new-entry", data.entry);
        
        return res.status(201).json(data);
    } else {
        return res.status(202).json({ message: "Reading plate..." });
    }

  } catch (err) {
    if (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED")) {
        return res.status(503).json({ message: "Python detection service is offline" });
    }
    console.error(err);
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
