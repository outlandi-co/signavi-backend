import express from "express"
import Quote from "../models/Quote.js"

const router = express.Router()

/* ================= CREATE QUOTE ================= */
router.post("/", async (req, res) => {
  try {
    const {
      customerName,
      email,
      quantity,
      notes
    } = req.body

    if (!email) {
      return res.status(400).json({ message: "Email required" })
    }

    const quote = new Quote({
      customerName: customerName || "Guest",
      email: email.toLowerCase(),
      quantity: Number(quantity) || 1,
      notes: notes || "",
      price: 0,
      shippingCost: 0,
      approvalStatus: "pending",
      status: "quotes",       // 🔥 REQUIRED for production board
      source: "quote",        // 🔥 REQUIRED for JobCard logic
      timeline: [
        {
          status: "quotes",
          note: "Quote submitted",
          date: new Date()
        }
      ]
    })

    await quote.save()

    // 🔥 REALTIME UPDATE
    const io = req.app.get("io")
    io?.emit("jobUpdated")

    res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= GET ALL QUOTES ================= */
router.get("/", async (req, res) => {
  try {
    const quotes = await Quote.find().sort({ createdAt: -1 })

    res.json({
      success: true,
      data: quotes
    })

  } catch (err) {
    console.error("❌ GET QUOTES ERROR:", err)
    res.status(500).json({ message: "Failed to load quotes" })
  }
})

/* ================= GET ONE ================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ GET ONE ERROR:", err)
    res.status(500).json({ message: "Failed to load quote" })
  }
})

/* ================= UPDATE ================= */
router.patch("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    if (req.body.price !== undefined) {
      quote.price = Number(req.body.price)
    }

    if (req.body.shippingCost !== undefined) {
      quote.shippingCost = Number(req.body.shippingCost)
    }

    if (req.body.approvalStatus) {
      quote.approvalStatus = req.body.approvalStatus
    }

    // 🔥 OPTIONAL: update status when approved
    if (req.body.approvalStatus === "approved") {
      quote.status = "payment_required"
    }

    // 🔥 ADD TIMELINE ENTRY
    if (req.body.approvalStatus) {
      quote.timeline.push({
        status: req.body.approvalStatus,
        note: "Quote updated",
        date: new Date()
      })
    }

    await quote.save()

    // 🔥 REALTIME UPDATE
    const io = req.app.get("io")
    io?.emit("jobUpdated")

    res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ UPDATE ERROR:", err)
    res.status(500).json({ message: "Update failed" })
  }
})

export default router