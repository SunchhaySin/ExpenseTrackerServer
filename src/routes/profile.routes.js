import express from "express";
import { connection } from "../utils/db";
import bcrypt from "bcrypt";

const router = express.Router();

router.patch("/profile/update/email", async (req, res) => {
  const { email } = req.body;
  const userID = req.user.userID; // from verify token

  if (email === undefined || email.trim() === "") {
    return res.status(400).json({ error: "Missing email" });
  }

  if (email.endsWith(".com") === false) {
    return res
      .status(400)
      .json({ error: "Invalid email format, excpected (.com)" });
  }

  try {
    const checkQuery = "SELECT email FROM User WHERE userID = ?";
    connection.query(checkQuery, [userID], (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Database Error" });
      }

      if (rows.length === 0) {
        return res.status(404).json({ error: "Profile Error: User not found" });
      }

      const currentEmail = rows[0].email;

      if (currentEmail.toLowerCase() === email.trim().toLowerCase()) {
        return res
          .status(400)
          .json({ error: "New email is the same as current email" });
      }

      const query = "UPDATE User SET email = ? WHERE userID = ?";
      connection.query(query, [email, userID], async (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Database Error" });
        }

        if (result.affectedRows === 0) {
          return res
            .status(404)
            .json({ error: "Profile Error: Email not found" });
        }

        res.json({
          message: "Profile: Email updated successfully: " + email,
          data: email,
        });
      });
    });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

router.patch("/profile/update/username", async (req, res) => {
  const { username } = req.body;
  const userID = req.user.userID; // from verify token

  if (username === undefined || username.trim() === "") {
    return res.status(400).json({ error: "Missing username" });
  }

  try {
    const checkQuery = "SELECT username FROM User WHERE userID = ?";
    connection.query(checkQuery, [userID], (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Database Error" });
      }

      if (rows.length === 0) {
        return res.status(404).json({ error: "Profile Error: User not found" });
      }

      const currentUsername = rows[0].username;

      if (currentUsername.toLowerCase() === username.trim().toLowerCase()) {
        return res
          .status(400)
          .json({ error: "New username is the same as current username" });
      }

      const query = "UPDATE User SET username = ? WHERE userID = ?";
      connection.query(query, [username, userID], async (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Database Error" });
        }

        if (result.affectedRows === 0) {
          return res
            .status(404)
            .json({ error: "Profile Error: Username not found" });
        }

        res.json({
          message: "Profile: Username updated successfully: " + username,
          data: username,
        });
      });
    });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

router.patch("/profile/update/password", async (req, res) => {
  const { password, confirmPassword } = req.body;
  const userID = req.user.userID; // from verify token

  if (!password || password.trim() === "") {
    return res.status(400).json({ error: "Missing password" });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters long" });
  }

  const ecryptedPassword = await bcrypt.hash(password, 10);

  try {
    const query = "UPDATE User SET password = ? WHERE userID = ?";
    connection.query(query, [ecryptedPassword, userID], async (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Database Error" });
      }

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ error: "Profile Error: Password not found" });
      }

      res.json({ message: "Profile: Password updated successfully" });
    });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

router.post("/profile/picture/save", async (req, res) => {
  const { image } = req.body;
  const userID = req.user.userID; // from verify token

  if (!image || image.trim() === "") {
    return res.status(400).json({ error: "Image File Not Found" });
  }

  try {
    const base64Payload = image.includes(",") ? image.split(",")[1] : image;
    const imageBuffer = Buffer.from(base64Payload, "base64");

    const query = `
        INSERT INTO Profile_Picture
          (userID, mime_type, image_data)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          mime_type = VALUES(mime_type),
          image_data = VALUES(image_data)
      `;

    connection.query(
      query,
      [userID, "image/png", imageBuffer],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Database Error" });
        }

        res.json({
          message: "Profile Picture Saved Successfully",
          data: result,
        });
      },
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

router.get("/profile/picture", async (req, res) => {
  const userID = req.user.userID; // from verify token ]
  try{
    const query = "SELECT mime_type, image_data FROM Profile_Picture WHERE userID = ?";
    connection.query(query, [userID], (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Database Error" });
      } 

      if (rows.length === 0) {
        return res.status(404).json({ error: "No Profile Picture" });
      }

      const { mime_type, image_data } = rows[0];

      // Convert Buffer to Base64 string
      const base64String = Buffer.from(image_data).toString("base64");

      // Format as a complete Data URL ready for <img src="..." />
      const imageDataUrl = `data:${mime_type || "image/jpeg"};base64,${base64String}`;
     
      return res.json({ profileImage: imageDataUrl });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

export default router;
