import express from "express";
import { connection, connectionPromise } from "../utils/db";

const router = express.Router();

// Inserting uploads into Database Table
router.post("/save/uploads", async (req, res) => {
  const { uploadItems  } = req.body;
  const userID = req.user.userID;

  if (!uploadItems) {
    return res.status(400).json({ error: "Missing Upload Data" });
  }

  const uploads = Array.isArray(uploadItems) ? uploadItems : [uploadItems];
  const results = [];

  const conn = await connectionPromise.getConnection();
  try {
    await conn.beginTransaction();

    for (const item of uploads) {
      const transactionDate = item.date
        ? `${item.date} ${item.time ?? "00:00:00"}`
        : null;

      const [existing] = await conn.query(
        `SELECT id FROM Uploads
         WHERE userID = ? AND paidTo = ? AND total_amount = ? AND transaction_date <=> ?
         LIMIT 1`,
        [userID, item.name, item.amount, transactionDate],
      );

      if (existing.length > 0) {
        results.push({
          success: false,
          duplicate: true,
          existingId: existing[0].id,
          paidTo: item.name,
        });
        continue;
      }

      const [uploadResult] = await conn.query(
        `INSERT INTO Uploads (userID, paidTo, total_amount, currency, transaction_date, sender_name, payment_method, items)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userID,
          item.name,
          item.amount,
          item.currency,
          transactionDate,
          item.senderName ?? null,
          item.paymentMethod ?? null,
          JSON.stringify(item.items ?? []),
        ],
      );

      const uploadID = uploadResult.insertId;

      if (item.image) {
        // strip a data URL prefix like "data:image/jpeg;base64," if present
        const base64Payload = item.image.includes(",")
          ? item.image.split(",")[1]
          : item.image;
        const imageBuffer = Buffer.from(base64Payload, "base64");

        await conn.query(
          `INSERT INTO Uploaded_Images (uploadID, mime_type, image_data) VALUES (?, ?, ?)`,
          [uploadID, item.mimeType ?? "application/octet-stream", imageBuffer],
        );
      }

      results.push({
        success: true,
        id: uploadID,
        paidTo: item.name,
      });
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Uploaded Scanned and Saved Successfully",
      data: results,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err)
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  } finally {
    conn.release();
  }
});

// Fetch all uploads by userId, with their associated images
router.get("/fetch/upload", async (req, res) => {
  try {
    const userId = req.user.userID;

    const [uploads] = await connectionPromise.query(
      `SELECT * FROM Uploads WHERE userID = ? ORDER BY transaction_date DESC`,
      [userId],
    );

    if (uploads.length === 0) {
      return res.status(404).json({ error: "No uploads found" });
    }

    const uploadIDs = uploads.map((u) => u.id);

    const [images] = await connectionPromise.query(
      `SELECT id, uploadID, mime_type, image_data FROM Uploaded_Images WHERE uploadID IN (?)`,
      [uploadIDs],
    );
    
    // Match Image to uploaded file
    const uploadedImage = {};

    for (const img of images) {
     uploadedImage[img.uploadID] = {
        id: img.id,
        mimeType: img.mime_type,
        image: `data:${img.mime_type};base64,${img.image_data.toString("base64")}`,
      };
    }

    const data = uploads.map((upload) => ({
      ...upload,
      items: typeof upload.items === "string" ? JSON.parse(upload.items) : upload.items,
      image: uploadedImage[upload.id] ?? null,
    }));


    return res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});


// Delete Uploads by id
router.delete("/delete/upload/:uploadID", async (req, res) => {
  try {
    const { uploadID } = req.params;
    const userID = req.user.userID; // from user's web token
    const query = "DELETE FROM Uploads WHERE userID = ? AND id = ?";
    const result = connection.query(query, [userID, uploadID], async(err, result) => {
      if(err) {
        console.error(err);
        return res.status(500).json({ error: "Database Error" });
      }

      if(result.affectedRows === 0) {
        return res.status(404).json({ error: "Upload not found" });
      }
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error(err)
    return res.status(500).json({
      message: "Deletion Failed",
      error: err.message,
    });
  }
});

router.patch("/rename/upload/:uploadID", async (req, res) => {
  try{
    const { uploadID } = req.params;
    const { fileName } = req.body;
    const userID = req.user.userID; // from user's web token


    if (!fileName || typeof fileName !== "string" || fileName.trim().length === 0) {
      return res.status(400).json({ message: "Missing or invalid fileName" });
    }

    // Using the Promise Based instead the callback response from connection
    const [result] = await connectionPromise.query(
      `UPDATE Uploads SET name = ? WHERE userID = ? AND Id = ?`,
      [fileName, userID, uploadID] 
    );

    if(result.affectedRows === 0) {
      return res.status(404).json({error: "Upload Not Found, could not perform action"})
    }

     return res.json({
      success: true,
      data: result,
    });
  } catch(err) {
    console.error(err)
    return res.status(500).json({
      message: "Failed to rename file",
      error: err.message,
    });
  }
})

export default router