const Tesseract = require("tesseract.js");
const levenshtein = require("fast-levenshtein");

// Indian plate format, e.g. TN37AB1234 (loosely matches most state formats)
const PLATE_REGEX = /[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}/;

/**
 * Normalizes common OCR misreads in plate numbers.
 * @param {string} text - The raw OCR text
 * @returns {string} The normalized text
 */
function normalizeCommonMisreads(text) {
  return text
    .replace(/I/g, "1")
    .replace(/O/g, "0")
    .replace(/B/g, "8")
    .replace(/S/g, "5")
    .replace(/L/g, "1");
}

/**
 * Matches raw OCR text against a list of registered bus plates using Levenshtein distance.
 * @param {string} rawText - The raw OCR text
 * @param {Array<{plateNumber: string}>} registeredPlates - List of registered buses
 * @returns {{ matchedPlate: string | null, score: number, raw: string }}
 */
function matchPlateToRegisteredBus(rawText, registeredPlates) {
  if (!rawText) return { matchedPlate: null, score: 0, raw: rawText };
  
  const cleanedRaw = rawText.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const correctedRaw = normalizeCommonMisreads(cleanedRaw);

  let bestMatch = null;
  let minDistance = Infinity;
  let maxLen = 1;

  for (const bus of registeredPlates) {
    const target = bus.plateNumber.toUpperCase();
    
    // Compare against both raw and corrected versions
    const dist1 = levenshtein.get(cleanedRaw, target);
    const dist2 = levenshtein.get(correctedRaw, target);
    
    const dist = Math.min(dist1, dist2);

    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = bus.plateNumber;
      maxLen = Math.max(cleanedRaw.length, target.length);
    }
  }

  // If distance is <= 2, we consider it a match
  if (minDistance <= 2 && bestMatch) {
    // Calculate a rough similarity score (0 to 100)
    const score = Math.max(0, 100 - (minDistance / maxLen) * 100);
    return { matchedPlate: bestMatch, score, raw: cleanedRaw };
  }

  return { matchedPlate: null, score: 0, raw: cleanedRaw };
}

/**
 * Runs OCR on a base64 image string and tries to extract a clean plate number.
 * @param {string} base64Image - data URL or raw base64 string
 * @returns {Promise<{plateNumber: string|null, confidence: number, rawText: string}>}
 */
async function extractPlateNumber(base64Image) {
  const {
    data: { text, confidence },
  } = await Tesseract.recognize(base64Image, "eng", {
    // logger: (m) => console.log(m), // uncomment to debug progress
  });

  // Clean OCR noise: keep only A-Z and 0-9, uppercase everything
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const match = cleaned.match(PLATE_REGEX);

  return {
    plateNumber: match ? match[0] : null, // This is just the regex matched chunk, we'll use rawText for fuzzy matching
    confidence: confidence || 0,
    rawText: text.trim(),
  };
}

module.exports = { extractPlateNumber, matchPlateToRegisteredBus, PLATE_REGEX };

