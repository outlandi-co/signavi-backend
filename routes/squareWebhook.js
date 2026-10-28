import {
  getSquareAccessToken,
  getSquareLocationId
} from "../utils/getSquareEnvironmentCredentials.js"

import SmartShippingV3PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  parseV3WebhookOrderReference
} from "../utils/smartShippingV3WebhookReference.js"
import {
  verifyV3WebhookPaymentBinding
} from "../utils/smartShippingV3WebhookPaymentBinding.js"

import {
  verifyV3ProductionWebhookPaymentBinding
} from "../utils/smartShippingV3ProductionWebhookPaymentBinding.js"

import express from "express"
import crypto from "node:crypto"
import fetch from "node-fetch"

import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import Invoice from "../models/Invoice.js"
import Notification from "../models/Notification.js"
import sendReceiptEmail from "../utils/sendReceiptEmail.js"

const router = express.Router()

// =====================================================
// SQUARE ENVIRONMENT
// =====================================================

const squareMode = String(
  process.env.SQUARE_ENVIRONMENT || ""
).trim().toLowerCase()

const validSquareMode =
  ["sandbox", "production"].includes(squareMode)

const OBJECT_ID = /^[a-f0-9]{24}$/i

const CLOSED_ORDER_STATES = [
  "cancelled",
  "canceled",
  "refunded",
  "production",
  "shipped",
  "delivered",
  "completed"
]

const CLOSED_INVOICE_STATES = [
  "cancelled",
  "production",
  "shipped",
  "delivered",
  "completed"
]

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ||
  "admin@signavistudio.store"

console.log("Square storefront payment webhook loaded")

// =====================================================
// VERIFY SQUARE WEBHOOK SIGNATURE
// =====================================================

const verifySignature = (rawBody, signature) => {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL

  if (
    !key ||
    !notificationUrl ||
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string"
  ) {
    return false
  }

  const expected = crypto
    .createHmac("sha256", key)
    .update(notificationUrl, "utf8")
    .update(rawBody)
    .digest()

  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) {
    return false
  }

  const received = Buffer.from(signature, "base64")

  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  )
}

// =====================================================
// RETRIEVE VERIFIED PAYMENT DATA FROM SQUARE
// =====================================================

const squareGet = async (endpoint) => {
  if (!validSquareMode) {
    throw new Error(
      "Invalid Square environment configuration"
    )
  }

  const token = String(
    getSquareAccessToken() || ""
  ).trim()

  if (!token) {
    throw new Error("SQUARE_ACCESS_TOKEN is missing")
  }

  const baseUrl =
    squareMode === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com"

  const response = await fetch(
    `${baseUrl}/v2/${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Square-Version":
          process.env.SQUARE_API_VERSION || "2026-08-19"
      },
      signal: AbortSignal.timeout(7000)
    }
  )

  if (!response.ok) {
    throw new Error(
      `Square API returned HTTP ${response.status}`
    )
  }

  return response.json()
}

// =====================================================
// MONEY HELPERS
// =====================================================

const toCents = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null
  }

  const amount = Number(value)

  if (!Number.isFinite(amount) || amount < 0) {
    return null
  }

  const cents = Math.round(
    (amount + Number.EPSILON) * 100
  )

  return Number.isSafeInteger(cents)
    ? cents
    : null
}

// =====================================================
// EXTRACT LOCAL ORDER REFERENCE
// =====================================================

const taggedId = (squareOrder) => {
  const reference = String(
    squareOrder?.reference_id || ""
  ).trim()

  const note = String(
    squareOrder?.note || ""
  ).trim()

  if (OBJECT_ID.test(reference)) {
    return reference
  }

  const match = note.match(
    /^(?:ID:|SIGNAVI_ORDER:)([a-f0-9]{24})$/i
  )

  return match?.[1] || null
}

// =====================================================
// FIND SIGNAVI ORDER
// =====================================================

const resolveOrder = async (squareOrder) => {
  const id = taggedId(squareOrder)

  const bySquareId = await Order.findOne({
    squareOrderId: squareOrder.id
  })

  if (bySquareId) {
    // A Square-order match cannot override a V3 reference mismatch.
    const v3Reference = parseV3WebhookOrderReference({
      referenceId: squareOrder?.reference_id
    })

    const hasV3Prefix =
      typeof squareOrder?.reference_id === "string" &&
      squareOrder.reference_id.startsWith("signavi-v3-")

    if (
      hasV3Prefix &&
      (
        !v3Reference ||
        String(bySquareId._id) !== v3Reference.orderId
      )
    ) {
      return null
    }

    if (
      id &&
      String(bySquareId._id) !== id &&
      String(bySquareId.quoteId || "") !== id
    ) {
      return null
    }

    return bySquareId
  }

  // Canonical V3 references are correlation identifiers only.
  // Payment authorization happens later in the webhook.
  const v3Reference = parseV3WebhookOrderReference({
    referenceId: squareOrder?.reference_id
  })

  if (v3Reference) {
    return Order.findById(v3Reference.orderId)
  }

  if (!id) {
    return null
  }

  const direct = await Order.findById(id)

  if (direct) {
    return direct
  }

  const quote = await Quote.findById(id)
    .select("_id")

  if (!quote) {
    return null
  }

  return Order.findOne({
    quoteId: quote._id
  })
}

// =====================================================
// SEND RECEIPT ONLY ONCE
// =====================================================

const sendReceiptOnce = async (
  orderId,
  paymentId
) => {
  const claimTime = new Date()

  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      paymentStatus: "paid",
      squarePaymentId: paymentId,
      squareEnvironment: "production",
      receiptEmailSent: {
        $ne: true
      },
      receiptEmailSentAt: null
    },
    {
      $set: {
        receiptEmailSentAt: claimTime
      }
    },
    {
      new: true
    }
  )

  if (!claimed) {
    return
  }

  const releaseClaim = async () => {
    await Order.updateOne(
      {
        _id: orderId,
        receiptEmailSent: {
          $ne: true
        },
        receiptEmailSentAt: claimTime
      },
      {
        $unset: {
          receiptEmailSentAt: ""
        }
      }
    )
  }

  if (!claimed.email) {
    console.warn(
      "Paid order has no receipt email:",
      String(orderId)
    )

    await releaseClaim()
    return
  }

  try {
    await sendReceiptEmail(claimed)

    await Order.updateOne(
      {
        _id: orderId,
        receiptEmailSentAt: claimTime
      },
      {
        $set: {
          receiptEmailSent: true,
          receiptCreatedAt: new Date()
        }
      }
    )

    console.log(
      "Receipt sent for Square order:",
      String(orderId)
    )
  } catch (error) {
    await releaseClaim()
    throw error
  }
}

// =====================================================
// RECONCILE CUSTOM INVOICE PAYMENT
// =====================================================

const reconcileInvoicePayment = async (
  req,
  invoice,
  squareOrder,
  payment,
  paidAmount
) => {
  if (
    !validSquareMode ||
    invoice.squareEnvironment !== squareMode
  ) {
    console.warn(
      "Invoice Square environment missing or mismatched:",
      String(invoice._id)
    )
    return
  }

  const expectedAmount = toCents(invoice.total)

  if (
    expectedAmount === null ||
    expectedAmount < 1 ||
    expectedAmount !== paidAmount
  ) {
    console.error(
      "Square payment does not match invoice total:",
      String(invoice._id)
    )
    return
  }

  if (
    invoice.paymentStatus === "refunded" ||
    (
      invoice.paymentStatus !== "paid" &&
      CLOSED_INVOICE_STATES.includes(invoice.status)
    )
  ) {
    console.warn(
      "Closed invoice requires manual reconciliation:",
      String(invoice._id)
    )
    return
  }

  if (
    (
      invoice.squarePaymentId &&
      invoice.squarePaymentId !== payment.id
    ) ||
    (
      invoice.paymentStatus === "paid" &&
      invoice.squarePaymentId !== payment.id
    )
  ) {
    console.warn(
      "Conflicting invoice payment:",
      String(invoice._id)
    )
    return
  }

  if (invoice.paymentStatus === "paid") {
    console.log(
      "Duplicate completed invoice payment event:",
      payment.id
    )
    return
  }

  const now = new Date()

  const updated = await Invoice.findOneAndUpdate(
    {
      _id: invoice._id,
      squareOrderId: squareOrder.id,
      squareEnvironment: squareMode,
      paymentStatus: "unpaid",
      squarePaymentId: {
        $in: [null, "", payment.id]
      },
      status: {
        $nin: CLOSED_INVOICE_STATES
      }
    },
    {
      $set: {
        paymentStatus: "paid",
        squarePaymentId: payment.id,
        paidAt: now,
        status: "paid"
      },
      $push: {
        timeline: {
          status: "paid",
          date: now,
          note:
            "Completed Square payment verified against " +
            "invoice total and Square order ID; " +
            "pending production review."
        }
      }
    },
    {
      new: true,
      runValidators: true
    }
  )

  if (!updated) {
    const latest = await Invoice.findById(invoice._id)

    if (
      latest?.paymentStatus === "paid" &&
      latest.squarePaymentId === payment.id &&
      latest.squareEnvironment === squareMode
    ) {
      console.log(
        "Concurrent invoice payment already reconciled:",
        String(invoice._id)
      )
    } else {
      console.warn(
        "Invoice changed during Square reconciliation:",
        String(invoice._id)
      )
    }

    return
  }

  console.log(
    "Verified Square payment for invoice:",
    String(updated._id)
  )

  // Sandbox payments must not send real notifications.
  if (squareMode === "sandbox") {
    console.log(
      "Sandbox invoice verified; admin notification suppressed"
    )
    return
  }

  try {
    const notification = await Notification.create({
      userEmail: ADMIN_EMAIL,
      title: "Invoice Payment Received",
      text:
        updated.customerName + " paid " +
        updated.invoiceNumber + " for $" +
        Number(updated.total || 0).toFixed(2) + ".",
      type: "payment",
      invoiceId: updated._id,
      link: "/admin/invoices",
      read: false,
      archived: false
    })

    req.app.get("io")?.emit(
      "adminNotification",
      notification
    )
  } catch (error) {
    console.error(
      "Invoice payment saved, but notification failed:",
      error.message
    )
  }

  // Never automatically start production.
}

// =====================================================
// SQUARE PAYMENT WEBHOOK
// =====================================================

router.post("/webhook", async (req, res) => {
  // ===================================================
  // STEP 1 - VERIFY CONFIGURATION AND SIGNATURE
  // ===================================================

  if (!validSquareMode) {
    console.error(
      "Square webhook disabled: invalid SQUARE_ENVIRONMENT"
    )
    return res.sendStatus(503)
  }

  const signature =
    req.headers["x-square-hmacsha256-signature"]

  if (!verifySignature(req.body, signature)) {
    console.warn(
      "Rejected invalid Square webhook signature"
    )
    return res.sendStatus(401)
  }

  // ===================================================
  // STEP 2 - PARSE EVENT
  // ===================================================

  let event

  try {
    event = JSON.parse(
      req.body.toString("utf8")
    )
  } catch {
    return res.sendStatus(400)
  }

  console.log(
    "Square webhook event:",
    event?.type
  )

  if (
    event?.type !== "payment.created" &&
    event?.type !== "payment.updated"
  ) {
    return res.sendStatus(200)
  }

  const incoming =
    event?.data?.object?.payment

  // ===================================================
  // STEP 3 - REQUIRE COMPLETED PAYMENT
  // ===================================================

  const status = String(
    incoming?.status || ""
  ).toUpperCase()

  if (
    !incoming?.id ||
    status !== "COMPLETED"
  ) {
    console.log(
      "Ignoring Square payment status:",
      status || "MISSING"
    )
    return res.sendStatus(200)
  }

  try {
    // =================================================
    // STEP 4 - VERIFY PAYMENT WITH SQUARE API
    // =================================================

    const paymentResponse = await squareGet(
      `payments/${encodeURIComponent(incoming.id)}`
    )

    const payment = paymentResponse.payment

    if (
      !payment ||
      payment.id !== incoming.id ||
      payment.status !== "COMPLETED" ||
      !payment.order_id
    ) {
      console.warn(
        "Square payment incomplete or missing order ID"
      )
      return res.sendStatus(200)
    }

    // =================================================
    // STEP 5 - VERIFY SQUARE LOCATION
    // =================================================

    const locationId = String(
      getSquareLocationId() || ""
    ).trim()

    if (
      !locationId ||
      payment.location_id !== locationId
    ) {
      console.error(
        "Square payment location mismatch"
      )
      return res.sendStatus(200)
    }

    // =================================================
    // STEP 6 - RETRIEVE VERIFIED SQUARE ORDER
    // =================================================

    const orderResponse = await squareGet(
      `orders/${encodeURIComponent(payment.order_id)}`
    )

    const squareOrder = orderResponse.order

    const paidAmount =
      payment.amount_money?.amount

    const squareTotal =
      squareOrder?.total_money?.amount

    // =================================================
    // STEP 7 - VERIFY AMOUNT, CURRENCY AND LOCATION
    // =================================================

    if (
      !squareOrder ||
      squareOrder.id !== payment.order_id ||
      squareOrder.location_id !== locationId ||
      payment.amount_money?.currency !== "USD" ||
      squareOrder.total_money?.currency !== "USD" ||
      !Number.isSafeInteger(paidAmount) ||
      paidAmount < 1 ||
      !Number.isSafeInteger(squareTotal) ||
      squareTotal !== paidAmount
    ) {
      console.error(
        "Square payment amount, location, or currency mismatch:",
        incoming.id
      )
      return res.sendStatus(200)
    }

    // =================================================
    // STEP 8 - CHECK CUSTOM INVOICES FIRST
    // =================================================

    // Production V3 verification boundary.
    // Verified binding does not authorize marking an order paid.
    // Do not fall through to legacy invoice or storefront reconciliation.
    if (
      squareMode === "production" &&
      typeof squareOrder.reference_id === "string" &&
      squareOrder.reference_id.startsWith("signavi-v3-")
    ) {
      const reference = parseV3WebhookOrderReference({
        referenceId: squareOrder.reference_id
      })

      if (!reference) {
        console.warn("Production V3 invalid checkout reference")
        return res.sendStatus(200)
      }

      const v3Order = await resolveOrder(squareOrder)

      if (!v3Order || String(v3Order._id) !== reference.orderId) {
        console.warn("Production V3 order mismatch")
        return res.sendStatus(200)
      }

      const operation = await SmartShippingV3PaymentOperation.findOne({
        orderId: v3Order._id,
        environment: "production"
      }).lean()

      if (!operation) {
        console.warn("Production V3 operation missing")
        return res.sendStatus(200)
      }

      try {
        const binding = verifyV3ProductionWebhookPaymentBinding({
          order: v3Order,
          operation,
          payment,
          squareOrder,
          expectedLocationId: locationId
        })

        if (binding.bindingVerified) {
          console.log("Production V3 payment binding verified; reconciliation disabled")
        }
      } catch {
        console.warn("Production V3 payment binding rejected")
      }

      // Mandatory fail-closed boundary until durable production
      // reconciliation and its integration tests are implemented.
      return res.sendStatus(200)
    }

    const matchingInvoices = await Invoice.find({
      squareOrderId: squareOrder.id
    }).limit(2)

    if (matchingInvoices.length > 1) {
      console.error(
        "Multiple invoices share Square order ID:",
        squareOrder.id
      )
      return res.sendStatus(200)
    }

    if (matchingInvoices.length === 1) {
      const storefrontCollision =
        await resolveOrder(squareOrder)

      if (storefrontCollision) {
        console.error(
          "Square order matches both invoice and storefront order:",
          squareOrder.id
        )
        return res.sendStatus(200)
      }

      await reconcileInvoicePayment(
        req,
        matchingInvoices[0],
        squareOrder,
        payment,
        paidAmount
      )

      return res.sendStatus(200)
    }

    // =================================================
    // STEP 9 - FIND SIGNAVI ORDER
    // =================================================

    const order = await resolveOrder(squareOrder)

    if (!order) {
      console.error(
        "Square payment requires manual reconciliation:",
        squareOrder.id
      )
      return res.sendStatus(200)
    }

    // =================================================
    // V3 Sandbox payment binding: fail closed.
    // An operation marked "completed" means the Square link was
    // recorded; customer payment still requires verified Square data.
    const v3Reference = parseV3WebhookOrderReference({
      referenceId: squareOrder.reference_id
    })

    const hasV3Prefix =
      typeof squareOrder.reference_id === "string" &&
      squareOrder.reference_id.startsWith("signavi-v3-")

    const v3Operation = squareMode === "sandbox"
      ? await SmartShippingV3PaymentOperation.findOne({
          orderId: order._id
        }).lean()
      : null

    if (hasV3Prefix || v3Operation) {
      if (
        squareMode !== "sandbox" ||
        !v3Reference ||
        !v3Operation ||
        v3Reference.orderId !== String(order._id)
      ) {
        console.warn("V3 webhook requires manual reconciliation")
        return res.sendStatus(200)
      }

      try {
        const v3Binding = verifyV3WebhookPaymentBinding({
          order,
          operation: v3Operation,
          payment,
          squareOrder,
          expectedLocationId: locationId
        })

        // Exact verified payment replay: no second update.
        if (v3Binding.exactPaidReplay) {
          console.log("V3 exact completed payment replay:", payment.id)
          return res.sendStatus(200)
        }
      } catch {
        console.warn("V3 webhook payment binding rejected")
        return res.sendStatus(200)
      }
    }
    // STEP 10 - VERIFY STORED ENVIRONMENT
    // =================================================

    if (order.squareEnvironment !== squareMode) {
      console.warn(
        "Order Square environment missing or mismatched:",
        String(order._id)
      )
      return res.sendStatus(200)
    }

    // =================================================
    // STEP 11 - VERIFY SQUARE ORDER ID
    // =================================================

    if (
      order.squareOrderId &&
      order.squareOrderId !== squareOrder.id
    ) {
      console.error(
        "SignaVi order linked to another Square order:",
        String(order._id)
      )
      return res.sendStatus(200)
    }

    // =================================================
    // STEP 12 - MATCH EXPECTED PAYMENT TOTAL
    // =================================================

    const expectedAmount =
      Number.isSafeInteger(
        order.squareExpectedAmountCents
      )
        ? order.squareExpectedAmountCents
        : toCents(order.finalPrice)

    if (
      expectedAmount === null ||
      expectedAmount !== paidAmount
    ) {
      console.error(
        "Payment does not match SignaVi order total:",
        String(order._id)
      )
      return res.sendStatus(200)
    }

    // =================================================
    // STEP 13 - PROTECT REFUNDED AND CLOSED ORDERS
    // =================================================

    if (
      order.paymentStatus === "refunded" ||
      (
        order.paymentStatus !== "paid" &&
        CLOSED_ORDER_STATES.includes(order.status)
      )
    ) {
      console.warn(
        "Payment requires review for closed order:",
        String(order._id)
      )
      return res.sendStatus(200)
    }

    // =================================================
    // STEP 14 - REJECT CONFLICTING PAYMENTS
    // =================================================

    if (
      (
        order.squarePaymentId &&
        order.squarePaymentId !== payment.id
      ) ||
      (
        order.paymentStatus === "paid" &&
        order.squarePaymentId !== payment.id
      )
    ) {
      console.warn(
        "Conflicting payment detected:",
        String(order._id)
      )
      return res.sendStatus(200)
    }

    // =================================================
    // STEP 15 - MARK ORDER PAID ATOMICALLY
    // =================================================

    if (order.paymentStatus !== "paid") {
      const now = new Date()

      const updated = await Order.findOneAndUpdate(
        {
          _id: order._id,
          squareEnvironment: squareMode,

          paymentStatus: {
            $nin: ["paid", "refunded"]
          },

          status: {
            $nin: CLOSED_ORDER_STATES
          },

          squarePaymentId: {
            $in: [
              null,
              "",
              payment.id
            ]
          },

          $or: [
            {
              squareOrderId: {
                $exists: false
              }
            },
            {
              squareOrderId: null
            },
            {
              squareOrderId: ""
            },
            {
              squareOrderId: squareOrder.id
            }
          ]
        },
        {
          $set: {
            paymentStatus: "paid",
            paymentMethod: "Square",
            squarePaymentId: payment.id,
            squareOrderId: squareOrder.id,
            squareExpectedAmountCents: paidAmount,
            paidAt: now,
            status: "paid"
          },

          $push: {
            timeline: {
              status: "paid",
              date: now,
              note:
                "Verified Square payment; " +
                "hold for fulfillment review"
            }
          }
        },
        {
          new: true
        }
      )

      if (!updated) {
        const latest = await Order.findById(order._id)

        if (
          latest?.paymentStatus !== "paid" ||
          latest.squarePaymentId !== payment.id ||
          latest.squareEnvironment !== squareMode
        ) {
          console.warn(
            "Order changed during Square reconciliation:",
            String(order._id)
          )
          return res.sendStatus(200)
        }
      } else {
        console.log(
          "Verified Square payment for order:",
          String(order._id)
        )
      }
    } else {
      console.log(
        "Duplicate completed payment event:",
        payment.id
      )
    }

    // =================================================
    // STEP 16 - CUSTOMER RECEIPT
    // =================================================

    if (squareMode === "production") {
      await sendReceiptOnce(
        order._id,
        payment.id
      )
    } else {
      console.log(
        "Sandbox order verified; customer receipt suppressed"
      )
    }

    // =================================================
    // STEP 17 - CONFIRM WEBHOOK RECEIPT
    // =================================================

    return res.sendStatus(200)

  } catch (error) {
    console.error(
      "Square webhook reconciliation failed:",
      error.message
    )

    return res.sendStatus(503)
  }
})

export default router
