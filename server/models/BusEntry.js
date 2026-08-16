const mongoose = require("mongoose");

const busEntrySchema = new mongoose.Schema(
  {
    plateNumber: { type: String, uppercase: true, trim: true },
    status: { type: String, enum: ["IN", "OUT", "UNKNOWN"], required: true },
    timestamp: { type: Date, default: Date.now },
    imageUrl: { type: String },
    detectedConfidence: { type: Number, default: 0 },
    isManualOverride: { type: Boolean, default: false },
    matchedBus: { type: Boolean, default: true },
    matchConfidence: { type: Number, default: 100 },
    rawOcrText: { type: String },
  },
  { timestamps: true }
);

busEntrySchema.index({ plateNumber: 1, timestamp: -1 });

module.exports = mongoose.model("BusEntry", busEntrySchema);
