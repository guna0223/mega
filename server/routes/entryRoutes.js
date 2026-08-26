const express = require("express");
const router = express.Router();
const { getEntries, getStats, assignEntry, exportLastMonth, deleteLastMonth } = require("../controllers/entryController");
const { verifyToken } = require("../middleware/auth");

router.get("/export-last-month", verifyToken, exportLastMonth);
router.delete("/delete-last-month", verifyToken, deleteLastMonth);
router.get("/", verifyToken, getEntries);
router.get("/stats", verifyToken, getStats);
router.put("/:id/assign", verifyToken, assignEntry);

module.exports = router;
