import jwt from "jsonwebtoken"

export const requireAuth = (req, res, next) => {

  const token = req.cookies?.token

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token" })
  }

  try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    req.user = decoded

    next()

  } catch (err) {

    console.error("AUTH ERROR:", err)

    res.status(401).json({ error: "Invalid token" })

  }
}