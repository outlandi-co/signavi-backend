import express from "express"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"

import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

console.log("🔥 QUOTES ROUTE LOADED")

/* =========================================================
   CLOUDINARY BUFFER UPLOAD
========================================================= */

const uploadBufferToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream =
      cloudinary.uploader.upload_stream(
        {
          folder: "signavi/quote-artwork",
          resource_type: "auto"
        },
        (error, result) => {
          if (error) {
            console.error(
              "❌ QUOTE CLOUDINARY UPLOAD ERROR:",
              error
            )

            return reject(error)
          }

          resolve(result)
        }
      )

    uploadStream.end(file.buffer)
  })
}

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

    return res.json({
      success: true,
      data: quotes
    })
  } catch (err) {
    console.error(
      "❌ GET QUOTES ERROR:",
      err
    )

    return res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

/* ================= CREATE ================= */

router.post(
  "/",
  upload.single("artwork"),
  async (req, res) => {
    try {
      const body = req.body || {}

      console.log(
        "🔥 CREATE QUOTE BODY:",
        body
      )

      console.log(
        "🖼️ CREATE QUOTE FILE:",
        req.file
          ? {
              name: req.file.originalname,
              type: req.file.mimetype,
              size: req.file.size
            }
          : "No artwork uploaded"
      )

      /* ================= VALIDATE BODY ================= */

      if (Object.keys(body).length === 0) {
        console.error(
          "❌ CREATE QUOTE: Request body is empty"
        )

        return res.status(400).json({
          success: false,
          message:
            "Quote request body is empty or could not be parsed"
        })
      }

      const quantity =
        Number(body.quantity) || 1

      const price =
        Number(body.price) || 0

      const finalPrice =
        Number(body.finalPrice) || price

      /* ================= PARSE ITEMS ================= */

      let items = []

      if (body.items) {
        try {
          items =
            typeof body.items === "string"
              ? JSON.parse(body.items)
              : body.items
        } catch (parseError) {
          console.error(
            "❌ QUOTE ITEMS PARSE ERROR:",
            parseError
          )

          items = []
        }
      }

      /* ================= ARTWORK ================= */

      let artworkUrl =
        body.artworkUrl || ""

      let artworkPublicId =
        body.artworkPublicId || ""

      let artworkName =
        body.artworkName || ""

      if (req.file) {
        console.log(
          "📤 UPLOADING QUOTE ARTWORK TO CLOUDINARY..."
        )

        const uploadedArtwork =
          await uploadBufferToCloudinary(
            req.file
          )

        artworkUrl =
          uploadedArtwork.secure_url || ""

        artworkPublicId =
          uploadedArtwork.public_id || ""

        artworkName =
          req.file.originalname || ""

        console.log(
          "✅ QUOTE ARTWORK UPLOADED:",
          artworkUrl
        )
      }

      /* ================= CREATE QUOTE ================= */

      const quoteData = {
        ...body,

        quantity,
        price,
        finalPrice,

        items,

        status: "quotes",
        approvalStatus: "pending",

        timeline: [
          {
            status: "created",
            note: "Quote created",
            date: new Date()
          }
        ]
      }

      /*
       * Store artwork information.
       * These values are useful for the admin quote,
       * production board, and future artwork retrieval.
       */

      if (artworkUrl) {
        quoteData.artwork =
          artworkUrl

        quoteData.artworkUrl =
          artworkUrl
      }

      if (artworkPublicId) {
        quoteData.artworkPublicId =
          artworkPublicId
      }

      if (artworkName) {
        quoteData.artworkName =
          artworkName
      }

      const quote =
        await Quote.create(
          quoteData
        )

      console.log(
        "✅ QUOTE CREATED:",
        quote._id
      )

      return res.status(201).json({
        success: true,
        data: quote
      })
    } catch (err) {
      console.error(
        "❌ CREATE QUOTE ERROR:",
        err
      )

      return res.status(500).json({
        success: false,
        message:
          err.message ||
          "Failed to create quote"
      })
    }
  }
)

/* ================= GET ONE ================= */

router.get("/:id", async (req, res) => {
  try {
    const quote =
      await Quote.findById(
        req.params.id
      )

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found"
      })
    }

    return res.json({
      success: true,
      data: quote
    })
  } catch (err) {
    console.error(
      "❌ GET ONE ERROR:",
      err
    )

    return res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

/* ================= PATCH ================= */

router.patch("/:id", async (req, res) => {
  try {
    const body =
      req.body || {}

    console.log(
      "🔥 PATCH BODY:",
      body
    )

    if (
      !req.body ||
      Object.keys(body).length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Update request body is empty or could not be parsed"
      })
    }

    const quote =
      await Quote.findById(
        req.params.id
      )

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: "Quote not found"
      })
    }

    if (
      !Array.isArray(
        quote.timeline
      )
    ) {
      quote.timeline = []
    }

    const approvalStatus =
      body.approvalStatus

    let createdOrder = null

    /* ================= DUPLICATE GUARD ================= */

    if (
      approvalStatus &&
      (
        quote.approvalStatus ===
          "approved" ||
        quote.approvalStatus ===
          "denied" ||
        quote.orderId
      )
    ) {
      console.log(
        "⚠️ QUOTE ALREADY PROCESSED:",
        quote._id
      )

      return res.json({
        success: true,
        message:
          "Quote already processed",
        data: quote
      })
    }

    /* ================= WORKFLOW STATUS ================= */

    const workflowStatuses = [
      "quotes",
      "review_mockup",
      "approval_payment",
      "production",
      "pickup_shipping",
      "completed"
    ]

    if (
      body.status &&
      workflowStatuses.includes(
        body.status
      ) &&
      !approvalStatus
    ) {
      const previousStatus =
        quote.status

      quote.status =
        body.status

      quote.timeline.push({
        status: body.status,
        note:
          `Workflow moved from ${previousStatus} to ${body.status}`,
        date: new Date()
      })

      await quote.save()

      console.log(
        "✅ QUOTE WORKFLOW UPDATED:",
        quote._id,
        quote.status
      )

      return res.json({
        success: true,
        data: quote,
        order: null
      })
    }

    /* ================= APPROVE ================= */

    if (
      approvalStatus ===
      "approved"
    ) {
      quote.approvalStatus =
        "approved"

      quote.status =
        "payment_required"

      const quantity =
        Number(
          quote.quantity
        ) || 1

      const itemPrice =
        Number(
          body.finalPrice ||
          quote.finalPrice ||
          quote.price ||
          0
        )

      quote.finalPrice =
        itemPrice

      quote.timeline.push({
        status: "approved",
        note:
          "Quote approved and converted into order",
        date: new Date()
      })

      const subtotal =
        itemPrice

      const tax =
        subtotal * 0.0825

      const finalPrice =
        subtotal + tax

      createdOrder =
        await Order.create({
          customerName:
            quote.customerName ||
            quote.name ||
            "Customer",

          email:
            String(
              quote.email || ""
            )
              .trim()
              .toLowerCase(),

          items: [
            {
              name:
                quote.projectType ||
                quote.serviceType ||
                "Custom Quote Order",

              quantity,

              price:
                itemPrice,

              source:
                "quote"
            }
          ],

          subtotal,
          tax,
          finalPrice,

          status:
            "payment_required",

          source:
            "quote",

          quoteId:
            quote._id,

          timeline: [
            {
              status:
                "payment_required",

              note:
                "Order created from approved quote",

              date:
                new Date()
            }
          ]
        })

      console.log(
        "🔥 ORDER CREATED FROM QUOTE:",
        createdOrder._id
      )

      quote.orderId =
        createdOrder._id

      await quote.save()

      try {
        await sendOrderStatusEmail(
          createdOrder.email,
          "payment_required",
          createdOrder
        )

        console.log(
          "📧 PAYMENT EMAIL SENT FOR ORDER:",
          createdOrder._id
        )
      } catch (emailError) {
        console.error(
          "❌ PAYMENT EMAIL ERROR:",
          emailError
        )
      }

      return res.json({
        success: true,
        data: quote,
        order: createdOrder
      })
    }

    /* ================= DENY ================= */

    if (
      approvalStatus ===
      "denied"
    ) {
      quote.approvalStatus =
        "denied"

      quote.status =
        "denied"

      quote.timeline.push({
        status:
          "denied",

        note:
          "Quote denied",

        date:
          new Date()
      })

      await quote.save()

      try {
        await sendOrderStatusEmail(
          quote.email,
          "denied",
          quote
        )

        console.log(
          "📧 DENIAL EMAIL TRIGGERED"
        )
      } catch (emailError) {
        console.error(
          "❌ DENIAL EMAIL ERROR:",
          emailError
        )
      }

      return res.json({
        success: true,
        data: quote,
        order: null
      })
    }

    /* ================= GENERAL PATCH FIELDS ================= */

    Object.keys(body).forEach(
      (key) => {
        if (
          key !== "_id" &&
          key !==
            "approvalStatus" &&
          key !== "status" &&
          key !== "orderId"
        ) {
          quote[key] =
            body[key]
        }
      }
    )

    await quote.save()

    return res.json({
      success: true,
      data: quote,
      order: null
    })
  } catch (err) {
    console.error(
      "❌ PATCH ERROR:",
      err
    )

    return res.status(500).json({
      success: false,
      message: err.message
    })
  }
})

export default router