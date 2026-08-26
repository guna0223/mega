const Bus = require("../models/Bus");
const BusEntry = require("../models/BusEntry");

// GET /api/buses
async function getBuses(req, res) {
  try {
    const buses = await Bus.find({ isActive: true }).sort({ plateNumber: 1 });
    res.json(buses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/buses/status
// Returns every registered bus with its current IN/OUT status
// (derived from the most recent matched BusEntry for that plate),
// plus the last scan's image/time/confidence — everything the
// admin table needs in a single call.
async function getBusesWithStatus(req, res) {
  try {
    const { plateNumber, status } = req.query;

    const busQuery = { isActive: true };
    if (plateNumber) {
      busQuery.plateNumber = { $regex: plateNumber, $options: "i" };
    }

    const buses = await Bus.find(busQuery).sort({ plateNumber: 1 }).lean();

    const busesWithStatus = await Promise.all(
      buses.map(async (bus) => {
        const latestEntry = await BusEntry.findOne({
          plateNumber: bus.plateNumber,
          matchedBus: true,
        })
          .sort({ timestamp: -1 })
          .lean();

        return {
          ...bus,
          status: latestEntry ? latestEntry.status : "OUT", // never scanned = treat as OUT
          lastSeen: latestEntry ? latestEntry.timestamp : null,
          image: latestEntry ? (latestEntry.image || latestEntry.imageUrl) : null,
          detectedConfidence: latestEntry ? latestEntry.matchConfidence : null,
        };
      })
    );

    const filtered = status
      ? busesWithStatus.filter((b) => b.status === status)
      : busesWithStatus;

    res.json({ buses: filtered });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getBuses, getBusesWithStatus };