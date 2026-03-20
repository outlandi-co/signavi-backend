import express from "express"

const router = express.Router()

router.post("/", (req, res) => {

  res.clearCookie("token")

  res.json({ message: "Logged out" })

})

export default router