import express from "express";
import { createWorker } from "tesseract.js";
import { ai, ScanUpload } from "../genkit";

const router = express.Router();

async function imageTranslate(file) {
  const worker = await createWorker("eng");
  const { data: { text }} = await worker.recognize(file);
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

    const extractedText = await imageTranslate(images);

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

export default router