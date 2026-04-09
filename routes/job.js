import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"

const router = express.Router()

/* ================= UNIVERSAL DELETE ================= */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("🧪 UNIVERSAL DELETE:", id)

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID" })
    }

    /* 🔥 TRY ORDER FIRST */
    let deleted = await Order.findByIdAndDelete(id)

    if (deleted) {
      console.log("🗑️ DELETED ORDER:", id)

      req.app.get("io")?.emit("jobDeleted", id)

      return res.json({
        success: true,
        type: "order",
        id
      })
    }

    /* 🔥 TRY QUOTE */
    deleted = await Quote.findByIdAndDelete(id)

    if (deleted) {
      console.log("🗑️ DELETED QUOTE:", id)

      req.app.get("io")?.emit("jobDeleted", id)

      return res.json({
        success: true,
        type: "quote",
        id
      })
    }

    /* ❌ NOT FOUND ANYWHERE */
    return res.status(404).json({
      message: "Job not found"
    })

  } catch (err) {
    console.error("❌ UNIVERSAL DELETE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router