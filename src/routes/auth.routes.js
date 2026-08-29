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

router.get("/auth/me", (req, res) => {
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

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.json({ success: true, message: "Logged out" });
});

export default router