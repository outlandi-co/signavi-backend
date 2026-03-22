import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import User from "../models/User.js"
import { requireAuth } from "../middleware/auth.js"

const router = express.Router()

/* ---------------- REGISTER ADMIN ---------------- */
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" })
    }

    const existingUser = await User.findOne({ email })

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = new User({
      email,
      password: hashedPassword,
      role: "admin"
    })

    await user.save()

    res.status(201).json({
      message: "Admin user created successfully"
    })

  } catch (error) {
    console.error("Register error:", error)

    res.status(500).json({
      error: "Registration failed"
    })
  }
})

/* ---------------- LOGIN ---------------- */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ error: "Missing credentials" })
    }

    const user = await User.findOne({ email })

    if (!user) {
      return res.status(400).json({ error: "User not found" })
    }

    const validPassword = await bcrypt.compare(password, user.password)

    if (!validPassword) {
      return res.status(400).json({ error: "Invalid password" })
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    )

    // 🔥 IMPORTANT: frontend needs this
    res.json({
      message: "Login successful",
      role: user.role,
      token
    })

  } catch (error) {
    console.error("Login error:", error)

    res.status(500).json({
      error: "Login failed"
    })
  }
})

/* ---------------- PROFILE ---------------- */
router.get("/profile", async (req, res) => {
  console.log("🔥 PROFILE HIT")

  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      console.log("❌ No auth header")
      return res.status(401).json({ error: "No token provided" })
    }

    const token = authHeader.split(" ")[1]

    if (!token) {
      console.log("❌ Token missing after split")
      return res.status(401).json({ error: "Invalid token format" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    console.log("🔑 DECODED:", decoded)

    const user = await User.findById(decoded.id).select("-password")

    if (!user) {
      console.log("❌ User not found in DB")
      return res.status(404).json({ error: "User not found" })
    }

    return res.json({ user })

  } catch (error) {
    console.error("❌ PROFILE ERROR:", error)

    return res.status(401).json({
      error: "Invalid or expired token"
    })
  }
})

export default router