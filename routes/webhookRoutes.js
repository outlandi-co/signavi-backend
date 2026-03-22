import express from "express"
import Stripe from "stripe"
import dotenv from "dotenv"
import Order from "../models/Order.js"

dotenv.config()

const router = express.Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

/* ================= STRIPE WEBHOOK ================= */
router.post("/", async (req, res) => {

  const sig = req.headers["stripe-signature"]

  let event

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  console.log("🔥 EVENT:", event.type)

  /* ================= CHECKOUT SUCCESS ================= */
  if (event.type === "checkout.session.completed") {

    const session = event.data.object

    try {

      /* 🔥 PREVENT DUPLICATE ORDERS */
      const existing = await Order.findOne({
        stripeSessionId: session.id
      })

      if (existing) {
        console.log("⚠️ Duplicate order prevented")
        return res.json({ received: true })
      }

      /* ================= PARSE ITEMS ================= */
      let items = []

      try {
        items = JSON.parse(session.metadata?.items || "[]")
      } catch {
        console.warn("⚠️ No items found in metadata")
      }

      /* ================= FORMAT ITEMS ================= */
      const formattedItems = items.map(item => ({
        name: item.name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
        cost: Number(item.cost || 0) // 🔥 CRITICAL FOR TAXES
      }))

      /* ================= TOTAL ================= */
      const total = (session.amount_total || 0) / 100

      /* ================= CREATE ORDER ================= */
      const newOrder = await Order.create({
        type: "order",
        customerName: session.metadata?.customerName || "Store Order",
        email: session.customer_email || "",
        items: formattedItems,
        total,
        status: "pending",
        stripeSessionId: session.id,

        timeline: [
          {
            status: "pending",
            date: new Date()
          }
        ]
      })

      console.log("✅ ORDER CREATED:", newOrder._id)

      /* ================= REALTIME UPDATE ================= */
      const io = req.app.get("io")
      if (io) {
        io.emit("jobUpdated")
      }

    } catch (err) {
      console.error("❌ ORDER CREATION ERROR:", err)
    }
  }

  res.json({ received: true })
})

export default router