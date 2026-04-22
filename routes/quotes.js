import express from "express"
import multer from "multer"
import Quote from "../models/Quote.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import square from "square"

const { SquareClient } = square

const router = express.Router()

console.log("🚀 QUOTES ROUTE LOADED (APPROVE + DENY FIXED)")

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
   💳 CREATE PAYMENT LINK
========================================================= */
const createPaymentLink = async (quote) => {
  try {
    const subtotal = Number(quote.price || 0)

    if (!subtotal || isNaN(subtotal)) {
      throw new Error("Invalid subtotal")
    }

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
        redirectUrl: `${
          process.env.CLIENT_URL || "https://signavistudio.store"
        }/success/${quote._id}`
      }
    })

    let url = response?.paymentLink?.url

    if (!url) throw new Error("No payment URL")

    if (url.startsWith("ttps://")) url = "h" + url
    if (!url.startsWith("http")) url = `https://${url}`

    return url

  } catch (err) {
    console.error("❌ SQUARE LINK ERROR:", err)
    return null
  }
}

/* =========================================================
   ✅ APPROVE
========================================================= */
async function approveHandler(req, res) {
  try {
    const { id } = req.params

    console.log("🔥 APPROVE ROUTE HIT:", id)

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    if (!quote.timeline) quote.timeline = []

    const paymentUrl = await createPaymentLink(quote)

    if (!paymentUrl) {
      throw new Error("Payment link creation failed")
    }

    quote.paymentUrl = paymentUrl
    quote.approvalStatus = "approved"
    quote.status = "payment_required"
    quote.source = "order"

    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved – awaiting payment"
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

    return res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ APPROVE ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
}

/* =========================================================
   ❌ DENY
========================================================= */
async function denyHandler(req, res) {
  try {
    const { id } = req.params

    console.log("❌ DENY ROUTE HIT:", id)

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    if (!quote.timeline) quote.timeline = []

    quote.status = "denied"
    quote.approvalStatus = "denied"

    quote.timeline.push({
      status: "denied",
      date: new Date(),
      note: "Quote denied"
    })

    await quote.save()

    return res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    return res.status(500).json({ message: err.message })
  }
}

/* =========================================================
   ROUTES
========================================================= */
router.patch("/:id/approve", approveHandler)
router.post("/:id/approve", approveHandler)

router.patch("/:id/deny", denyHandler)
router.post("/:id/deny", denyHandler)

export default router