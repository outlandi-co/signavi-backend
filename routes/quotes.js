import express from "express"
import multer from "multer"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import { SquareClient } from "square"

const router = express.Router()

console.log("🚀 QUOTES ROUTE LOADED (FINAL STABLE)")

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

    customerName = customerName || "Customer"
    email = email || ""
    quantity = Number(quantity || 1)
    printType = printType || "custom"
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

    const artwork = req.file ? `/uploads/${req.file.filename}` : ""

    const quote = new Quote({
      customerName,
      email,
      quantity,
      price,
      items,
      notes,
      artwork,
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

    return res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ CREATE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   📄 GET QUOTE
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    res.json({ success: true, data: quote })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   💳 SAFE PAYMENT LINK (NON-BLOCKING)
========================================================= */
const createPaymentLink = async (quote) => {
  try {
    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      console.warn("⚠️ Missing Square env")
      return null
    }

    const subtotal = Number(quote.price || 0)
    if (!subtotal) return null

    const tax = subtotal * 0.0825

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${quote._id}-${Date.now()}`,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        metadata: {
          recordId: String(quote._id),
          type: "quote"
        },
        lineItems: [
          {
            name: "Subtotal",
            quantity: "1",
            basePriceMoney: {
              amount: Math.round(subtotal * 100),
              currency: "USD"
            }
          },
          {
            name: "Tax",
            quantity: "1",
            basePriceMoney: {
              amount: Math.round(tax * 100),
              currency: "USD"
            }
          }
        ]
      },
      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${quote._id}`
      }
    })

    let url = response?.paymentLink?.url
    if (!url) return null

    if (url.startsWith("ttps://")) url = "h" + url

    return url

  } catch (err) {
    console.warn("⚠️ Square failed:", err.message)
    return null
  }
}

/* =========================================================
   ✅ APPROVE (NEVER CRASHES)
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    if (!quote.timeline) quote.timeline = []

    let paymentUrl = await createPaymentLink(quote)

    quote.approvalStatus = "approved"
    quote.status = "payment_required"
    quote.source = "order"

    if (paymentUrl) {
      quote.paymentUrl = paymentUrl
    }

    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved"
    })

    await quote.save()

    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "payment_required",
        quote._id,
        quote
      )
    }

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ❌ DENY
========================================================= */
router.patch("/:id/deny", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    if (!quote.timeline) quote.timeline = []

    quote.status = "denied"
    quote.approvalStatus = "denied"

    quote.timeline.push({
      status: "denied",
      date: new Date()
    })

    await quote.save()

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router