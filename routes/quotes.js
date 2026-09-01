import express from "express"
import mongoose from "mongoose"

import Quote from "../models/Quote.js"
import Order from "../models/Order.js"

import { sendOrderStatusEmail } from "../utils/sendEmail.js"

import upload from "../middleware/upload.js"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

console.log("🔥 QUOTES ROUTE LOADED")

/* =========================================================
   CONSTANTS
========================================================= */

const TAX_RATE = 0.0825

const QUOTE_WORKFLOW_STATUSES = [
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

const ACTIVE_QUOTE_STATUSES = [
  "quotes",
  "review_mockup",
  "approval_payment"
]

/* =========================================================
   HELPERS
========================================================= */

const safeNumber = (value, fallback = 0) => {
  const number = Number(value)

  return Number.isFinite(number)
    ? number
    : fallback
}

const safePositiveNumber = (
  value,
  fallback = 0
) => {
  const number = Number(value)

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return fallback
  }

  return number
}

const safeQuantity = (
  value,
  fallback = 1
) => {
  const number = Number(value)

  if (
    !Number.isFinite(number) ||
    number < 1
  ) {
    return fallback
  }

  return Math.floor(number)
}

const normalizeEmail = (email = "") => {
  return String(email)
    .trim()
    .toLowerCase()
}

const uploadBufferToCloudinary = (
  file,
  folder = "signavi/quote-artwork"
) => {
  return new Promise(
    (resolve, reject) => {
      const uploadStream =
        cloudinary.uploader.upload_stream(
          {
            folder,

            resource_type:
              "auto"
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

      uploadStream.end(
        file.buffer
      )
    }
  )
}

/* =========================================================
   GET ALL QUOTES
========================================================= */

router.get(
  "/",
  async (req, res) => {
    try {
      const includeProcessed =
        req.query.includeProcessed ===
        "true"

      let filter = {}

      /*
       * Default behavior:
       * only return quotes that are still
       * actively moving through quote review.
       *
       * Admin can request every quote using:
       *
       * ?includeProcessed=true
       */

      if (!includeProcessed) {
        filter = {
          approvalStatus: "pending",

          status: {
            $in:
              ACTIVE_QUOTE_STATUSES
          }
        }
      }

      const quotes =
        await Quote.find(filter)
          .sort({
            createdAt: -1
          })
          .lean()

      return res.json({
        success: true,
        count: quotes.length,
        data: quotes
      })
    } catch (err) {
      console.error(
        "❌ GET QUOTES ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,

          message:
            err.message ||
            "Failed to load quotes"
        })
    }
  }
)

/* =========================================================
   CREATE QUOTE
========================================================= */

router.post(
  "/",

  upload.single("artwork"),

  async (req, res) => {
    try {
      const body =
        req.body || {}

      console.log(
        "🔥 CREATE QUOTE BODY:",
        body
      )

      console.log(
        "🖼️ CREATE QUOTE FILE:",

        req.file
          ? {
              name:
                req.file
                  .originalname,

              type:
                req.file
                  .mimetype,

              size:
                req.file
                  .size
            }
          : "No artwork uploaded"
      )

      /* ================= VALIDATE BODY ================= */

      if (
        Object.keys(body)
          .length === 0
      ) {
        console.error(
          "❌ CREATE QUOTE: Request body is empty"
        )

        return res
          .status(400)
          .json({
            success: false,

            message:
              "Quote request body is empty or could not be parsed"
          })
      }

      /* ================= BASIC VALUES ================= */

      const quantity =
        safeQuantity(
          body.quantity,
          1
        )

      const price =
        safePositiveNumber(
          body.price,
          0
        )

      const finalPrice =
        safePositiveNumber(
          body.finalPrice,
          price
        )

      const shippingCost =
        safePositiveNumber(
          body.shippingCost,
          0
        )

      /* ================= PARSE ITEMS ================= */

      let items = []

      if (body.items) {
        try {
          const parsedItems =
            typeof body.items ===
            "string"
              ? JSON.parse(
                  body.items
                )
              : body.items

          if (
            Array.isArray(
              parsedItems
            )
          ) {
            items =
              parsedItems.map(
                (item) => ({
                  name:
                    String(
                      item?.name ||
                        ""
                    ).trim(),

                  quantity:
                    safeQuantity(
                      item?.quantity,
                      1
                    ),

                  price:
                    safePositiveNumber(
                      item?.price,
                      0
                    ),

                  serviceType:
                    String(
                      item
                        ?.serviceType ||
                        ""
                    ).trim(),

                  source:
                    String(
                      item?.source ||
                        "quote"
                    ).trim()
                })
              )
          }
        } catch (
          parseError
        ) {
          console.error(
            "❌ QUOTE ITEMS PARSE ERROR:",
            parseError
          )

          items = []
        }
      }

      /* ================= ARTWORK ================= */

      let artworkUrl =
        String(
          body.artworkUrl ||
            ""
        ).trim()

      let artworkPublicId =
        String(
          body.artworkPublicId ||
            ""
        ).trim()

      let artworkName =
        String(
          body.artworkName ||
            ""
        ).trim()

      if (req.file) {
        console.log(
          "📤 UPLOADING QUOTE ARTWORK TO CLOUDINARY..."
        )

        const uploadedArtwork =
          await uploadBufferToCloudinary(
            req.file
          )

        artworkUrl =
          uploadedArtwork
            ?.secure_url ||
          ""

        artworkPublicId =
          uploadedArtwork
            ?.public_id ||
          ""

        artworkName =
          req.file
            ?.originalname ||
          ""

        console.log(
          "✅ QUOTE ARTWORK UPLOADED:",
          artworkUrl
        )
      }

      /* ================= CREATE DATA ================= */

      const quoteData = {
        customerName:
          String(
            body.customerName ||
              ""
          ).trim(),

        email:
          normalizeEmail(
            body.email
          ),

        phone:
          String(
            body.phone ||
              ""
          ).trim(),

        projectType:
          String(
            body.projectType ||
              ""
          ).trim(),

        serviceType:
          String(
            body.serviceType ||
              ""
          ).trim(),

        serviceLabel:
          String(
            body.serviceLabel ||
              ""
          ).trim(),

        printType:
          String(
            body.printType ||
              ""
          ).trim(),

        turnaround:
          String(
            body.turnaround ||
              "standard"
          ).trim(),

        notes:
          String(
            body.notes ||
              ""
          ),

        quantity,

        items,

        price,

        finalPrice,

        shippingCost,

        artwork:
          artworkUrl,

        artworkUrl,

        artworkPublicId,

        artworkName,

        approvalStatus:
          "pending",

        denialReason:
          "",

        adminNotes:
          String(
            body.adminNotes ||
              ""
          ),

        status:
          "quotes",

        source:
          String(
            body.source ||
              "quote"
          ).trim(),

        timeline: [
          {
            status:
              "quotes",

            note:
              "Quote created",

            date:
              new Date()
          }
        ]
      }

      /* ================= SAVE ================= */

      const quote =
        await Quote.create(
          quoteData
        )

      console.log(
        "✅ QUOTE CREATED:",
        quote._id
      )

      return res
        .status(201)
        .json({
          success: true,
          data: quote
        })
    } catch (err) {
      console.error(
        "❌ CREATE QUOTE ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,

          message:
            err.message ||
            "Failed to create quote"
        })
    }
  }
)

/* =========================================================
   GET ONE QUOTE
========================================================= */

router.get(
  "/:id",
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId
          .isValid(
            req.params.id
          )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid quote ID"
          })
      }

      const quote =
        await Quote.findById(
          req.params.id
        )

      if (!quote) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Quote not found"
          })
      }

      return res.json({
        success: true,
        data: quote
      })
    } catch (err) {
      console.error(
        "❌ GET ONE QUOTE ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,

          message:
            err.message ||
            "Failed to load quote"
        })
    }
  }
)

/* =========================================================
   UPLOAD / SEND DIGITAL MOCKUP
========================================================= */

router.patch(
  "/:id/mockup",

  upload.single("mockup"),

  async (req, res) => {
    try {
      /* ================= VALIDATE ID ================= */

      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid quote ID"
          })
      }

      /* ================= FIND QUOTE ================= */

      const quote =
        await Quote.findById(
          req.params.id
        )

      if (!quote) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Quote not found"
          })
      }

      const body =
        req.body || {}

      /* ================= FINAL PRICE ================= */

      const finalPrice =
        safePositiveNumber(
          body.finalPrice !==
            undefined
            ? body.finalPrice
            : body.price,

          quote.finalPrice ||
            quote.price ||
            0
        )

      if (
        !Number.isFinite(finalPrice) ||
        finalPrice <= 0
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "A valid final quote price is required before sending the mockup"
          })
      }

      /* ================= CUSTOMER MESSAGE ================= */

      const mockupMessage =
        String(
          body.mockupMessage ||
            quote.mockupMessage ||
            ""
        ).trim()

      if (!mockupMessage) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "A customer message is required before sending the mockup"
          })
      }

      /* ================= REQUIRE MOCKUP ================= */

      if (
        !req.file &&
        !quote.mockupUrl &&
        !quote.mockup
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Choose a digital mockup or proof before sending"
          })
      }

      /* ================= TIMELINE ================= */

      if (
        !Array.isArray(
          quote.timeline
        )
      ) {
        quote.timeline = []
      }

      /* ================= UPLOAD MOCKUP ================= */

      if (req.file) {
        const allowedTypes = [
          "image/png",
          "image/jpeg",
          "image/webp",
          "application/pdf"
        ]

        if (
          !allowedTypes.includes(
            req.file.mimetype
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Mockup must be a PNG, JPG, WEBP, or PDF file"
            })
        }

        console.log(
          "📤 UPLOADING DIGITAL MOCKUP TO CLOUDINARY..."
        )

        const uploadedMockup =
          await uploadBufferToCloudinary(
            req.file,
            "signavi/quote-mockups"
          )

        quote.mockup =
          uploadedMockup?.secure_url ||
          ""

        quote.mockupUrl =
          uploadedMockup?.secure_url ||
          ""

        quote.mockupPublicId =
          uploadedMockup?.public_id ||
          ""

        quote.mockupName =
          req.file?.originalname ||
          ""

        quote.mockupMimeType =
          req.file?.mimetype ||
          ""

        console.log(
          "✅ DIGITAL MOCKUP UPLOADED:",
          quote.mockupUrl
        )
      }

      /* ================= SAVE PRICE ================= */

      quote.price =
        finalPrice

      quote.finalPrice =
        finalPrice

      /* ================= SAVE MESSAGE ================= */

      quote.mockupMessage =
        mockupMessage

      quote.mockupSentAt =
        new Date()

      /* ================= MOVE WORKFLOW ================= */

      const previousStatus =
        quote.status

      quote.status =
        "approval_payment"

      quote.timeline.push({
        status:
          "approval_payment",

        note:
          previousStatus ===
          "approval_payment"
            ? "Digital mockup and quote resent to customer"
            : `Digital mockup sent to customer; workflow moved from ${previousStatus} to approval_payment`,

        date:
          new Date()
      })

      /* ================= SAVE ================= */

      await quote.save()

      console.log(
        "✅ MOCKUP SAVED TO QUOTE:",
        quote._id
      )

      /* ================= EMAIL ================= */

      if (quote.email) {
        try {
          await sendOrderStatusEmail(
            quote.email,
            "approval_payment",
            quote
          )

          console.log(
            "📧 MOCKUP / APPROVAL EMAIL TRIGGERED:",
            quote._id
          )
        } catch (emailError) {
          console.error(
            "❌ MOCKUP EMAIL ERROR:",
            emailError
          )
        }
      } else {
        console.warn(
          "⚠️ MOCKUP EMAIL NOT SENT: Quote has no email"
        )
      }

      /* ================= RESPONSE ================= */

      return res.json({
        success: true,

        message:
          "Digital mockup and quote saved successfully",

        data: quote
      })
    } catch (err) {
      console.error(
        "❌ SEND MOCKUP ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,

          message:
            err.message ||
            "Failed to upload or send digital mockup"
        })
    }
  }
)

/* =========================================================
   PATCH QUOTE
========================================================= */

router.patch(
  "/:id",
  async (req, res) => {
    try {
      /* ================= VALIDATE ID ================= */

      if (
        !mongoose.Types.ObjectId
          .isValid(
            req.params.id
          )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid quote ID"
          })
      }

      const body =
        req.body || {}

      console.log(
        "🔥 PATCH QUOTE BODY:",
        body
      )

      if (
        Object.keys(body)
          .length === 0
      ) {
        return res
          .status(400)
          .json({
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
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Quote not found"
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

      let createdOrder =
        null

      /* =====================================================
         APPROVAL / DENIAL DUPLICATE GUARD
      ===================================================== */

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

          data: quote,

          order: null
        })
      }

      /* =====================================================
         WORKFLOW STATUS UPDATE
      ===================================================== */

      if (
        body.status &&
        !approvalStatus
      ) {
        const requestedStatus =
          String(
            body.status
          ).trim()

        if (
          !QUOTE_WORKFLOW_STATUSES.includes(
            requestedStatus
          )
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                `Invalid quote status: ${requestedStatus}`
            })
        }

        const previousStatus =
          quote.status

        if (
          previousStatus !==
          requestedStatus
        ) {
          quote.status =
            requestedStatus

          quote.timeline.push({
            status:
              requestedStatus,

            note:
              `Workflow moved from ${previousStatus} to ${requestedStatus}`,

            date:
              new Date()
          })
        }

        /* ================= OPTIONAL FIELDS ================= */

        if (
          body.adminNotes !==
          undefined
        ) {
          quote.adminNotes =
            String(
              body.adminNotes ||
                ""
            )
        }

        if (
          body.denialReason !==
          undefined
        ) {
          quote.denialReason =
            String(
              body.denialReason ||
                ""
            )
        }

        if (
          body.finalPrice !==
          undefined
        ) {
          quote.finalPrice =
            safePositiveNumber(
              body.finalPrice,
              quote.finalPrice
            )
        }

        if (
          body.price !==
          undefined
        ) {
          quote.price =
            safePositiveNumber(
              body.price,
              quote.price
            )
        }

        if (
          body.shippingCost !==
          undefined
        ) {
          quote.shippingCost =
            safePositiveNumber(
              body.shippingCost,
              quote.shippingCost
            )
        }

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

      /* =====================================================
         APPROVE QUOTE
      ===================================================== */

      if (
        approvalStatus ===
        "approved"
      ) {
        /* ================= PRICE ================= */

        const quantity =
          safeQuantity(
            quote.quantity,
            1
          )

        const itemPrice =
          safePositiveNumber(
            body.finalPrice !==
              undefined
              ? body.finalPrice
              : (
                  quote.finalPrice ||
                  quote.price ||
                  0
                ),
            0
          )

        /*
         * Quote.finalPrice is treated as the
         * approved pre-tax quote price.
         */

        quote.finalPrice =
          itemPrice

        quote.approvalStatus =
          "approved"

        quote.status =
          "payment_required"

        if (
          body.adminNotes !==
          undefined
        ) {
          quote.adminNotes =
            String(
              body.adminNotes ||
                ""
            )
        }

        quote.timeline.push({
          status:
            "approved",

          note:
            "Quote approved",

          date:
            new Date()
        })

        quote.timeline.push({
          status:
            "payment_required",

          note:
            "Quote converted to order and payment is required",

          date:
            new Date()
        })

        /* ================= ORDER TOTALS ================= */

        const subtotal =
          itemPrice

        const tax =
          Number(
            (
              subtotal *
              TAX_RATE
            ).toFixed(2)
          )

        const shippingCost =
          safePositiveNumber(
            quote.shippingCost,
            0
          )

        const orderFinalPrice =
          Number(
            (
              subtotal +
              tax +
              shippingCost
            ).toFixed(2)
          )

        /* ================= ORDER ITEMS ================= */

        let orderItems = []

        if (
          Array.isArray(
            quote.items
          ) &&
          quote.items.length >
            0
        ) {
          orderItems =
            quote.items.map(
              (item) => ({
                name:
                  item.name ||
                  quote
                    .projectType ||
                  quote
                    .serviceType ||
                  "Custom Quote Order",

                quantity:
                  safeQuantity(
                    item.quantity,
                    1
                  ),

                price:
                  safePositiveNumber(
                    item.price,
                    0
                  ),

                serviceType:
                  item.serviceType ||
                  quote
                    .serviceType ||
                  "",

                source:
                  "quote"
              })
            )
        } else {
          orderItems = [
            {
              name:
                quote
                  .projectType ||
                quote
                  .serviceLabel ||
                quote
                  .serviceType ||
                "Custom Quote Order",

              quantity,

              price:
                itemPrice,

              serviceType:
                quote
                  .serviceType ||
                "",

              source:
                "quote"
            }
          ]
        }

        /* ================= CREATE ORDER ================= */

        createdOrder =
          await Order.create({
            customerName:
              quote.customerName ||
              "Customer",

            email:
              normalizeEmail(
                quote.email
              ),

            phone:
              quote.phone ||
              "",

            items:
              orderItems,

            subtotal,

            tax,

            shippingCost,

            finalPrice:
              orderFinalPrice,

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

        /* ================= CONNECT ORDER ================= */

        quote.orderId =
          createdOrder._id

        await quote.save()

        /* ================= EMAIL ================= */

        if (createdOrder.email) {
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
          } catch (
            emailError
          ) {
            console.error(
              "❌ PAYMENT EMAIL ERROR:",
              emailError
            )
          }
        } else {
          console.warn(
            "⚠️ PAYMENT EMAIL NOT SENT: Quote has no email"
          )
        }

        return res.json({
          success: true,
          data: quote,
          order: createdOrder
        })
      }

      /* =====================================================
         DENY QUOTE
      ===================================================== */

      if (
        approvalStatus ===
        "denied"
      ) {
        quote.approvalStatus =
          "denied"

        quote.status =
          "denied"

        quote.denialReason =
          String(
            body.denialReason ||
              quote.denialReason ||
              ""
          )

        if (
          body.adminNotes !==
          undefined
        ) {
          quote.adminNotes =
            String(
              body.adminNotes ||
                ""
            )
        }

        quote.timeline.push({
          status:
            "denied",

          note:
            quote.denialReason
              ? `Quote denied: ${quote.denialReason}`
              : "Quote denied",

          date:
            new Date()
        })

        await quote.save()

        if (quote.email) {
          try {
            await sendOrderStatusEmail(
              quote.email,
              "denied",
              quote
            )

            console.log(
              "📧 DENIAL EMAIL TRIGGERED"
            )
          } catch (
            emailError
          ) {
            console.error(
              "❌ DENIAL EMAIL ERROR:",
              emailError
            )
          }
        } else {
          console.warn(
            "⚠️ DENIAL EMAIL NOT SENT: Quote has no email"
          )
        }

        return res.json({
          success: true,
          data: quote,
          order: null
        })
      }

      /* =====================================================
         GENERAL PATCH FIELDS
      ===================================================== */

      const protectedFields = [
        "_id",
        "orderId",
        "approvalStatus",
        "status",
        "timeline",
        "createdAt",
        "updatedAt",
        "__v"
      ]

      Object.keys(body).forEach(
        (key) => {
          if (
            protectedFields.includes(
              key
            )
          ) {
            return
          }

          switch (key) {
            case "quantity":
              quote.quantity =
                safeQuantity(
                  body.quantity,
                  quote.quantity ||
                    1
                )
              break

            case "price":
              quote.price =
                safePositiveNumber(
                  body.price,
                  quote.price ||
                    0
                )
              break

            case "finalPrice":
              quote.finalPrice =
                safePositiveNumber(
                  body.finalPrice,
                  quote.finalPrice ||
                    0
                )
              break

            case "shippingCost":
              quote.shippingCost =
                safePositiveNumber(
                  body.shippingCost,
                  quote.shippingCost ||
                    0
                )
              break

            case "email":
              quote.email =
                normalizeEmail(
                  body.email
                )
              break

            case "items":
              if (
                Array.isArray(
                  body.items
                )
              ) {
                quote.items =
                  body.items
              }
              break

            default:
              quote[key] =
                body[key]
              break
          }
        }
      )

      await quote.save()

      console.log(
        "✅ QUOTE UPDATED:",
        quote._id
      )

      return res.json({
        success: true,
        data: quote,
        order: null
      })
    } catch (err) {
      console.error(
        "❌ PATCH QUOTE ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,

          message:
            err.message ||
            "Failed to update quote"
        })
    }
  }
)

/* =========================================================
   DELETE / ARCHIVE QUOTE
========================================================= */

router.delete(
  "/:id",
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId
          .isValid(
            req.params.id
          )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid quote ID"
          })
      }

      const quote =
        await Quote.findById(
          req.params.id
        )

      if (!quote) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Quote not found"
          })
      }

      /*
       * We archive instead of permanently
       * deleting so order history remains intact.
       */

      const previousStatus =
        quote.status

      quote.status =
        "archive"

      if (
        !Array.isArray(
          quote.timeline
        )
      ) {
        quote.timeline = []
      }

      quote.timeline.push({
        status:
          "archive",

        note:
          `Quote archived from ${previousStatus}`,

        date:
          new Date()
      })

      await quote.save()

      console.log(
        "🗄️ QUOTE ARCHIVED:",
        quote._id
      )

      return res.json({
        success: true,

        message:
          "Quote archived successfully",

        data: quote
      })
    } catch (err) {
      console.error(
        "❌ ARCHIVE QUOTE ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,

          message:
            err.message ||
            "Failed to archive quote"
        })
    }
  }
)

export default router