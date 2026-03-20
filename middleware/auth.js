import jwt from "jsonwebtoken"

export const requireAuth = (req, res, next) => {
  try {
    let token = null

    /* ---------- 1. Check Cookie ---------- */
    if (req.cookies?.token) {
      token = req.cookies.token
    }

    /* ---------- 2. Check Authorization Header ---------- */
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization

      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1]
      }
    }

    /* ---------- 3. No Token ---------- */
    if (!token) {
      return res.status(401).json({
        error: "Unauthorized: No token provided"
      })
    }

    /* ---------- 4. Validate Secret ---------- */
    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET missing")
      return res.status(500).json({
        error: "Server configuration error"
      })
    }

    /* ---------- 5. Verify Token ---------- */
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    /* ---------- 6. Attach User ---------- */
    req.user = decoded

    next()

  } catch (err) {
    /* ---------- 7. Clean Error Handling ---------- */
    console.error("❌ AUTH ERROR:", err.message)

    return res.status(401).json({
      error: "Unauthorized: Invalid or expired token"
    })
  }
}