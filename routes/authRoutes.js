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

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24
    })

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

/* ---------------- PROFILE (PROTECTED ROUTE) ---------------- */

router.get("/profile", requireAuth, async (req, res) => {

  try {

    const user = await User.findById(req.user.id).select("-password")

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      message: "Authenticated user",
      user
    })

  } catch (error) {

    console.error("Profile error:", error)

    res.status(500).json({
      error: "Failed to fetch profile"
    })

  }

})

export default router