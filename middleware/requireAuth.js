import jwt from "jsonwebtoken"

export const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      return res.status(401).json({ error: "No token" })
    }

    const token = authHeader.split(" ")[1]

    let decoded

    /* 🔥 TRY JWT FIRST (ADMIN) */
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch {
      /* 🔥 FALLBACK: CUSTOMER BASE64 */
      try {
        decoded = JSON.parse(Buffer.from(token, "base64").toString())
      } catch {
        return res.status(401).json({ error: "Invalid token" })
      }
    }

    req.user = decoded

    console.log("👤 AUTH USER:", decoded)

    next()

  } catch (err) {
    console.error("❌ AUTH ERROR:", err.message)
    res.status(401).json({ error: "Unauthorized" })
  }
}