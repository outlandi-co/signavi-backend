import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import User from "../models/User.js"

const router = express.Router()

console.log("🔐 AUTH ROUTES LOADED")

/* ================= REGISTER ================= */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" })
    }

    const existingUser = await User.findOne({ email })

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = new User({
      name: name || "",
      email,
      password: hashedPassword,
      role: role || "customer"
    })

    await user.save()

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
    res.status(500).json({ error: "Registration failed" })
  }
})

/* ================= LOGIN ================= */
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
    res.status(500).json({ error: "Login failed" })
  }
})

/* ================= PROFILE (PROTECTED) ================= */
router.get("/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" })
    }

    const token = authHeader.split(" ")[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await User.findById(decoded.id).select("-password")

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({ user })

  } catch (error) {
    console.error("❌ PROFILE ERROR:", error)
    res.status(401).json({ error: "Invalid token" })
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

    const admin = new User({
      name: "Admin",
      email: "admin@signavi.com",
      password: hashedPassword,
      role: "admin"
    })

    await admin.save()

    res.json({
      message: "Admin created",
      admin
    })

  } catch (err) {
    console.error("❌ CREATE ADMIN ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

export default router