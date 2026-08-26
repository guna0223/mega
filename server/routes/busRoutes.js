const express = require("express");
const router = express.Router();
const { getBuses, getBusesWithStatus } = require("../controllers/busController");

// IMPORTANT: /status must be registered BEFORE any "/:id" route,
// otherwise Express will treat "status" as an :id param.
router.get("/status", getBusesWithStatus);
router.get("/", getBuses);

module.exports = router;