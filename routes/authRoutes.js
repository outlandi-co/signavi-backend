import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import nodemailer from "nodemailer"
import User from "../models/User.js"
import { requireAuth } from "../middleware/requireAuth.js"

const router = express.Router()

console.log("🔐 AUTH ROUTES LOADED")

/* ================= REGISTER ================= */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" })
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" })
    }

    const existingUser = await User.findOne({ email })

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await User.create({
      name: name || "",
      email,
      password: hashedPassword,
      role: role || "customer"
    })

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    )

    res.status(201).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })

  } catch (error) {
    console.error("❌ REGISTER ERROR:", error)
    res.status(500).json({ message: "Registration failed" })
  }
})

/* ================= LOGIN ================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ message: "Missing credentials" })
    }

    const user = await User.findOne({ email })

    if (!user) {
      return res.status(400).json({ message: "User not found" })
    }

    const validPassword = await bcrypt.compare(password, user.password)

    if (!validPassword) {
      return res.status(400).json({ message: "Invalid password" })
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    )

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })

  } catch (error) {
    console.error("❌ LOGIN ERROR:", error)
    res.status(500).json({ message: "Login failed" })
  }
})

/* ================= PROFILE ================= */
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password")

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.json({ user })

  } catch (error) {
    console.error("❌ PROFILE ERROR:", error)
    res.status(500).json({ message: "Failed to load profile" })
  }
})

/* ================= CHANGE PASSWORD ================= */
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {}

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current and new password required"
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters"
      })
    }

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    const valid = await bcrypt.compare(currentPassword, user.password)

    if (!valid) {
      return res.status(400).json({
        message: "Incorrect current password"
      })
    }

    user.password = await bcrypt.hash(newPassword, 10)
    await user.save()

    console.log("🔐 PASSWORD UPDATED:", user.email)

    res.json({ message: "Password updated successfully" })

  } catch (err) {
    console.error("❌ CHANGE PASSWORD ERROR:", err)
    res.status(500).json({ message: "Password update failed" })
  }
})

/* ================= FORGOT PASSWORD ================= */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {}

    if (!email) {
      return res.status(400).json({ message: "Email required" })
    }

    const user = await User.findOne({ email })

    if (!user) {
      return res.json({ message: "If that email exists, a reset link was sent." })
    }

    const rawToken = crypto.randomBytes(32).toString("hex")
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex")

    user.resetPasswordToken = hashedToken
    user.resetPasswordExpire = Date.now() + 1000 * 60 * 15

    await user.save()

    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"

    const resetLink = `${FRONTEND_URL}/reset-password/${rawToken}`

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })

    await transporter.sendMail({
      to: user.email,
      subject: "Reset your password",
      html: `
        <h2>Password Reset</h2>
        <p>Click below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>This link expires in 15 minutes.</p>
      `
    })

    console.log("📧 RESET EMAIL SENT:", user.email)

    res.json({ message: "If that email exists, a reset link was sent." })

  } catch (err) {
    console.error("❌ FORGOT PASSWORD ERROR:", err)
    res.status(500).json({ message: "Failed to send reset email" })
  }
})

/* ================= RESET PASSWORD ================= */
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ message: "Password required" })
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex")

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    })

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" })
    }

    user.password = await bcrypt.hash(password, 10)
    user.resetPasswordToken = undefined
    user.resetPasswordExpire = undefined

    await user.save()

    console.log("🔐 PASSWORD RESET SUCCESS:", user.email)

    res.json({ message: "Password reset successful" })

  } catch (err) {
    console.error("❌ RESET PASSWORD ERROR:", err)
    res.status(500).json({ message: "Reset failed" })
  }
})

/* ================= CREATE ADMIN ================= */
router.post("/create-admin", async (req, res) => {
  try {
    const existing = await User.findOne({ email: "admin@signavi.com" })

    if (existing) {
      return res.json({ message: "Admin already exists" })
    }

    const hashedPassword = await bcrypt.hash("123456", 10)

    const admin = await User.create({
      name: "Admin",
      email: "admin@signavi.com",
      password: hashedPassword,
      role: "admin"
    })

    res.json({
      message: "Admin created",
      admin
    })

  } catch (err) {
    console.error("❌ CREATE ADMIN ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router