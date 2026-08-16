require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const detectRoutes = require("./routes/detectRoutes");
const entryRoutes = require("./routes/entryRoutes");
const busRoutes = require("./routes/busRoutes");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "*", methods: ["GET", "POST"] },
});

// Make io available inside controllers via req.app
app.set("io", io);

app.use(cors());
app.use(express.json({ limit: "10mb" })); // base64 images can be large
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/api/detect", detectRoutes);
app.use("/api/entries", entryRoutes);
app.use("/api/buses", busRoutes);

app.get("/", (req, res) => res.send("Bus Gate System API running"));

io.on("connection", (socket) => {
  console.log("Admin dashboard connected:", socket.id);
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});