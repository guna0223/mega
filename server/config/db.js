const mongoose = require("mongoose");
const dns = require("dns");

// Fix for "querySrv ECONNREFUSED _mongodb._tcp..." on Windows.
// Many Windows/router DNS resolvers can't handle the SRV record lookups
// that mongodb+srv:// URIs require. Forcing Node to use Google's DNS
// resolves this without touching your OS network settings.
dns.setServers([
  "8.8.8.8",
  "8.8.4.4",
]);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;