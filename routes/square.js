import express from "express"
import { SquareClient } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

const router = express.Router()

const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN
})

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
      return res.status(404).json({ message: "Not found" })
    }

    const subtotal = Number(record.subtotal || record.price || 25)
    const tax = Number(record.tax || 0)

    const response = await client.checkout.paymentLinksApi.createPaymentLink({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,

        metadata: {
          recordId: String(record._id),
          type
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
      }
    })

    const url = response?.result?.paymentLink?.url

    record.paymentUrl = url
    await record.save()

    res.json({ success: true, url })

  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message })
  }
})

export default router