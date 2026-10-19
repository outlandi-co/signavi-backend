
import express from "express"
import mongoose from "mongoose"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { requireAuth } from "../middleware/auth.js"
import { sendOrderStatusEmail } from "../utils/sendEmail.js"
import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

const TAX_RATE = 0.0825

// Existing tax rate; verify applicable tax rules before production.

const WORKFLOW_STATUSES = [
  "quotes",
  "review_mockup",
  "approval_payment",
  "pending",
  "payment_required",
  "paid",
  "production",
  "pickup_shipping",
  "shipping",
  "shipped",
  "delivered",
  "completed",
  "denied",
  "archive"
]

const ACTIVE_STATUSES = [
  "quotes",
  "review_mockup",
  "approval_payment"
]

/* ==============================================
   ADMIN AUTHORIZATION
============================================== */

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required"
    })
  }

  next()
}

/* ==============================================
   HELPERS
============================================== */

const safePositive = (value, fallback = 0) => {
  const number = Number(value)

  return Number.isFinite(number) && number >= 0
    ? number
    : fallback
}

const safeQuantity = (value, fallback = 1) => {
  const number = Number(value)

  return Number.isFinite(number) && number >= 1
    ? Math.floor(number)
    : fallback
}

const normalizeEmail = (value = "") =>
  String(value || "").trim().toLowerCase()

const asString = (value, fallback = "") =>
  String(value ?? fallback).trim()

const validId = (id) =>
  mongoose.Types.ObjectId.isValid(id)

const addTimeline = (document, status, note) => {
  if (!Array.isArray(document.timeline)) {
    document.timeline = []
  }

  document.timeline.push({
    status,
    note,
    date: new Date()
  })
}

const sendStatusEmail = async (
  email,
  status,
  document
) => {
  if (!email) return

  try {
    await sendOrderStatusEmail(
      email,
      status,
      document
    )
  } catch (error) {
    console.error("Quote email failed:", error)
  }
}

/* ==============================================
   CLOUDINARY UPLOAD
============================================== */

const uploadToCloudinary = (
  file,
  folder = "signavi/quote-artwork"
) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto"
      },
      (error, result) =>
        error ? reject(error) : resolve(result)
    )

    stream.end(file.buffer)
  })

/* ==============================================
   FIND QUOTE
============================================== */

const findQuote = async (req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid quote ID"
    })

    return null
  }

  const quote = await Quote.findById(
    req.params.id
  )

  if (!quote) {
    res.status(404).json({
      success: false,
      message: "Quote not found"
    })

    return null
  }

  return quote
}

/* ==============================================
   GET ALL QUOTES — ADMIN ONLY
============================================== */

router.get(
  "/",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const filter =
        req.query.includeProcessed === "true"
          ? {}
          : {
              approvalStatus: "pending",
              status: {
                $in: ACTIVE_STATUSES
              }
            }

      const quotes = await Quote.find(filter)
        .sort({ createdAt: -1 })
        .lean()

      return res.json({
        success: true,
        count: quotes.length,
        data: quotes
      })
    } catch (error) {
      console.error(
        "Get quotes failed:",
        error
      )

      return res.status(500).json({
        success: false,
        message: "Failed to load quotes"
      })
    }
  }
)

/* ==============================================
   CREATE QUOTE — PUBLIC
============================================== */

router.post(
  "/",
  upload.single("artwork"),
  async (req, res) => {
    try {
      const body = req.body || {}

      if (
        !Object.keys(body).length &&
        !req.file
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Quote request body is empty or could not be parsed"
        })
      }

      /* ================= ITEMS ================= */

      let items = []

      if (body.items) {
        try {
          const incoming =
            typeof body.items === "string"
              ? JSON.parse(body.items)
              : body.items

          if (Array.isArray(incoming)) {
            items = incoming.map((item) => ({
              name: asString(item?.name),

              quantity: safeQuantity(
                item?.quantity
              ),

              price: safePositive(
                item?.price
              ),

              serviceType: asString(
                item?.serviceType
              ),

              source: asString(
                item?.source || "quote"
              )
            }))
          }
        } catch (error) {
          console.error(
            "Quote items parsing failed:",
            error
          )
        }
      }

      /* ================= ARTWORK ================= */

      let artworkUrl = asString(
        body.artworkUrl
      )

      let artworkPublicId = asString(
        body.artworkPublicId
      )

      let artworkName = asString(
        body.artworkName
      )

      if (req.file) {
        const uploaded =
          await uploadToCloudinary(req.file)

        artworkUrl =
          uploaded?.secure_url || ""

        artworkPublicId =
          uploaded?.public_id || ""

        artworkName =
          req.file.originalname || ""
      }

      /* ================= CREATE ================= */

      const price = safePositive(
        body.price
      )

      const quote = await Quote.create({
        customerName: asString(
          body.customerName
        ),

        email: normalizeEmail(
          body.email
        ),

        phone: asString(
          body.phone
        ),

        projectType: asString(
          body.projectType
        ),

        serviceType: asString(
          body.serviceType
        ),

        serviceLabel: asString(
          body.serviceLabel
        ),

        printType: asString(
          body.printType
        ),

        turnaround: asString(
          body.turnaround || "standard"
        ),

        notes: String(
          body.notes || ""
        ),

        quantity: safeQuantity(
          body.quantity
        ),

        items,

        price,

        finalPrice: safePositive(
          body.finalPrice,
          price
        ),

        shippingCost: safePositive(
          body.shippingCost
        ),

        artwork: artworkUrl,

        artworkUrl,

        artworkPublicId,

        artworkName,

        approvalStatus: "pending",

        denialReason: "",

        adminNotes: asString(
          body.adminNotes
        ),

        status: "quotes",

        source: asString(
          body.source || "quote"
        ),

        timeline: [
          {
            status: "quotes",
            note: "Quote created",
            date: new Date()
          }
        ]
      })

      return res.status(201).json({
        success: true,
        data: quote
      })
    } catch (error) {
      console.error(
        "Create quote failed:",
        error
      )

      return res.status(500).json({
        success: false,
        message: "Failed to create quote"
      })
    }
  }
)

/* ==============================================
   GET ONE QUOTE — ADMIN ONLY
============================================== */

router.get(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const quote = await findQuote(
        req,
        res
      )

      if (!quote) return

      return res.json({
        success: true,
        data: quote
      })
    } catch (error) {
      console.error(
        "Get quote failed:",
        error
      )

      return res.status(500).json({
        success: false,
        message: "Failed to load quote"
      })
    }
  }
)

/* ==============================================
   UPLOAD / SEND MOCKUP — ADMIN ONLY
============================================== */

router.patch(
  "/:id/mockup",
  requireAuth,
  requireAdmin,
  upload.single("mockup"),
  async (req, res) => {
    try {
      const quote = await findQuote(
        req,
        res
      )

      if (!quote) return

      const body = req.body || {}

      const finalPrice = safePositive(
        body.finalPrice !== undefined
          ? body.finalPrice
          : body.price,

        quote.finalPrice ||
          quote.price ||
          0
      )

      if (finalPrice <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "A valid final quote price is required before sending the mockup"
        })
      }

      const mockupMessage = asString(
        body.mockupMessage ||
          quote.mockupMessage
      )

      if (!mockupMessage) {
        return res.status(400).json({
          success: false,
          message:
            "A customer message is required before sending the mockup"
        })
      }

      if (
        !req.file &&
        !quote.mockupUrl &&
        !quote.mockup
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Choose a digital mockup or proof before sending"
        })
      }

      /* ================= UPLOAD ================= */

      if (req.file) {
        const allowed = [
          "image/png",
          "image/jpeg",
          "image/webp",
          "application/pdf"
        ]

        if (
          !allowed.includes(
            req.file.mimetype
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Mockup must be a PNG, JPG, WEBP, or PDF file"
          })
        }

        const uploaded =
          await uploadToCloudinary(
            req.file,
            "signavi/quote-mockups"
          )

        quote.mockup =
          uploaded?.secure_url || ""

        quote.mockupUrl =
          uploaded?.secure_url || ""

        quote.mockupPublicId =
          uploaded?.public_id || ""

        quote.mockupName =
          req.file.originalname || ""

        quote.mockupMimeType =
          req.file.mimetype || ""
      }

      /* ================= SAVE ================= */

      const oldStatus = quote.status

      quote.price = finalPrice

      quote.finalPrice = finalPrice

      quote.mockupMessage =
        mockupMessage

      quote.mockupSentAt =
        new Date()

      quote.status =
        "approval_payment"

      addTimeline(
        quote,
        "approval_payment",

        oldStatus === "approval_payment"
          ? "Digital mockup and quote resent to customer"
          : `Digital mockup sent to customer; workflow moved from ${oldStatus} to approval_payment`
      )

      await quote.save()

      await sendStatusEmail(
        quote.email,
        "approval_payment",
        quote
      )

      return res.json({
        success: true,
        message:
          "Digital mockup and quote saved successfully",
        data: quote
      })
    } catch (error) {
      console.error(
        "Send mockup failed:",
        error
      )

      return res.status(500).json({
        success: false,
        message:
          "Failed to upload or send digital mockup"
      })
    }
  }
)

/* ==============================================
   PATCH QUOTE — ADMIN ONLY
============================================== */

router.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const body = req.body || {}

      if (!Object.keys(body).length) {
        return res.status(400).json({
          success: false,
          message:
            "Update request body is empty or could not be parsed"
        })
      }

      const quote = await findQuote(
        req,
        res
      )

      if (!quote) return

      const approvalStatus =
        body.approvalStatus

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
        return res.json({
          success: true,
          message: "Quote already processed",
          data: quote,
          order: null
        })
      }

      /* ================= WORKFLOW UPDATE ================= */

      if (
        body.status &&
        !approvalStatus
      ) {
        const requestedStatus =
          asString(body.status)

        if (
          !WORKFLOW_STATUSES.includes(
            requestedStatus
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Invalid quote status: ${requestedStatus}`
          })
        }

        if (
          quote.status !==
          requestedStatus
        ) {
          const oldStatus =
            quote.status

          quote.status =
            requestedStatus

          addTimeline(
            quote,
            requestedStatus,
            `Workflow moved from ${oldStatus} to ${requestedStatus}`
          )
        }

        if (
          body.adminNotes !== undefined
        ) {
          quote.adminNotes =
            asString(body.adminNotes)
        }

        if (
          body.denialReason !== undefined
        ) {
          quote.denialReason =
            asString(body.denialReason)
        }

        if (
          body.finalPrice !== undefined
        ) {
          quote.finalPrice =
            safePositive(
              body.finalPrice,
              quote.finalPrice
            )
        }

        if (
          body.price !== undefined
        ) {
          quote.price =
            safePositive(
              body.price,
              quote.price
            )
        }

        if (
          body.shippingCost !== undefined
        ) {
          quote.shippingCost =
            safePositive(
              body.shippingCost,
              quote.shippingCost
            )
        }

        await quote.save()

        return res.json({
          success: true,
          data: quote,
          order: null
        })
      }

      /* ================= APPROVE QUOTE ================= */

      if (
        approvalStatus === "approved"
      ) {
        const quantity = safeQuantity(
          quote.quantity
        )

        const itemPrice = safePositive(
          body.finalPrice !== undefined
            ? body.finalPrice
            : (
                quote.finalPrice ||
                quote.price ||
                0
              )
        )

        quote.finalPrice = itemPrice

        quote.approvalStatus =
          "approved"

        quote.status =
          "payment_required"

        if (
          body.adminNotes !== undefined
        ) {
          quote.adminNotes =
            asString(body.adminNotes)
        }

        addTimeline(
          quote,
          "approved",
          "Quote approved"
        )

        addTimeline(
          quote,
          "payment_required",
          "Quote converted to order and payment is required"
        )

        /* ================= TOTALS ================= */

        const subtotal = itemPrice

        const tax = Number(
          (
            subtotal *
            TAX_RATE
          ).toFixed(2)
        )

        const shippingCost =
          safePositive(
            quote.shippingCost
          )

        const finalPrice = Number(
          (
            subtotal +
            tax +
            shippingCost
          ).toFixed(2)
        )

        /* ================= ORDER ITEMS ================= */

        const orderItems =
          Array.isArray(quote.items) &&
          quote.items.length

            ? quote.items.map(
                (item) => ({
                  name:
                    item.name ||
                    quote.projectType ||
                    quote.serviceType ||
                    "Custom Quote Order",

                  quantity:
                    safeQuantity(
                      item.quantity
                    ),

                  price:
                    safePositive(
                      item.price
                    ),

                  serviceType:
                    item.serviceType ||
                    quote.serviceType ||
                    "",

                  source: "quote"
                })
              )

            : [
                {
                  name:
                    quote.projectType ||
                    quote.serviceLabel ||
                    quote.serviceType ||
                    "Custom Quote Order",

                  quantity,

                  price: itemPrice,

                  serviceType:
                    quote.serviceType || "",

                  source: "quote"
                }
              ]

        /* ================= CREATE ORDER ================= */

        const order = await Order.create({
          customerName:
            quote.customerName ||
            "Customer",

          email:
            normalizeEmail(
              quote.email
            ),

          phone:
            quote.phone || "",

          items: orderItems,

          subtotal,

          tax,

          shippingCost,

          finalPrice,

          status:
            "payment_required",

          source: "quote",

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

        quote.orderId =
          order._id

        await quote.save()

        await sendStatusEmail(
          order.email,
          "payment_required",
          order
        )

        return res.json({
          success: true,
          data: quote,
          order
        })
      }

      /* ================= DENY QUOTE ================= */

      if (
        approvalStatus === "denied"
      ) {
        quote.approvalStatus =
          "denied"

        quote.status =
          "denied"

        quote.denialReason =
          asString(
            body.denialReason ||
            quote.denialReason
          )

        if (
          body.adminNotes !== undefined
        ) {
          quote.adminNotes =
            asString(body.adminNotes)
        }

        addTimeline(
          quote,
          "denied",

          quote.denialReason
            ? `Quote denied: ${quote.denialReason}`
            : "Quote denied"
        )

        await quote.save()

        await sendStatusEmail(
          quote.email,
          "denied",
          quote
        )

        return res.json({
          success: true,
          data: quote,
          order: null
        })
      }

      /* ================= GENERAL PATCH ================= */

      const protectedFields = new Set([
        "_id",
        "orderId",
        "approvalStatus",
        "status",
        "timeline",
        "createdAt",
        "updatedAt",
        "__v"
      ])

      for (
        const [key, value]
        of Object.entries(body)
      ) {
        if (
          protectedFields.has(key)
        ) {
          continue
        }

        switch (key) {
          case "quantity":
            quote.quantity =
              safeQuantity(
                value,
                quote.quantity || 1
              )
            break

          case "price":
          case "finalPrice":
          case "shippingCost":
            quote[key] =
              safePositive(
                value,
                quote[key] || 0
              )
            break

          case "email":
            quote.email =
              normalizeEmail(value)
            break

          case "items":
            if (Array.isArray(value)) {
              quote.items = value
            }
            break

          default:
            quote[key] = value
        }
      }

      await quote.save()

      return res.json({
        success: true,
        data: quote,
        order: null
      })
    } catch (error) {
      console.error(
        "Patch quote failed:",
        error
      )

      return res.status(500).json({
        success: false,
        message: "Failed to update quote"
      })
    }
  }
)

/* ==============================================
   DELETE / ARCHIVE — ADMIN ONLY
============================================== */

router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const quote = await findQuote(
        req,
        res
      )

      if (!quote) return

      const oldStatus =
        quote.status

      quote.status =
        "archive"

      addTimeline(
        quote,
        "archive",
        `Quote archived from ${oldStatus}`
      )

      await quote.save()

      return res.json({
        success: true,
        message:
          "Quote archived successfully",
        data: quote
      })
    } catch (error) {
      console.error(
        "Archive quote failed:",
        error
      )

      return res.status(500).json({
        success: false,
        message: "Failed to archive quote"
      })
    }
  }
)

export default router
