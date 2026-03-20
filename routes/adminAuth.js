const express = require("express")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")

const router = express.Router()

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

router.post("/login", async (req, res) => {

  const { email, password } = req.body

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

  res.json({ token })
})

module.exports = router