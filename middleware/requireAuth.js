import jwt from "jsonwebtoken"

export const requireAuth = (req, res, next) => {

  let token

  /* ================= GET TOKEN ================= */

  // 1. Try Authorization header (PRIMARY)
  const authHeader = req.headers.authorization

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1]
  }

  // 2. Fallback to cookies (optional support)
  if (!token && req.cookies?.token) {
    token = req.cookies.token
  }

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token" })
  }

  /* ================= VERIFY TOKEN ================= */

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    req.user = decoded

    next()

  } catch (err) {
    console.error("AUTH ERROR:", err)
    res.status(401).json({ error: "Invalid token" })
  }
}