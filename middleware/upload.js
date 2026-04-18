import multer from "multer"

const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 🔥 10MB max (better for print files)
  }
})

export default upload