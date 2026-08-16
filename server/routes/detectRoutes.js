const express = require("express");
const router = express.Router();
const { detectPlate, manualEntry } = require("../controllers/detectController");
const { verifyToken } = require("../middleware/auth");

router.post("/", detectPlate); // public: capture page hits this
router.post("/manual", verifyToken, manualEntry); // admin only: manual correction

module.exports = router;
