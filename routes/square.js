import express from "express"
import { Client, Environment } from "square"
import dotenv from "dotenv"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production
})

const { checkoutApi } = client

/* ================= CREATE PAYMENT LINK ================= */
router.post("/create-payment/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const amount =
      Math.round((order.finalPrice || order.price || 0) * 100)

const response = await checkoutApi.createPaymentLink({
  idempotencyKey: Date.now().toString(),

  quickPay: {
    name: "Signavi Order",
    priceMoney: {
      amount,
      currency: "USD"
    }
  },

  checkoutOptions: {
    redirectUrl: `${process.env.CLIENT_URL}/success/${order._id}`
  }
})      

    res.json({
      url: response.result.paymentLink.url
    })

  } catch (err) {
    console.error("❌ SQUARE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router