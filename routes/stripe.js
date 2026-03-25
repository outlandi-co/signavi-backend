import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

dotenv.config()

console.log("🔥 STRIPE ROUTES LOADED") // 🔥 DEBUG

const router = express.Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/* ================= CREATE CHECKOUT ================= */
router.post("/create-checkout-session/:id", async (req, res) => {
  try {
    console.log("🔥 HIT STRIPE ROUTE:", req.params.id)

    const { id } = req.params

    const order = await Order.findById(id)

    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const amount = Math.round((order.finalPrice || order.price || 0) * 100)

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Order #${order._id}`
            },
            unit_amount: amount
          },
          quantity: 1
        }
      ],

      success_url: `http://localhost:5050/api/stripe/success?orderId=${order._id}`,
      cancel_url: `http://localhost:5173/cancel`
    })

    res.json({ url: session.url })

  } catch (err) {
    console.error("❌ STRIPE ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

/* ================= SUCCESS ================= */
router.get("/success", async (req, res) => {
  try {
    const { orderId } = req.query

    const order = await Order.findById(orderId)

    if (!order) {
      return res.status(404).send("Order not found")
    }

    order.status = "paid"
    order.timeline.push({
      status: "paid",
      date: new Date()
    })

    await order.save()

    console.log("💰 PAYMENT SUCCESS:", orderId)

    if (order.email) {
      await sendOrderStatusEmail(
        order.email,
        "paid",
        order._id,
        order
      )
    }

    res.redirect("http://localhost:5173/success")

  } catch (err) {
    console.error("❌ SUCCESS ERROR:", err)
    res.status(500).send("Payment success error")
  }
})

export default router