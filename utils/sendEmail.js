import sgMail from "@sendgrid/mail"
import fs from "fs"

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const CLIENT_URL =
  process.env.CLIENT_URL ||
  "https://signavistudio.store"

const formatMoney = (value) => {
  return Number(value || 0).toFixed(2)
}

const buildPaymentUrl = (order) => {
  if (order?.paymentUrl) {
    return order.paymentUrl
  }

  return `${CLIENT_URL}/client-checkout/${order._id}`
}

const buildInvoiceUrl = (order) => {
  return `${CLIENT_URL}/invoice/${order._id}`
}

export const sendOrderStatusEmail = async (
  to,
  status,
  order,
  invoicePath = null
) => {
  try {
    if (!to) {
      console.warn("EMAIL SKIPPED: Missing recipient")
      return
    }

    if (!process.env.SENDGRID_API_KEY) {
      console.warn("EMAIL SKIPPED: Missing SENDGRID_API_KEY")
      return
    }

    if (!process.env.EMAIL_FROM) {
      console.warn("EMAIL SKIPPED: Missing EMAIL_FROM")
      return
    }

    console.log("EMAIL FUNCTION HIT:", {
      to,
      status,
      orderId: order?._id
    })

    const paymentUrl =
      buildPaymentUrl(order)

    const invoiceUrl =
      buildInvoiceUrl(order)

    let subject =
      "SignaVi Studio Update"

    let html = `
      <div style="font-family: Arial, sans-serif; background:#f8fafc; padding:30px;">
        <div style="max-width:640px; margin:0 auto; background:white; border-radius:14px; overflow:hidden; border:1px solid #e5e7eb;">
          <div style="background:#020617; color:white; padding:24px;">
            <h1 style="margin:0; font-size:24px;">SignaVi Studio</h1>
            <p style="margin:8px 0 0; color:#cbd5e1;">From Ideation to Creation</p>
          </div>

          <div style="padding:28px;">
    `

    if (status === "payment_required") {
      subject =
        "Payment Required - SignaVi Studio"

      html += `
        <h2 style="margin-top:0; color:#020617;">Your order is ready for payment</h2>

        <p>Hello ${order.customerName || "Customer"},</p>

        <p>Your order has been reviewed and is ready for payment.</p>

        <div style="background:#f1f5f9; border-radius:12px; padding:18px; margin:20px 0;">
          <p style="margin:0;"><strong>Order ID:</strong> ${order._id}</p>
          <p style="margin:8px 0 0;"><strong>Total:</strong> $${formatMoney(order.finalPrice || order.price || order.subtotal)}</p>
        </div>

        <a
          href="${paymentUrl}"
          target="_blank"
          style="
            display:inline-block;
            background:#16a34a;
            color:white;
            text-decoration:none;
            padding:14px 22px;
            border-radius:10px;
            font-weight:bold;
            margin-top:10px;
          "
        >
          Pay Now
        </a>

        <p style="font-size:13px; color:#64748b; margin-top:22px;">
          If the button does not open, copy and paste this link into your browser:<br/>
          <a href="${paymentUrl}" target="_blank">${paymentUrl}</a>
        </p>
      `
    }

    else if (status === "denied") {
      subject =
        "Order Update - SignaVi Studio"

      html += `
        <h2 style="margin-top:0; color:#020617;">Order update</h2>

        <p>Hello ${order.customerName || "Customer"},</p>

        <p>Your order or quote needs revision before moving forward.</p>

        <p>Please contact SignaVi Studio if you have questions.</p>
      `
    }

    else if (status === "invoice") {
      subject =
        "Invoice - SignaVi Studio"

      html += `
        <h2 style="margin-top:0; color:#020617;">Your invoice is ready</h2>

        <p>Hello ${order.customerName || "Customer"},</p>

        <p>Your invoice is attached to this email.</p>

        <div style="background:#f1f5f9; border-radius:12px; padding:18px; margin:20px 0;">
          <p style="margin:0;"><strong>Order ID:</strong> ${order._id}</p>
          <p style="margin:8px 0 0;"><strong>Total:</strong> $${formatMoney(order.finalPrice || order.price || order.subtotal)}</p>
        </div>

        <a
          href="${invoiceUrl}"
          target="_blank"
          style="
            display:inline-block;
            background:#2563eb;
            color:white;
            text-decoration:none;
            padding:14px 22px;
            border-radius:10px;
            font-weight:bold;
            margin-top:10px;
          "
        >
          View Invoice
        </a>
      `
    }

    else if (status === "shipped") {
      subject =
        "Your Order Has Shipped - SignaVi Studio"

      html += `
        <h2 style="margin-top:0; color:#020617;">Your order has shipped</h2>

        <p>Hello ${order.customerName || "Customer"},</p>

        <p>Your order has shipped. Thank you for choosing SignaVi Studio.</p>
      `
    }

    else {
      html += `
        <h2 style="margin-top:0; color:#020617;">Order update</h2>

        <p>Hello ${order.customerName || "Customer"},</p>

        <p>Your order status has been updated to:</p>

        <div style="background:#f1f5f9; border-radius:12px; padding:18px; margin:20px 0;">
          <strong>${status}</strong>
        </div>
      `
    }

    html += `
          </div>

          <div style="background:#f8fafc; padding:18px 28px; color:#64748b; font-size:13px;">
            <p style="margin:0;">SignaVi Studio</p>
            <p style="margin:6px 0 0;">Custom printing, design, apparel, signage, and production services.</p>
          </div>
        </div>
      </div>
    `

    const msg = {
      to,
      from: `SignaVi Studio <${process.env.EMAIL_FROM}>`,
      subject,
      html
    }

    if (invoicePath && fs.existsSync(invoicePath)) {
      const fileData =
        fs.readFileSync(invoicePath).toString("base64")

      msg.attachments = [
        {
          content: fileData,
          filename: `invoice-${order._id}.pdf`,
          type: "application/pdf",
          disposition: "attachment"
        }
      ]
    }

    await sgMail.send(msg)

    console.log("EMAIL SENT SUCCESSFULLY:", {
      to,
      subject
    })

  } catch (err) {
    console.error(
      "SENDGRID ERROR:",
      err.response?.body || err.message
    )
  }
}