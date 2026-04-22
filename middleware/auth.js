import jwt from "jsonwebtoken"

export const requireAuth = (req, res, next) => {
  try {
    let token = null

    /* ================= 1. CHECK COOKIE ================= */
    if (req.cookies?.token) {
      token = req.cookies.token
    }

    /* ================= 2. CHECK HEADER ================= */
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization

      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1]
      }
    }

    /* ================= 3. NO TOKEN ================= */
    if (!token) {
      return res.status(401).json({
        message: "Unauthorized: No token provided"
      })
    }

    /* ================= 4. VERIFY SECRET ================= */
    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET missing")
      return res.status(500).json({
        message: "Server configuration error"
      })
    }

    /* ================= 5. VERIFY TOKEN ================= */
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    /* ================= 6. ATTACH CLEAN USER ================= */
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email
    }

    /* ================= DEBUG ================= */
    console.log("🔐 AUTH USER:", req.user.id)

    next()

  } catch (err) {
    console.error("❌ AUTH ERROR:", err.message)

    return res.status(401).json({
      message: "Unauthorized: Invalid or expired token"
    })
  }
}