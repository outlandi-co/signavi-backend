import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"

const router = express.Router()

/* ================= UPLOAD DIR ================= */

const uploadDir = path.join(process.cwd(), "uploads")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

/* ================= STORAGE ================= */

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, uploadDir)
  },

  filename: (_, file, cb) => {
    const unique =
      Date.now() + "-" + Math.round(Math.random() * 1e9)

    const ext = path.extname(file.originalname)

    cb(null, `${unique}${ext}`)
  }
})

/* ================= FILE FILTER ================= */

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"]

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, WEBP allowed"), false)
  }

  cb(null, true)
}

/* ================= MULTER ================= */

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
})

/* ================= ROUTE ================= */

// POST /api/upload
router.post("/", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      })
    }

    const fileUrl = `/uploads/${req.file.filename}`

    console.log("📤 FILE UPLOADED:", fileUrl)

    return res.json({
      success: true,
      url: fileUrl
    })

  } catch (err) {
    console.error("❌ UPLOAD ERROR:", err)

    return res.status(500).json({
      success: false,
      message: "Upload failed"
    })
  }
})

export default router