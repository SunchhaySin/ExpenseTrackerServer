import jwt from "jsonwebtoken";

export default function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    const status = err.name === "TokenExpiredError" ? 401 : 403;
    return res.status(status).json({ error: "Invalid or expired token" });
  }
}