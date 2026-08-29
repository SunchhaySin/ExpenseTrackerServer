import express from "express";
import { createWorker } from "tesseract.js";
import { ai, ScanUpload } from "../genkit";
import sharp from "sharp";

const router = express.Router();

// Extracts mime type + raw base64 payload from a data URL string
function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    // no data URL prefix — assume it's already raw base64 with unknown type
    return { mimeType: null, base64: dataUrl };
  }
  return { mimeType: match[1], base64: match[2] };
}

// Converts HEIC/HEIF buffers to JPEG; passes through everything else unchanged
async function normalizeImageBuffer(buffer, mimeType) {
  const isHeic = mimeType === "image/heic" || mimeType === "image/heif";
  if (!isHeic) return buffer;

  try {
    return await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
  } catch (err) {
    console.error("HEIC conversion failed:", err);
    throw new Error(
      "Unable to process this image format. Please try a JPEG or PNG.",
    );
  }
}

async function imageToText(buffer) {
  const worker = await createWorker("eng");
  const {
    data: { text },
  } = await worker.recognize(buffer);
  await worker.terminate();
  return text;
}

// Scan User Uploads Endpoint (Calls Flow in genkit.ts)
router.post("/api/scan", async (req, res) => {
  try {
    const { images } = req.body;

    if (!images) {
      return res.status(400).json({
        success: false,
        error: "imageBase64 is required",
      });
    }

    const { mimeType, base64 } = parseDataUrl(images);
    const rawBuffer = Buffer.from(base64, "base64");

    let normalizedBuffer;
    try {
      normalizedBuffer = await normalizeImageBuffer(rawBuffer, mimeType);
    } catch (conversionErr) {
      return res.status(400).json({
        success: false,
        error: conversionErr.message,
      });
    }

    const extractedText = await imageToText(normalizedBuffer);

    if (!extractedText) {
      return res.status(400).json({ error: "Image not compiled" });
    }

    //   const result = extractedText;
    const result = await ScanUpload(extractedText);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to scan upload",
    });
  }
});

// Developmental Genkit AI Endpoint (Non-production)
router.post("/api/test-ai", async (req, res) => {
  try {
    const { prompt } = req.body;
    const result = await ai.generate({
      prompt: prompt || "Say hello and tell me you are working",
    });
    res.json({
      success: true,
      response: result.text,
    });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/assist", async (req, res) => {
  try {
    const { prompt } = req.body;
    const response = await ai.generate({
      prompt: `You are an personal assistant agent, respond accordingly to the user prompt: ${prompt}`,
    });

    res.json(response.text);
  } catch (err) {
    res.status(500).json(err.message);
  }
});

export default router;
