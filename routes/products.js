import express from "express"
import Product from "../models/Product.js"
import multer from "multer"

const router = express.Router()

/* ================= MULTER ================= */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname)
  }
})

const upload = multer({ storage })

/* ================= GET ================= */
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 })
    res.json(products)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* ================= CREATE ================= */
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const product = await Product.create({
      name: req.body.name,
      description: req.body.description || "",
      category: (req.body.category || "general").toLowerCase(),

      cost: Number(req.body.cost) || 0,
      price: Number(req.body.price) || Number(req.body.cost) || 0,

      stock: Number(req.body.stock) || 0,

      image: req.file ? req.file.path : null
    })

    res.json(product)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* ================= UPDATE ================= */
router.put("/:id", async (req, res) => {
  try {
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        price: Number(req.body.price) || 0,
        cost: Number(req.body.cost) || 0,
        stock: Number(req.body.stock) || 0
      },
      { new: true }
    )

    res.json(updated)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  await Product.findByIdAndDelete(req.params.id)
  res.json({ message: "Deleted" })
})

export default router