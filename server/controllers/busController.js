const Bus = require("../models/Bus");

// GET /api/buses
async function getBuses(req, res) {
  try {
    const buses = await Bus.find({ isActive: true }).sort({ plateNumber: 1 });
    res.json(buses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getBuses };
