import express from "express"
import multer from "multer"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import pkg from "square"
const { Client, Environment } = pkg

const router = express.Router()

console.log("🚀 QUOTES ROUTE LOADED (SQUARE + EMAIL ENABLED)")

/* ================= MULTER ================= */
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }
})

/* ================= SQUARE CLIENT ================= */
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN
})

/* =========================================================
   🆕 CREATE QUOTE
========================================================= */
router.post("/", upload.single("artwork"), async (req, res) => {
  try {
    let {
      customerName,
      email,
      quantity,
      printType,
      price,
      items,
      notes
    } = req.body || {}

    customerName = customerName || "New Customer"
    email = email || ""
    quantity = Number(quantity || 1)
    printType = printType || "unknown"
    price = Number(price || 25)

    if (typeof items === "string") {
      try {
        items = JSON.parse(items)
      } catch {
        items = []
      }
    }

    if (!Array.isArray(items)) items = []

    items = items.map(item => ({
      name: item?.name || printType,
      quantity: Number(item?.quantity || 1),
      price: Number(item?.price || 0)
    }))

    const artworkPath = req.file
      ? `/uploads/${req.file.filename}`
      : ""

    const quote = new Quote({
      customerName,
      email,
      quantity,
      price,
      items,
      notes,
      artwork: artworkPath,
      status: "pending",
      approvalStatus: "pending",
      source: "quote",
      timeline: [
        {
          status: "pending",
          date: new Date(),
          note: "Quote created"
        }
      ]
    })

    await quote.save()

    console.log("✅ QUOTE SAVED:", quote._id)

    return res.status(201).json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET SINGLE QUOTE
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    return res.json({ success: true, data: quote })

  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   💳 CREATE SQUARE PAYMENT LINK
========================================================= */
const createPaymentLink = async (quote) => {
  try {
    const amount = Math.round(Number(quote.price) * 100)

    const response = await squareClient.checkout.paymentLinks.create({
      idempotencyKey: `${quote._id}-${Date.now()}`,
      order: {
  locationId: process.env.SQUARE_LOCATION_ID,

  /* 🔥 TAX ENABLED */
  taxes: [
    {
      uid: "sales-tax",
      name: "Sales Tax",
      percentage: "8.25", // 👈 change to your local tax rate
      scope: "ORDER"
    }
  ],

  lineItems: [
    {
      name: `Order #${quote._id}`,
      quantity: "1",
      basePriceMoney: {
        amount,
        currency: "USD"
      }
    }
  ]
}
    })

    const url = response?.result?.paymentLink?.url

    if (!url) throw new Error("No payment link from Square")

    return url

  } catch (err) {
    console.error("❌ SQUARE LINK ERROR:", err)
    return null
  }
}

/* =========================================================
   ✅ APPROVE HANDLER (SQUARE + EMAIL)
========================================================= */
async function approveHandler(req, res) {
  try {
    const { id } = req.params

    console.log("🔥 APPROVE ROUTE HIT:", id)

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    /* ================= CREATE PAYMENT LINK ================= */
    let paymentUrl = await createPaymentLink(quote)

    if (paymentUrl) {
      quote.paymentUrl = paymentUrl
      console.log("💳 PAYMENT LINK:", paymentUrl)
    }

    /* ================= UPDATE ================= */
    quote.approvalStatus = "approved"
    quote.status = "payment_required"
    quote.source = "order"

    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved – awaiting payment"
    })

    await quote.save()

    console.log("🔥 QUOTE APPROVED:", quote._id)

    /* ================= SEND EMAIL ================= */
    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "payment_required",
        quote._id,
        quote
      )
    }

    return res.json({
      success: true,
      data: quote
    })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
}

/* =========================================================
   🔥 ROUTES
========================================================= */
router.patch("/:id/approve", approveHandler)
router.post("/:id/approve", approveHandler)

export default router