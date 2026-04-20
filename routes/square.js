import express from "express"
import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import { SquareClient, SquareEnvironment } from "square"

const router = express.Router()

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production
})

/* =========================================================
   💳 UNIVERSAL PAYMENT LINK
========================================================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    console.log("💳 CREATE PAYMENT:", id)

    let item = await Order.findById(id)

    /* 🔄 IF NOT ORDER → TRY QUOTE */
    if (!item) {
      item = await Quote.findById(id)

      if (!item) {
        return res.status(404).json({ message: "Not found" })
      }

      if (item.approvalStatus !== "approved") {
        return res.status(400).json({
          message: "Quote not approved yet"
        })
      }
    }

    /* 💰 PRICE */
    let price = Number(item.finalPrice || item.price || 0)

    if (!price || price <= 0) {
      console.warn("⚠️ Invalid price → fallback 25")
      price = 25
    }

    const amount = Math.round(price * 100)

    console.log("💰 AMOUNT:", amount)

    /* 💳 CREATE LINK */
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,

      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Order #${id}`,
            quantity: "1",
            basePriceMoney: {
              amount,
              currency: "USD"
            }
          }
        ]
      },

      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${id}`
      }
    })

    const url = response?.paymentLink?.url

    console.log("🔗 PAYMENT URL:", url)

    if (!url) {
      return res.status(500).json({ message: "No payment URL" })
    }

    return res.json({ url })

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router