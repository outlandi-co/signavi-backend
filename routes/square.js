
import express from "express"
import mongoose from "mongoose"
import {
  claimSquarePaymentCreationAttempt
} from "../utils/claimSquarePaymentCreationAttempt.js"
import {
  prepareSquarePaymentCreation
} from "../utils/prepareSquarePaymentCreation.js"
import { SquareClient, SquareEnvironment } from "square"
import Quote from "../models/Quote.js"
import Order from "../models/Order.js"
import { verifySquareAuthorization } from "../utils/squarePaymentAuth.js"

const router = express.Router()

console.log("Square payment route loaded")

// =====================================================
// SQUARE CONFIGURATION
// =====================================================

const squareMode = String(
  process.env.SQUARE_ENVIRONMENT || ""
).trim().toLowerCase()

const configuredEnvironment =
  squareMode === "sandbox"
    ? SquareEnvironment.Sandbox
    : squareMode === "production"
      ? SquareEnvironment.Production
      : null

const squareToken = String(
  process.env.SQUARE_ACCESS_TOKEN || ""
).trim()

const LOCATION_ID = String(
  process.env.SQUARE_LOCATION_ID || ""
).trim()

const CLIENT_URL = String(
  process.env.CLIENT_URL || ""
).trim().replace(/\/$/, "")

const client =
  configuredEnvironment && squareToken && LOCATION_ID
    ? new SquareClient({
        token: squareToken,
        environment: configuredEnvironment
      })
    : null

if (!client) {
  console.warn(
    "Square payments unavailable: configuration incomplete."
  )
} else {
  console.log(`Square environment: ${squareMode}`)
}

const TAX_RATE = 0.0825

// =====================================================
// MONEY HELPERS
// =====================================================

const toNumber = (value, fallback = 0) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback
  }

  const number = Number(value)

  return Number.isFinite(number)
    ? number
    : fallback
}

const getItemPrice = (item = {}) =>
  toNumber(
    item.salePrice ??
    item.finalPrice ??
    item.unitPrice ??
    item.price ??
    item.selectedVariant?.price ??
    item.variant?.price ??
    item.basePrice ??
    item.listPrice ??
    0
  )

const getItemQuantity = (item = {}) =>
  Math.max(1, toNumber(item.quantity, 1))

const getShipping = (record = {}) =>
  toNumber(
    record.shippingCost ??
    record.shipping ??
    record.shippingTotal ??
    record.deliveryFee ??
    record.shippingRate?.amount ??
    0
  )

const getSubtotal = (record = {}) => {
  if (
    Array.isArray(record.items) &&
    record.items.length > 0
  ) {
    return record.items.reduce((sum, item) => {
      const price = getItemPrice(item)
      const quantity = getItemQuantity(item)

      return sum + price * quantity
    }, 0)
  }

  return (
    toNumber(record.subtotal) ||
    toNumber(record.price) ||
    0
  )
}

// =====================================================
// CREATE SQUARE PAYMENT LINK
// =====================================================

router.post("/create-payment/:id", async (req, res) => {
  try {
    // =================================================
    // STEP 1 - VERIFY CONFIGURATION
    // =================================================

    if (!client) {
      return res.status(503).json({
        success: false,
        message:
          "Square payments are not configured for this backend."
      })
    }

    if (!CLIENT_URL) {
      return res.status(503).json({
        success: false,
        message:
          "CLIENT_URL is not configured for Square checkout."
      })
    }

    // =================================================
    // STEP 2 - VALIDATE RECORD ID
    // =================================================

    const { id } = req.params

    if (
      !id ||
      !/^[a-f0-9]{24}$/i.test(id)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID"
      })
    }

    // =================================================
    // STEP 3 - FIND ORDER OR APPROVED QUOTE
    // =================================================

    let record = await Quote.findById(id)
    let type = "order"

    if (record) {
      const quote = record

      if (
        quote.approvalStatus !== "approved" ||
        !quote.orderId
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Quote approval and an associated order " +
            "are required before payment."
        })
      }

      const associatedOrder = await Order.findOne({
        _id: quote.orderId,
        quoteId: quote._id
      })

      if (!associatedOrder) {
        return res.status(409).json({
          success: false,
          message:
            "The associated quote order could not be verified."
        })
      }

      record = associatedOrder
    } else {
      record = await Order.findById(id)
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Record not found"
      })
    }

    // Orders created from quotes must still have
    // an approved source quote.
    if (
      String(record.source || "").toLowerCase() === "quote"
    ) {
      if (!record.quoteId) {
        return res.status(409).json({
          success: false,
          message:
            "Quote order is missing its source quote."
        })
      }

      const sourceQuote = await Quote.findOne({
        _id: record.quoteId,
        orderId: record._id,
        approvalStatus: "approved"
      })

      if (!sourceQuote) {
        return res.status(409).json({
          success: false,
          message:
            "The quote approval could not be verified."
        })
      }
    }

    // =================================================
    // STEP 4 - VERIFY STOREFRONT AUTHORIZATION
    // =================================================

    const isStorefrontOrder =
      ["store", "cart_drawer"].includes(
        String(record.source || "").toLowerCase()
      ) ||
      (
        Array.isArray(record.items) &&
        record.items.some((item) =>
          Boolean(item.productId)
        )
      )

    if (isStorefrontOrder) {
      const authorization = req.get(
        "x-signavi-payment-authorization"
      )

      if (
        !verifySquareAuthorization(
          record,
          authorization
        )
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Complete secure checkout before creating a payment."
        })
      }
    }

    // =================================================
    // STEP 5 - REQUIRE PAYMENT-READY ORDER
    // =================================================

    if (record.status !== "payment_required") {
      return res.status(409).json({
        success: false,
        message:
          "Order is not ready for Square payment."
      })
    }

    if (
      ["paid", "refunded"].includes(
        String(record.paymentStatus || "").toLowerCase()
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This order has already been paid or refunded."
      })
    }

    // =================================================
    // STEP 6 - PREVENT DUPLICATE PAYMENT LINKS
    // =================================================

    if (
      record.paymentUrl ||
      record.squarePaymentLinkId ||
      record.squareOrderId
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This order already has Square payment tracking. " +
          "Review or cancel the existing payment link."
      })
    }

    // =================================================
    // STEP 7 - CALCULATE PAYMENT AMOUNT
    // =================================================

    const subtotal = getSubtotal(record)
    const shipping = getShipping(record)

    const tax =
      toNumber(record.tax) ||
      subtotal * TAX_RATE

    // Use the order total saved by backend checkout.
    // Do not recalculate a storefront customer's charge.
    const total = toNumber(record.finalPrice)

    if (
      !Number.isFinite(total) ||
      total <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The order does not have a valid payable total."
      })
    }

    const cents = Math.round(total * 100)

    if (
      !Number.isSafeInteger(cents) ||
      cents < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid Square payment amount."
      })
    }

    // =================================================
    // STEP 8 - CREATE SQUARE PAYMENT LINK
    // =================================================

    // Dedicated database-backed integration test gate.
    // Never authorizes Square creation.
    if (
      process.env.NODE_ENV === "test" &&
      process.env.SQUARE_RESERVATION_INTEGRATION_TEST === "true" &&
      mongoose.connection.db?.databaseName ===
        "signavi_reservation_isolated_test"
    ) {
      const preparation =
        await prepareSquarePaymentCreation({
          orderId: record._id,
          environment: squareMode,
          amountCents: cents
        })

      let claimed = false

      if (preparation.prepared) {
        const attempt = await claimSquarePaymentCreationAttempt({
          orderId: record._id,
          environment: squareMode,
          amountCents: cents,
          owner: preparation.owner
        })

        claimed = attempt.claimed === true
      }

      return res.status(423).json({
        success: false,
        message: claimed
          ? "Payment attempt claimed; Square execution disabled."
          : "Payment creation already reserved or unavailable.",
        reason: claimed
          ? "square_execution_not_authorized"
          : preparation.prepared
            ? "payment_attempt_claim_rejected"
            : preparation.reason,
        squareRequestAuthorized: false
      })
    }
    // Block legacy Square creation in the isolated
    // Smart Shipping V3 development database.
    if (
      mongoose.connection.db?.databaseName ===
      "signavi_shipping_v3_dev"
    ) {
      return res.status(423).json({
        success: false,
        message:
          "Legacy Square creation is disabled in " +
          "the isolated Smart Shipping V3 database."
      })
    }

    const response =
      await client.checkout.paymentLinks.create({
        idempotencyKey:
          `signavi-${squareMode}-${record._id}`,
        order: {
          locationId: LOCATION_ID,
          note: `ID:${record._id}`,
          lineItems: [
            {
              name: `ORDER #${record._id}`,
              quantity: "1",
              basePriceMoney: {
                amount: BigInt(cents),
                currency: "USD"
              }
            }
          ]
        },
        checkoutOptions: {
          redirectUrl:
            `${CLIENT_URL}/success/${record._id}`,
          askForShippingAddress: false
        }
      })

    // =================================================
    // STEP 9 - VALIDATE SQUARE RESPONSE
    // =================================================

    const paymentLink = response?.paymentLink

    const paymentUrl =
      paymentLink?.url

    const squareOrderId =
      paymentLink?.orderId ||
      paymentLink?.order_id

    if (
      !paymentUrl ||
      !paymentLink?.id ||
      !squareOrderId
    ) {
      console.error(
        "Square returned incomplete payment-link data."
      )

      throw new Error(
        "Square payment link missing required identifiers."
      )
    }

    // =================================================
    // STEP 10 - SAVE PAYMENT TRACKING
    // =================================================

    record.paymentUrl = paymentUrl
    record.squareEnvironment = squareMode
    record.squarePaymentLinkId = paymentLink.id
    record.squareOrderId = squareOrderId
    record.squareExpectedAmountCents = cents

    await record.save()

    console.log("Square payment link created:", {
      orderId: String(record._id),
      environment: squareMode
    })

    // =================================================
    // STEP 11 - RETURN PAYMENT LINK
    // =================================================

    return res.json({
      success: true,
      paymentUrl,
      orderId: record._id,
      environment: squareMode,
      totals: {
        subtotal,
        shipping,
        tax,
        total
      }
    })

  } catch (error) {
    console.error(
      "Square payment creation failed:",
      error.message
    )

    return res.status(500).json({
      success: false,
      message:
        "Unable to create Square payment link."
    })
  }
})

export default router
