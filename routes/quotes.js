import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { SquareClient, SquareEnvironment } from "square"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

/* ================= ENV ================= */
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID

console.log("🔑 SQUARE ENV:", {
  token: SQUARE_TOKEN ? "exists" : "missing",
  location: SQUARE_LOCATION_ID || "missing"
})

if (!SQUARE_TOKEN) console.warn("⚠️ Missing SQUARE_ACCESS_TOKEN")
if (!SQUARE_LOCATION_ID) console.warn("⚠️ Missing SQUARE_LOCATION_ID")

const client = new SquareClient({
  token: SQUARE_TOKEN,
  environment: SquareEnvironment.Production
})

/* =========================================================
   📄 GET ONE QUOTE
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
    if (!quote) return res.status(404).json({ message: "Quote not found" })
    res.json(quote)
  } catch (err) {
    console.error("❌ GET QUOTE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* =========================================================
   ✅ APPROVE (DIRECT SQUARE CALL)
========================================================= */
router.patch("/:id/approve", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({ message: "Not found" })
    }

    if (quote.approvalStatus === "approved" && quote.paymentUrl) {
      return res.json({ success: true, data: quote })
    }

    /* ================= UPDATE STATUS ================= */
    quote.approvalStatus = "approved"
    quote.status = "payment_required"
    quote.source = "order"

    /* ================= BUILD AMOUNT ================= */
    const rawAmount = Number(quote.price || 0)

    if (!rawAmount || rawAmount <= 0) {
      throw new Error("Invalid quote price")
    }

    const amount = BigInt(Math.round(rawAmount * 100))
    console.log("🧪 AMOUNT:", typeof amount, amount)

    /* ================= CREATE SQUARE LINK ================= */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${quote._id}-${Date.now()}`,

      order: {
        locationId: SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Quote #${quote._id.toString().slice(-6)}`,
            quantity: "1",
            basePriceMoney: {
              amount: amount,
              currency: "USD"
            }
          }
        ]
      },

      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${quote._id}`
      }
    })

    const url = response?.paymentLink?.url

    if (!url) {
      throw new Error("Square did not return a payment URL")
    }

    /* ================= SAVE ================= */
    quote.paymentUrl = url

    quote.timeline = quote.timeline || []
    quote.timeline.push({
      status: "payment_required",
      date: new Date(),
      note: "Approved – awaiting payment"
    })

    await quote.save()

    console.log("✅ APPROVED + PAYMENT LINK:", quote._id)

    /* ================= SOCKET ================= */
    req.app.get("io")?.emit("jobUpdated", quote)

    /* ================= EMAIL ================= */
    if (quote.email) {
      await sendOrderStatusEmail(
        quote.email,
        "approved",
        quote._id,
        { ...quote.toObject(), paymentUrl: quote.paymentUrl }
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
    if (!quote) return res.status(404).json({ message: "Not found" })

    quote.approvalStatus = "denied"
    quote.denialReason = req.body.reason || ""
    quote.revisionFee = Number(req.body.fee || 0)

    await quote.save()

    req.app.get("io")?.emit("jobUpdated", quote)

    res.json({ success: true, data: quote })

  } catch (err) {
    console.error("❌ DENY ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router