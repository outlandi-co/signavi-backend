
import express from "express"
import crypto from "node:crypto"
import fetch from "node-fetch"

import Order from "../models/Order.js"
import Quote from "../models/Quote.js"
import Invoice from "../models/Invoice.js"
import Notification from "../models/Notification.js"
import sendReceiptEmail from "../utils/sendReceiptEmail.js"

const router = express.Router()

const OBJECT_ID = /^[a-f0-9]{24}$/i

const CLOSED_INVOICE_STATES = [
  "cancelled",
  "production",
  "shipped",
  "delivered",
  "completed"
]

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "admin@signavistudio.store"

const CLOSED_ORDER_STATES = [
  "cancelled",
  "canceled",
  "refunded",
  "production",
  "shipped",
  "delivered",
  "completed"
]

console.log("Square storefront payment webhook loaded")

// =====================================================
// VERIFY SQUARE WEBHOOK SIGNATURE
// =====================================================
// Requires the ORIGINAL raw request body.
// SQUARE_WEBHOOK_URL must match the registered
// Square notification URL exactly.
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
// RETRIEVE VERIFIED DATA DIRECTLY FROM SQUARE
// =====================================================

const squareGet = async (endpoint) => {
  const token = process.env.SQUARE_ACCESS_TOKEN

  if (!token) {
    throw new Error("SQUARE_ACCESS_TOKEN is missing")
  }

  const response = await fetch(
    `https://connect.squareup.com/v2/${endpoint}`,
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
// GET SIGNAVI ORDER REFERENCE
// =====================================================
// Supports existing Square order references:
// ID:xxxxxxxxxxxxxxxxxxxxxxxx
// SIGNAVI_ORDER:xxxxxxxxxxxxxxxxxxxxxxxx
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
// FIND LOCAL SIGNAVI ORDER
// =====================================================

const resolveOrder = async (squareOrder) => {
  const id = taggedId(squareOrder)

  const bySquareId = await Order.findOne({
    squareOrderId: squareOrder.id
  })

  if (bySquareId) {
    if (
      id &&
      String(bySquareId._id) !== id &&
      String(bySquareId.quoteId || "") !== id
    ) {
      return null
    }

    return bySquareId
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
// SEND CUSTOMER RECEIPT
// =====================================================
// Uses an atomic receipt claim to reduce duplicate
// emails from repeated/concurrent webhook events.
// Failed sends release the claim for a later retry.
//
// For guaranteed delivery after process crashes,
// use a durable email outbox in the future.
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
// SQUARE PAYMENT WEBHOOK
// =====================================================
// Accepts payment.created and payment.updated.
// Only COMPLETED payments can be marked paid.
// =====================================================


// =====================================================
// VERIFIED SQUARE CUSTOM INVOICE RECONCILIATION
// =====================================================

const reconcileInvoicePayment = async (
  req,
  invoice,
  squareOrder,
  payment,
  paidAmount
) => {
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
      "Conflicting or manually recorded invoice payment:",
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

  // Atomic update prevents duplicate webhook processing.
  const updated = await Invoice.findOneAndUpdate(
    {
      _id: invoice._id,
      squareOrderId: squareOrder.id,
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
      latest.squarePaymentId === payment.id
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

  // Payment is already saved; notification is best-effort.
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

  // Production is NOT started automatically.
  // The existing production controller still requires
  // approved artwork and accepted proof terms.
}

router.post("/webhook", async (req, res) => {
  // ===================================================
  // STEP 1 — VERIFY WEBHOOK SIGNATURE
  // ===================================================

  const signature =
    req.headers["x-square-hmacsha256-signature"]

  if (!verifySignature(req.body, signature)) {
    console.warn(
      "Rejected invalid Square webhook signature"
    )

    return res.sendStatus(401)
  }

  // ===================================================
  // STEP 2 — PARSE WEBHOOK EVENT
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
  // STEP 3 — REQUIRE COMPLETED PAYMENT
  // ===================================================
  // APPROVED means authorized, not captured.
  // Missing statuses must also be rejected.
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
    // STEP 4 — VERIFY PAYMENT WITH SQUARE API
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
    // STEP 5 — VERIFY SQUARE LOCATION
    // =================================================

    const locationId =
      process.env.SQUARE_LOCATION_ID

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
    // STEP 6 — GET VERIFIED SQUARE ORDER
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
    // STEP 7 — VERIFY PAYMENT AMOUNT/CURRENCY
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
    // STEP 8 — MATCH SIGNAVI DATABASE ORDER
    // =================================================

    // =================================================
    // MATCH CUSTOM INVOICES BEFORE STOREFRONT ORDERS
    // =================================================

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

    const order = await resolveOrder(squareOrder)

    if (!order) {
      console.error(
        "Square payment requires manual reconciliation:",
        squareOrder.id
      )

      return res.sendStatus(200)
    }

    // =================================================
    // STEP 9 — VERIFY ASSOCIATED SQUARE ORDER
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
    // STEP 10 — MATCH SIGNAVI EXPECTED TOTAL
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
    // STEP 11 — PROTECT REFUNDED / CLOSED ORDERS
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
    // STEP 12 — BLOCK CONFLICTING PAYMENTS
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
    // STEP 13 — MARK ORDER PAID
    // =================================================
    // Atomic update prevents duplicate webhook
    // events from marking orders paid repeatedly.
    // Do not automatically start production.
    // =================================================

    if (order.paymentStatus !== "paid") {
      const now = new Date()

      const updated =
        await Order.findOneAndUpdate(
          {
            _id: order._id,

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

              squarePaymentId:
                payment.id,

              squareOrderId:
                squareOrder.id,

              squareExpectedAmountCents:
                paidAmount,

              paidAt: now,

              status: "paid"
            },

            $push: {
              timeline: {
                status: "paid",
                date: now,
                note:
                  "Verified Square payment; hold for fulfillment review"
              }
            }
          },
          {
            new: true
          }
        )

      if (!updated) {
        const latest =
          await Order.findById(order._id)

        if (
          latest?.paymentStatus !== "paid" ||
          latest.squarePaymentId !== payment.id
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
    // STEP 14 — CUSTOMER RECEIPT
    // =================================================

    await sendReceiptOnce(
      order._id,
      payment.id
    )

    // =================================================
    // STEP 15 — CONFIRM WEBHOOK RECEIPT
    // =================================================

    return res.sendStatus(200)

  } catch (error) {
    console.error(
      "Square webhook reconciliation failed:",
      error.message
    )

    // Return retryable status for temporary errors.
    return res.sendStatus(503)
  }
})

export default router
