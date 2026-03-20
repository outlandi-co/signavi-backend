import jwt from "jsonwebtoken"

export const requireAuth = (req, res, next) => {

  try {

    let token = null

    /* ---------- Check Cookie ---------- */
    if (req.cookies?.token) {
      token = req.cookies.token
    }

    /* ---------- Check Authorization Header ---------- */
    if (!token && req.headers.authorization) {

      const authHeader = req.headers.authorization

      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1]
      }

    }

    if (!token) {
      return res.status(401).json({
        error: "Unauthorized: No token provided"
      })
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET missing in environment variables")
      return res.status(500).json({
        error: "Server configuration error"
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    req.user = decoded

    next()

  } catch (err) {

    console.error("AUTH ERROR:", err.message)

    return res.status(401).json({
      error: "Unauthorized: Invalid or expired token"
    })

  }

}