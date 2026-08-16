const mongoose = require("mongoose");

const busSchema = new mongoose.Schema(
  {
    plateNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    routeName: { type: String },
    driverName: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bus", busSchema);
