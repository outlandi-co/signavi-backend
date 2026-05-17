import Invoice from "../models/Invoice.js"
import Order from "../models/Order.js"
import Notification from "../models/Notification.js"

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ||
  "admin@signavistudio.store"

const getPaymentAmount = (payment) => {
  return Number(payment?.amount_money?.amount || 0) / 100
}

const getPaymentLinkIds = (payment) => {
  return [
    payment?.payment_link_id,
    payment?.order_id,
    payment?.checkout_id
  ].filter(Boolean)
}

const emitAdminNotification = (req, notification) => {
  req.app.get("io")?.emit("adminNotification", notification)
}

const createInvoicePaymentNotification = async (
  req,
  invoice,
  payment,
  amountPaid
) => {
  const notification = await Notification.create({
    userEmail: ADMIN_EMAIL,
    title: "Payment Received",
    text:
      `${invoice.customerName} paid ${invoice.invoiceNumber} ` +
      `for $${amountPaid.toFixed(2)}.`,
    type: "payment",
    invoiceId: invoice._id,
    link: "/admin/invoices",
    read: false,
    archived: false
  })

  emitAdminNotification(req, notification)

  console.log(
    "📥 INVOICE PAYMENT NOTIFICATION CREATED:",
    notification._id
  )
}

const createOrderPaymentNotification = async (
  req,
  order,
  payment,
  amountPaid
) => {
  const notification = await Notification.create({
    userEmail: ADMIN_EMAIL,
    title: "Order Payment Received",
    text:
      `${order.customerName || "Customer"} paid order ${order._id} ` +
      `for $${amountPaid.toFixed(2)}.`,
    type: "payment",
    orderId: order._id,
    link: "/admin/orders",
    read: false,
    archived: false
  })

  emitAdminNotification(req, notification)

  console.log(
    "📥 ORDER PAYMENT NOTIFICATION CREATED:",
    notification._id
  )
}

const findInvoiceFromPayment = async (payment) => {
  const paymentIds = getPaymentLinkIds(payment)

  if (!paymentIds.length) return null

  return Invoice.findOne({
    $or: [
      { squarePaymentLinkId: { $in: paymentIds } },
      { squareCheckoutId: { $in: paymentIds } },
      { squarePaymentId: payment.id || "" }
    ]
  })
}

const findOrderFromPayment = async (payment) => {
  const paymentIds = getPaymentLinkIds(payment)

  if (!paymentIds.length) return null

  return Order.findOne({
    $or: [
      { squarePaymentLinkId: { $in: paymentIds } },
      { squareCheckoutId: { $in: paymentIds } },
      { squarePaymentId: payment.id || "" }
    ]
  })
}

export const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body

    console.log("🟦 SQUARE WEBHOOK EVENT:", event?.type)

    if (
      event?.type !== "payment.created" &&
      event?.type !== "payment.updated"
    ) {
      return res.json({
        success: true,
        ignored: true,
        type: event?.type
      })
    }

    const payment = event?.data?.object?.payment

    if (!payment) {
      return res.json({
        success: true,
        ignored: true,
        message: "No payment object"
      })
    }

    const status = String(payment.status || "").toUpperCase()

    if (
      status &&
      status !== "COMPLETED" &&
      status !== "APPROVED"
    ) {
      return res.json({
        success: true,
        ignored: true,
        message: `Payment status ignored: ${status}`
      })
    }

    const amountPaid = getPaymentAmount(payment)

    const invoice = await findInvoiceFromPayment(payment)

    if (invoice) {
      const wasAlreadyPaid =
        invoice.paymentStatus === "paid"

      invoice.paymentStatus = "paid"
      invoice.status = "ready_for_production"
      invoice.paidAt = invoice.paidAt || new Date()
      invoice.squarePaymentId = payment.id || ""

      await invoice.save()

      if (!wasAlreadyPaid) {
        await createInvoicePaymentNotification(
          req,
          invoice,
          payment,
          amountPaid
        )
      }

      console.log(
        "✅ INVOICE MARKED PAID FROM SQUARE:",
        invoice.invoiceNumber
      )
    }

    const order = await findOrderFromPayment(payment)

    if (order) {
      const wasAlreadyPaid =
        order.paymentStatus === "paid"

      order.paymentStatus = "paid"
      order.status = "ready_for_production"
      order.paidAt = order.paidAt || new Date()
      order.squarePaymentId = payment.id || ""

      await order.save()

      if (!wasAlreadyPaid) {
        await createOrderPaymentNotification(
          req,
          order,
          payment,
          amountPaid
        )
      }

      console.log(
        "✅ ORDER MARKED PAID FROM SQUARE:",
        order._id
      )
    }

    if (!invoice && !order) {
      console.warn(
        "⚠️ PAYMENT RECEIVED BUT NO MATCHING INVOICE/ORDER:",
        {
          paymentId: payment.id,
          paymentLinkId: payment.payment_link_id,
          orderId: payment.order_id,
          checkoutId: payment.checkout_id
        }
      )
    }

    res.json({
      success: true,
      received: true,
      invoiceMatched: !!invoice,
      orderMatched: !!order
    })
  } catch (error) {
    console.error("❌ SQUARE WEBHOOK ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}