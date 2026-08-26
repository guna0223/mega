const BusEntry = require("../models/BusEntry");

// GET /api/entries?plateNumber=&status=&from=&to=&page=&limit=&matchedBus=
async function getEntries(req, res) {
  try {
    const { plateNumber, status, from, to, page = 1, limit = 20, matchedBus } = req.query;

    const filter = {};
    if (plateNumber) filter.plateNumber = new RegExp(plateNumber, "i");
    if (status) filter.status = status;
    if (matchedBus !== undefined) filter.matchedBus = matchedBus === 'true';
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }

    const entries = await BusEntry.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await BusEntry.countDocuments(filter);

    res.json({ entries, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PUT /api/entries/:id/assign
// Body: { plateNumber: "TN3815131" }
async function assignEntry(req, res) {
  try {
    const { id } = req.params;
    const { plateNumber } = req.body;
    
    if (!plateNumber) return res.status(400).json({ message: "plateNumber required" });

    // When assigning, we assume they are making it a valid entry.
    // Determine IN/OUT status based on last entry of this new plate before this timestamp
    const entry = await BusEntry.findById(id);
    if (!entry) return res.status(404).json({ message: "Entry not found" });

    const lastEntry = await BusEntry.findOne({ 
      plateNumber, 
      timestamp: { $lt: entry.timestamp } 
    }).sort({ timestamp: -1 });

    const newStatus = !lastEntry || lastEntry.status === "OUT" ? "IN" : "OUT";

    entry.plateNumber = plateNumber;
    entry.status = newStatus;
    entry.matchedBus = true;
    entry.matchConfidence = 100; // Manually assigned
    entry.isManualOverride = true;

    await entry.save();

    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}


// GET /api/entries/stats -- e.g. how many buses currently "inside" campus
async function getStats(req, res) {
  try {
    // Get latest entry per plate number
    const latestPerPlate = await BusEntry.aggregate([
      { $sort: { timestamp: -1 } },
      { $group: { _id: "$plateNumber", latestStatus: { $first: "$status" } } },
    ]);

    const currentlyIn = latestPerPlate.filter((p) => p.latestStatus === "IN").length;
    const totalEntriesToday = await BusEntry.countDocuments({
      timestamp: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    });

    res.json({
      busesCurrentlyIn: currentlyIn,
      totalKnownBuses: latestPerPlate.length,
      totalEntriesToday,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/entries/export-last-month
async function exportLastMonth(req, res) {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    const entries = await BusEntry.find({
      timestamp: { $gte: oneMonthAgo }
    }).sort({ timestamp: -1 });
    
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// DELETE /api/entries/delete-last-month
async function deleteLastMonth(req, res) {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    const result = await BusEntry.deleteMany({
      timestamp: { $gte: oneMonthAgo }
    });
    
    res.json({ message: `Deleted ${result.deletedCount} entries from the last month.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getEntries, getStats, assignEntry, exportLastMonth, deleteLastMonth };
