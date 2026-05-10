import express from "express"
import multer from "multer"

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fieldSize: 25 * 1024 * 1024 // 🔥 25MB
  }
})

router.post("/", upload.array("images", 10), (req, res) => {
  try {
    console.log("📥 FILES RECEIVED:", req.files)

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    const urls = req.files.map(file =>
      `https://dummyimage.com/300x300/000/fff&text=${file.originalname}`
    )

    res.json({ success: true, urls })

  } catch (err) {
    console.error("❌ UPLOAD ERROR:", err)
    res.status(500).json({ message: "Upload failed" })
  }
})

export default router