import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { connection } from "../utils/db";

const router = express.Router();
const SECRET = process.env.JWT_SECRET;

// User Register Endpoint
router.post("/reg", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Missing Registration Fields" });
    }

    if(password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
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
router.post("/login", async (req, res) => {
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
        return res.status(500).json({ error: "Database Error" });
      }

      if (result.length == 0) {
        return res.status(401).json({ error: "Incorrect Credentials" });
      }
      const user = result[0];
      const pass = await bcrypt.compare(password, user.password);

      if (!pass) {
        return res.status(401).json({ error: "Incorrect Credentials" });
      }

      // create token with user data inside
      const token = jwt.sign(
        { userID: user.userID, username: user.username, email: user.email },
        SECRET,
        { expiresIn: "7d" }, // token expires in 7 days
      );

      res.json({
        message: "Login Success",
        username: user.username,
        email: user.email,
        userID: user.userID,
        token,
      });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login Failed" });
  }
});

router.get("/auth/me", (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    const query = "SELECT userID, username, email FROM User WHERE userID = ?";
    connection.query(query, [decoded.userID], (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Database Error" });
      }

      if (rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(rows[0]); // { userID, username, email }
    });
  } catch (err) {
    console.error(err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

export default router