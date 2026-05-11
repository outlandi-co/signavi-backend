import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

const router = express.Router()

console.log("🔥 QUOTES ROUTE LOADED")

/* ================= GET ALL ================= */

router.get("/", async (req, res) => {
  try {
    const includeProcessed =
      req.query.includeProcessed === "true"

    const filter = includeProcessed
      ? {}
      : {
          approvalStatus: {
            $nin: ["approved", "denied"]
          },
          status: {
            $nin: [
              "approved",
              "denied",
              "payment_required",
              "ready_for_production",
              "production",
              "shipping",
              "shipped",
              "closed",
              "archive"
            ]
          }
        }

    const quotes = await Quote.find(filter).sort({
      createdAt: -1
    })

    res.json({
      success: true,
      data: quotes
    })
  } catch (err) {
    console.error("❌ GET QUOTES ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

/* ================= CREATE ================= */

router.post("/", async (req, res) => {
  try {
    const quantity = Number(req.body.quantity) || 1
    const price = Number(req.body.price) || 0

    const quote = await Quote.create({
      ...req.body,
      quantity,
      price,
      finalPrice: Number(req.body.finalPrice) || price,
      status: "quotes",
      approvalStatus: "pending",
      timeline: [
        {
          status: "created",
          note: "Quote created",
          date: new Date()
        }
      ]
    })

    res.status(201).json({
      success: true,
      data: quote
    })
  } catch (err) {
    console.error("❌ CREATE QUOTE ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

/* ================= GET ONE ================= */

router.get("/:id", async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found"
      })
    }

    res.json({
      success: true,
      data: quote
    })
  } catch (err) {
    console.error("❌ GET ONE ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

/* ================= PATCH ================= */

router.patch("/:id", async (req, res) => {
  try {
    console.log("🔥 PATCH BODY:", req.body)

    const quote = await Quote.findById(req.params.id)

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found"
      })
    }

    if (!Array.isArray(quote.timeline)) {
      quote.timeline = []
    }

    const approvalStatus = req.body.approvalStatus

    let createdOrder = null

    /* ================= DUPLICATE GUARD ================= */

    if (
      approvalStatus &&
      (
        quote.approvalStatus === "approved" ||
        quote.approvalStatus === "denied" ||
        quote.orderId
      )
    ) {
      console.log("⚠️ QUOTE ALREADY PROCESSED:", quote._id)

      return res.json({
        success: true,
        message: "Quote already processed",
        data: quote
      })
    }

    /* ================= APPROVE ================= */

    if (approvalStatus === "approved") {
      quote.approvalStatus = "approved"
      quote.status = "payment_required"

      const quantity = Number(quote.quantity) || 1

      const itemPrice = Number(
        req.body.finalPrice ||
        quote.finalPrice ||
        quote.price ||
        0
      )

      quote.finalPrice = itemPrice

      quote.timeline.push({
        status: "approved",
        note: "Quote approved and converted into order",
        date: new Date()
      })

      const subtotal = itemPrice
      const tax = subtotal * 0.0825
      const finalPrice = subtotal + tax

      createdOrder = await Order.create({
        customerName:
          quote.customerName ||
          quote.name ||
          "Customer",

        email: String(quote.email || "")
          .trim()
          .toLowerCase(),

        items: [
          {
            name:
              quote.projectType ||
              quote.serviceType ||
              "Custom Quote Order",

            quantity,
            price: itemPrice,
            source: "quote"
          }
        ],

        subtotal,
        tax,
        finalPrice,

        status: "payment_required",
        source: "quote",
        quoteId: quote._id,

        timeline: [
          {
            status: "payment_required",
            note: "Order created from approved quote",
            date: new Date()
          }
        ]
      })

      console.log(
        "🔥 ORDER CREATED FROM QUOTE:",
        createdOrder._id
      )

      quote.orderId = createdOrder._id

      await quote.save()

      await sendOrderStatusEmail(
        createdOrder.email,
        "payment_required",
        createdOrder
      )

      console.log(
        "📧 PAYMENT EMAIL SENT FOR ORDER:",
        createdOrder._id
      )

      return res.json({
        success: true,
        data: quote,
        order: createdOrder
      })
    }

    /* ================= DENY ================= */

    if (approvalStatus === "denied") {
      quote.approvalStatus = "denied"
      quote.status = "denied"

      quote.timeline.push({
        status: "denied",
        note: "Quote denied",
        date: new Date()
      })

      await quote.save()

      await sendOrderStatusEmail(
        quote.email,
        "denied",
        quote
      )

      console.log("📧 DENIAL EMAIL TRIGGERED")

      return res.json({
        success: true,
        data: quote,
        order: null
      })
    }

    /* ================= GENERAL PATCH FIELDS ================= */

    Object.keys(req.body).forEach(key => {
      if (
        key !== "_id" &&
        key !== "approvalStatus" &&
        key !== "status" &&
        key !== "orderId"
      ) {
        quote[key] = req.body[key]
      }
    })

    await quote.save()

    res.json({
      success: true,
      data: quote,
      order: null
    })
  } catch (err) {
    console.error("❌ PATCH ERROR:", err)

    res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

export default router