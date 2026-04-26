import express from "express"
import { SquareClient, SquareEnvironment } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

console.log("💳 SQUARE ROUTE LOADED")

const client = new SquareClient({
  token: process.env.SQUARE_SANDBOX_ACCESS_TOKEN,
  environment: SquareEnvironment.Sandbox
})

const LOCATION_ID = process.env.SQUARE_SANDBOX_LOCATION_ID

router.post("/create-payment/:id", async (req, res) => {
  try {
    const { id } = req.params

    let record = await Quote.findById(id)
    let type = "quote"

    if (!record) {
      record = await Order.findById(id)
      type = "order"
    }

    if (!record) {
      throw new Error("Record not found")
    }

    console.log("📦 TYPE:", type)

    /* 🔥 ALWAYS RECALCULATE TOTAL */
    let amountValue = 0

    if (type === "quote") {
      const subtotal = Number(record.price || 0)
      const shipping = Number(record.shippingCost || 0)
      const tax = subtotal * 0.0825

      amountValue = subtotal + shipping + tax

    } else {
      const subtotal = Number(record.subtotal || 0)
      const shipping = Number(record.shippingCost || 0)
      const tax = Number(record.tax || subtotal * 0.0825)

      amountValue = subtotal + shipping + tax
    }

    console.log("💰 CALCULATED:", amountValue)

    if (!amountValue || amountValue <= 0) {
      console.error("❌ BAD ORDER:", record)
      return res.status(400).json({
        message: "Invalid order total",
        debug: record
      })
    }

    const amountCents = BigInt(Math.round(amountValue * 100))

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: LOCATION_ID,
        lineItems: [
          {
            name: `${type.toUpperCase()} #${record._id}`,
            quantity: "1",
            basePriceMoney: {
              amount: amountCents,
              currency: "USD"
            }
          }
        ]
      },
      checkoutOptions: {
        redirectUrl: `${process.env.CLIENT_URL}/success/${id}`
      }
    })

    const url = response.paymentLink.url

    record.paymentUrl = url
    await record.save()

    console.log("✅ PAYMENT LINK:", url)

    res.json({ success: true, url })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err.message)
    res.status(500).json({ message: err.message })
  }
})

export default router