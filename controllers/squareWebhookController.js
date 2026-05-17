import Invoice from "../models/Invoice.js"
import Order from "../models/Order.js"
import Notification from "../models/Notification.js"

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ||
  "admin@signavistudio.store"

export const handleSquareWebhook = async (req, res) => {
  try {
    const event = req.body

    if (
      event?.type !== "payment.created" &&
      event?.type !== "payment.updated"
    ) {
      return res.json({
        success: true,
        ignored: true
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

    const paymentLinkId =
      payment.payment_link_id ||
      payment.order_id ||
      ""

    const amountPaid =
      Number(payment.amount_money?.amount || 0) / 100

    let invoice = null

    if (paymentLinkId) {
      invoice = await Invoice.findOne({
        $or: [
          { squarePaymentLinkId: paymentLinkId },
          { squareCheckoutId: paymentLinkId }
        ]
      })
    }

    if (invoice && invoice.paymentStatus !== "paid") {
      invoice.paymentStatus = "paid"
      invoice.status = "ready_for_production"
      invoice.paidAt = new Date()
      invoice.squarePaymentId = payment.id || ""

      await invoice.save()

      await Notification.create({
        userEmail: ADMIN_EMAIL,
        title: "Payment Received",
        text: `${invoice.customerName} paid ${invoice.invoiceNumber} for $${amountPaid.toFixed(2)}.`,
        type: "payment",
        invoiceId: invoice._id,
        link: "/admin/invoices",
        read: false,
        archived: false
      })
    }

    let order = null

    if (paymentLinkId) {
      order = await Order.findOne({
        $or: [
          { squarePaymentLinkId: paymentLinkId },
          { squareCheckoutId: paymentLinkId }
        ]
      })
    }

    if (order && order.paymentStatus !== "paid") {
      order.paymentStatus = "paid"
      order.status = "ready_for_production"
      order.paidAt = new Date()
      order.squarePaymentId = payment.id || ""

      await order.save()

      await Notification.create({
        userEmail: ADMIN_EMAIL,
        title: "Order Payment Received",
        text: `${order.customerName || "Customer"} paid order ${order._id} for $${amountPaid.toFixed(2)}.`,
        type: "payment",
        orderId: order._id,
        link: "/admin/orders",
        read: false,
        archived: false
      })
    }

    res.json({
      success: true,
      received: true
    })
  } catch (error) {
    console.error("❌ SQUARE WEBHOOK ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}