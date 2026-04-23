const express = require("express")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")

const router = express.Router()

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: "Missing credentials" })
    }

    if (email !== ADMIN_EMAIL) {
      return res.status(401).json({ message: "Invalid email" })
    }

    const match = await bcrypt.compare(password, ADMIN_PASSWORD)

    if (!match) {
      return res.status(401).json({ message: "Invalid password" })
    }

    const token = jwt.sign(
      { role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    )

    /* 🔥 RETURN USER OBJECT */
    return res.json({
      token,
      user: {
        email: ADMIN_EMAIL,
        role: "admin"
      }
    })

  } catch (err) {
    console.error("❌ LOGIN ERROR:", err)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router