import { v2 as cloudinary } from "cloudinary"

/* ================= CONFIG ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

/* ================= DEBUG ================= */
console.log("🌩️ CLOUDINARY CONFIG:", {
  cloud: process.env.CLOUDINARY_CLOUD_NAME || "missing",
  key: process.env.CLOUDINARY_API_KEY ? "exists" : "missing",
  secret: process.env.CLOUDINARY_API_SECRET ? "exists" : "missing"
})

export default cloudinary