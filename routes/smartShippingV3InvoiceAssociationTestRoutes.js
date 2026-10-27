import express from "express"
import mongoose from "mongoose"

import { requireAuth } from "../middleware/auth.js"

import {
  acquireV3CheckoutLock
} from "../utils/smartShippingV3CheckoutLock.js"

import {
  linkV3InvoiceOrderDurable
} from "../utils/linkV3InvoiceOrderDurable.js"

// Intentionally NOT mounted in server.js.
// Isolated, test-only invoice association preparation.
// No payment ownership creation and no Square execution.

const router = express.Router()

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      code: "ADMIN_REQUIRED"
    })
  }

  next()
}

const requireIsolatedSandbox = (req, res, next) => {
  const permitted =
    process.env.NODE_ENV === "test" &&
    process.env.SQUARE_ENVIRONMENT === "sandbox" &&
    process.env.SMART_SHIPPING_V3_ENABLED === "true" &&
    process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED === "true" &&
    process.env.SMART_SHIPPING_V3_DURABLE_LINK_ENABLED === "true" &&
    process.env.SMART_SHIPPING_V3_INVOICE_HTTP_TEST_ENABLED === "true" &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.db?.databaseName ===
      "signavi_reservation_isolated_test"

  if (!permitted) {
    return res.status(503).json({
      success: false,
      code: "V3_INVOICE_ASSOCIATION_DISABLED",
      squareRequestAuthorized: false
    })
  }

  next()
}

router.post(
  "/orders/:orderId/invoices/:invoiceId/prepare-association",
  requireAuth,
  requireAdmin,
  requireIsolatedSandbox,
  async (req, res) => {
    const { orderId, invoiceId } = req.params

    if (
      !mongoose.isObjectIdOrHexString(orderId) ||
      !mongoose.isObjectIdOrHexString(invoiceId)
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_ASSOCIATION_IDENTIFIERS"
      })
    }

    const guestToken = req.get(
      "x-signavi-guest-checkout-token"
    )

    const signedQuote = req.body?.v3ShippingQuote

    if (
      typeof guestToken !== "string" ||
      !guestToken.trim() ||
      typeof signedQuote !== "string" ||
      !signedQuote.trim()
    ) {
      return res.status(400).json({
        success: false,
        code: "MISSING_CHECKOUT_CREDENTIALS"
      })
    }

    let lock

    try {
      lock = await acquireV3CheckoutLock(orderId)

      if (!lock) {
        return res.status(409).json({
          success: false,
          code: "V3_CHECKOUT_LOCK_UNAVAILABLE",
          squareRequestAuthorized: false
        })
      }

      const result = await linkV3InvoiceOrderDurable({
        lock,
        invoiceId,
        guestToken,
        signedQuote
      })

      if (!result.linked) {
        throw new Error(
          "Durable invoice association was not confirmed."
        )
      }

      // Lock deliberately retained for state-aware recovery.
      // Do not independently clear a transaction outcome.

      return res.status(202).json({
        success: true,
        code: "V3_INVOICE_ASSOCIATED_NO_PAYMENT",
        orderId: result.orderId,
        invoiceId: result.invoiceId,
        amountCents: result.amountCents,
        paymentCreated: false,
        squareRequestAuthorized: false
      })

    } catch (error) {
      console.error(
        "V3 isolated invoice association rejected:",
        error.message
      )

      // Fail closed. A claimed lock is retained for review
      // because transaction outcome could be uncertain.
      return res.status(503).json({
        success: false,
        code: "V3_INVOICE_ASSOCIATION_REQUIRES_REVIEW",
        paymentCreated: false,
        squareRequestAuthorized: false
      })
    }
  }
)

export default router