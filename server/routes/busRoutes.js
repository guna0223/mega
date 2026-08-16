const express = require("express");
const router = express.Router();
const { getBuses } = require("../controllers/busController");
const { verifyToken } = require("../middleware/auth");

router.get("/", verifyToken, getBuses);

module.exports = router;
