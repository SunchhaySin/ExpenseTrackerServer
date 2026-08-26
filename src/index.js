import express from "express";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import cors from "cors";
import dotenv from "dotenv";
import { expressHandler } from "@genkit-ai/express";
import { createWorker } from "tesseract.js";
import { ai, ScanUpload } from "./genkit.js";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cookieParser());

const allowedOrigins = [process.env.FRONTEND_URL];
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost:5173");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  }),
);

const connection = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl:
    process.env.DB_SSL === "true"
      ? { minVersion: "TLSv1.2", rejectUnauthorized: true }
      : undefined,
});

// Server Test Endpoint
app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});
// Get all users (as a test)
app.get("/users", (req, res) => {
  try {
    const query = "SELECT * FROM User";
    connection.query(query, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Fetch Failed" });
      }
      res.json({ message: result });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server Error" });
  }
});

// User Register Endpoint
app.post("/reg", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Missing Registration Fields" });
    }

    const encryptPass = await bcrypt.hash(password, 10);
    const query = "INSERT INTO User (username, email, password) VALUES (?,?,?)";
    connection.query(query, [username, email, encryptPass], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Database Insert Failed" });
      }
      res.json({ message: result });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server Encountered An Error" });
  }
});

// User Login Endpoint
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Enter Login Credentials" });
    }
    const query = "SELECT * FROM User WHERE email = ?";
    connection.query(query, [email], async (err, result) => {
      if (err) {
        console.error(err);
        console.log(err);
        return res.status(500).json({ error: "Database " });
      }

      if (result.length == 0) {
        return res.status(401).json({ error: "Incorrect Credentials" });
      }
      const user = result[0];
      const pass = await bcrypt.compare(password, user.password);

      if (!pass) {
        return res.status(401).json({ error: "Error Login" });
      }

      // create token with user data inside
      const token = jwt.sign(
        { userID: user.userID, username: user.username, email: user.email },
        SECRET,
        { expiresIn: "7d" }, // token expires in 7 days
      );
      // set token as cookie
      res.cookie("token", token, {
        httpOnly: true, // JS cannot access it
        secure: true, // set to true in production (HTTPS)
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      });

      res.json({
        message: "Login Success",
        username: user.username,
        email: user.email,
        userID: user.userID,
      });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login Failed" });
  }
});

app.get("/auth/me", (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    console.log(decoded);
    res.json({
      userID: decoded.userID,
      username: decoded.username,
      email: decoded.email,
    });
  } catch (err) {
    console.lerror(err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

app.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.json({ success: true, message: "Logged out" });
});

//Tesseract: transform image into text
async function imageTranslate(file) {
  const worker = await createWorker("eng");
  const {
    data: { text },
  } = await worker.recognize(file);
  await worker.terminate();
  return text;
}

// Scan User Uploads Endpoint (Calls Flow in genkit.ts)
app.post("/api/scan", async (req, res) => {
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

// Inserting uploads into Database Table
app.post("/save/uploads", async (req, res) => {
  const { data, userID } = req.body;
  if (!data || !userID) {
    return res.status(400).json({ error: "Missing Upload Data or User ID" });
  }

  const uploads = Array.isArray(data) ? data : [data];
  const results = [];

  const conn = await connection.getConnection();
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
      message: "Batch Insertion Complete",
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

// // Inserting into Database Receipt Table
// app.post(`/upload/receipt`, async (req, res) => {
//   console.log("Received:", req.body);
//   try {
//     const { userID, type, items, total_amount, biller, currency, date, time } =
//       req.body;
//     console.log("Items:", items, typeof items);
//     if (
//       !userID ||
//       !type ||
//       !items ||
//       !total_amount ||
//       !biller ||
//       !currency ||
//       !date ||
//       !time
//     ) {
//       return res.status(400).json({ error: "No Receipt found" });
//     }

//     const query = `INSERT IGNORE INTO Receipts (userID, type, items, total_amount, biller, currency, date, time)
//                          VALUES(?, ?, ?, ?, ?, ?, ?, ?) `;

//     const values = [
//       userID,
//       type,
//       JSON.stringify(items),
//       total_amount,
//       biller,
//       currency,
//       date,
//       time || null,
//     ];

//     connection.query(query, values, (err, results) => {
//       if (err) {
//         console.error(err);
//         return res.status(500).json({ error: "Database Error" });
//       }

//       if (results.affectedRows === 0) {
//         return res.status(409).json({ error: "Duplicate Receipt" });
//       }
//       const response = results;
//       res.json({
//         sucess: true,
//         message: "Databse Insertion Success",
//         data: response,
//       });
//     });
//   } catch (err) {
//     res.status(500).json({
//       message: false,
//       error: err.message,
//     });
//   }
// });

// Fetch all uploads by userId, with their associated images
app.get("/fetch/upload/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const [uploads] = await connection.query(
      `SELECT * FROM Uploads WHERE userID = ? ORDER BY transaction_date DESC`,
      [id],
    );

    if (uploads.length === 0) {
      return res.status(404).json({ error: "No uploads found" });
    }

    const uploadIDs = uploads.map((u) => u.id);

    const [images] = await connection.query(
      `SELECT id, uploadID, mime_type, image_data FROM Uploaded_Images WHERE uploadID IN (?)`,
      [uploadIDs],
    );

    // Group images by uploadID
    const imagesByUpload = {};
    for (const img of images) {
      if (!imagesByUpload[img.uploadID]) imagesByUpload[img.uploadID] = [];
      imagesByUpload[img.uploadID].push({
        id: img.id,
        mimeType: img.mime_type,
        image: `data:${img.mime_type};base64,${img.image_data.toString("base64")}`,
      });
    }

    const data = uploads.map((upload) => ({
      ...upload,
      items: typeof upload.items === "string" ? JSON.parse(upload.items) : upload.items,
      images: imagesByUpload[upload.id] ?? [],
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

// Fetch all Receipts by userId
app.get("/fetch/receipt/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const query = `SELECT * FROM Receipts WHERE userID=?`;
    connection.query(query, [id], (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }

      if (result.length === 0) {
        return res.status(404).json({ error: "No receipts found" });
      }

      res.json({ success: true, data: result });
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Delete Uploads by id
app.delete("/delete/invoice/:userID/:uploadID", async (req, res) => {
  try {
    const { userID, uploadID } = req.params;
    const query = "DELETE FROM Invoices WHERE userID = ? AND uploadID = ?";
    const result = connection.query(query, [userID, uploadID]);

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Deletion Failed",
      error: err.message,
    });
  }
});

app.delete("/delete/receipt/:userID/:uploadID", async (req, res) => {
  try {
    const { userID, uploadID } = req.params;
    const query = "DELETE FROM Receipts WHERE userID = ? AND receiptID = ?";
    const result = connection.query(query, [userID, uploadID]);

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Deletion Failed",
      error: err.message,
    });
  }
});

// Genkit AI Endpoint
app.post("/api/test-ai", async (req, res) => {
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

app.post("/assist", async (req, res) => {
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

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});

// module.exports = app;
export default app;
