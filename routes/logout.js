import express from "express"

const router = express.Router()

router.post("/", (req, res) => {
  // nothing to clear server-side (JWT is client stored)
  res.json({ message: "Logged out" })
})

export default router