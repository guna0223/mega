const express = require("express");
const router = express.Router();
const { getEntries, getStats, assignEntry } = require("../controllers/entryController");
const { verifyToken } = require("../middleware/auth");

router.get("/", verifyToken, getEntries);
router.get("/stats", verifyToken, getStats);
router.put("/:id/assign", verifyToken, assignEntry);

module.exports = router;
