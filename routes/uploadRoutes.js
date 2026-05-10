import express from "express"
import multer from "multer"

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
})

router.post("/", upload.array("images", 10), (req, res) => {
  try {
    console.log("📥 FILES RECEIVED:", req.files)

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    const urls = req.files.map(file => {
  const base64 = file.buffer.toString("base64")
  return `data:${file.mimetype};base64,${base64}`
})

    res.json({ success: true, urls })

  } catch (err) {
    console.error("❌ UPLOAD ERROR:", err)
    res.status(500).json({ message: "Upload failed" })
  }
})

export default router