import sgMail from "@sendgrid/mail"
import fs from "fs"

const INFO_EMAIL =
  process.env.INFO_EMAIL ||
  process.env.EMAIL_FROM ||
  "info@signavistudio.store"

const CLIENT_URL =
  process.env.CLIENT_URL ||
  "https://signavistudio.store"

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(
    process.env.SENDGRID_API_KEY
  )

  console.log(
    "📧 ORDER EMAIL SENDGRID READY"
  )
} else {
  console.warn(
    "⚠️ SENDGRID_API_KEY missing"
  )
}

/* =========================================================
   HELPERS
========================================================= */

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

const buildQuoteUrl = (quote) => {
  return `${CLIENT_URL}/quote/${quote._id}`
}

const escapeHtml = (value = "") => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/* =========================================================
   SEND ORDER STATUS EMAIL
========================================================= */

export const sendOrderStatusEmail = async (
  to,
  status,
  order,
  invoicePath = null
) => {
  try {
    if (!to) {
      console.warn(
        "EMAIL SKIPPED: Missing recipient"
      )

      return null
    }

    if (
      !process.env.SENDGRID_API_KEY
    ) {
      console.warn(
        "EMAIL SKIPPED: Missing SENDGRID_API_KEY"
      )

      return null
    }

    if (!order?._id) {
      console.warn(
        "EMAIL SKIPPED: Missing order or quote"
      )

      return null
    }

    console.log(
      "EMAIL FUNCTION HIT:",
      {
        to,
        status,
        orderId:
          order._id
      }
    )

    const paymentUrl =
      buildPaymentUrl(order)

    const invoiceUrl =
      buildInvoiceUrl(order)

    const quoteUrl =
      buildQuoteUrl(order)

    let subject =
      "SignaVi Studio Update"

    let html = `
      <div
        style="
          font-family: Arial, sans-serif;
          background:#f8fafc;
          padding:30px;
        "
      >
        <div
          style="
            max-width:640px;
            margin:0 auto;
            background:white;
            border-radius:14px;
            overflow:hidden;
            border:1px solid #e5e7eb;
          "
        >
          <div
            style="
              background:#020617;
              color:white;
              padding:24px;
            "
          >
            <h1
              style="
                margin:0;
                font-size:24px;
              "
            >
              SignaVi Studio
            </h1>

            <p
              style="
                margin:8px 0 0;
                color:#cbd5e1;
              "
            >
              From Ideation to Creation
            </p>
          </div>

          <div style="padding:28px;">
    `

    /* =====================================================
       MOCKUP READY / CUSTOMER APPROVAL
    ===================================================== */

    if (
      status ===
      "approval_payment"
    ) {
      subject =
        "Your SignaVi Studio Mockup Is Ready"

      const mockupUrl =
        order.mockupUrl ||
        order.mockup ||
        ""

      const mockupName =
        order.mockupName ||
        "Digital Mockup"

      const mockupMessage =
        order.mockupMessage ||
        "Your digital mockup is ready for review."

      const finalQuote =
        order.finalPrice ||
        order.price ||
        0

      const isPdf =
        order.mockupMimeType ===
          "application/pdf" ||
        String(mockupUrl)
          .toLowerCase()
          .includes(".pdf")

      html += `
        <h2
          style="
            margin-top:0;
            color:#020617;
          "
        >
          Your digital mockup is ready
        </h2>

        <p>
          Hello ${escapeHtml(
            order.customerName ||
              "Customer"
          )},
        </p>

        <p>
          We have prepared your digital mockup and final quote.
          Please review the design and project details before approving.
        </p>

        <div
          style="
            background:#f1f5f9;
            border-radius:12px;
            padding:18px;
            margin:20px 0;
          "
        >
          <p
            style="
              margin:0 0 8px;
              font-size:12px;
              color:#64748b;
              text-transform:uppercase;
              letter-spacing:.06em;
              font-weight:bold;
            "
          >
            Message from SignaVi Studio
          </p>

          <p
            style="
              margin:0;
              line-height:1.6;
              color:#334155;
            "
          >
            ${escapeHtml(
              mockupMessage
            ).replace(
              /\n/g,
              "<br/>"
            )}
          </p>
        </div>

        ${
          mockupUrl
            ? isPdf
              ? `
                <div
                  style="
                    margin:24px 0;
                    text-align:center;
                  "
                >
                  <p
                    style="
                      color:#475569;
                      margin-bottom:12px;
                    "
                  >
                    ${escapeHtml(
                      mockupName
                    )}
                  </p>

                  <a
                    href="${mockupUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="
                      display:inline-block;
                      background:#0f172a;
                      color:white;
                      text-decoration:none;
                      padding:13px 20px;
                      border-radius:10px;
                      font-weight:bold;
                    "
                  >
                    View Digital Mockup
                  </a>
                </div>
              `
              : `
                <div
                  style="
                    margin:24px 0;
                    text-align:center;
                  "
                >
                  <p
                    style="
                      margin:0 0 12px;
                      color:#475569;
                      font-weight:bold;
                    "
                  >
                    Digital Mockup
                  </p>

                  <a
                    href="${mockupUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="
                      text-decoration:none;
                    "
                  >
                    <img
                      src="${mockupUrl}"
                      alt="Digital Mockup"
                      style="
                        display:block;
                        width:100%;
                        max-width:520px;
                        max-height:500px;
                        object-fit:contain;
                        margin:0 auto;
                        border:1px solid #e2e8f0;
                        border-radius:12px;
                        background:white;
                      "
                    />
                  </a>

                  <p
                    style="
                      margin:12px 0 0;
                      font-size:12px;
                      color:#64748b;
                    "
                  >
                    Click the image to view the full-size mockup.
                  </p>
                </div>
              `
            : ""
        }

        <div
          style="
            background:#020617;
            color:white;
            border-radius:12px;
            padding:20px;
            margin:24px 0;
          "
        >
          <p
            style="
              margin:0;
              color:#94a3b8;
              font-size:12px;
              text-transform:uppercase;
              letter-spacing:.08em;
              font-weight:bold;
            "
          >
            Final Quote
          </p>

          <p
            style="
              margin:8px 0 0;
              font-size:28px;
              font-weight:bold;
              color:#22d3ee;
            "
          >
            $${formatMoney(
              finalQuote
            )}
          </p>
        </div>

        <div
          style="
            text-align:center;
            margin:26px 0 14px;
          "
        >
          <a
            href="${quoteUrl}"
            target="_blank"
            rel="noopener noreferrer"
            style="
              display:inline-block;
              background:#06b6d4;
              color:#020617;
              text-decoration:none;
              padding:15px 24px;
              border-radius:10px;
              font-weight:bold;
              font-size:16px;
            "
          >
            Review Mockup & Quote
          </a>
        </div>

        <p
          style="
            color:#475569;
            line-height:1.6;
          "
        >
          After reviewing the mockup, you will be able to approve the quote
          and continue to payment.
        </p>

        <p
          style="
            font-size:13px;
            color:#64748b;
            margin-top:22px;
          "
        >
          If the button does not open, copy and paste this link into your browser:
          <br/>

          <a
            href="${quoteUrl}"
            target="_blank"
            rel="noopener noreferrer"
            style="
              color:#0284c7;
              word-break:break-all;
            "
          >
            ${quoteUrl}
          </a>
        </p>
      `
    }

    /* =====================================================
       PAYMENT REQUIRED
    ===================================================== */

    else if (
      status ===
      "payment_required"
    ) {
      subject =
        "Payment Required - SignaVi Studio"

      html += `
        <h2
          style="
            margin-top:0;
            color:#020617;
          "
        >
          Your order is ready for payment
        </h2>

        <p>
          Hello ${escapeHtml(
            order.customerName ||
              "Customer"
          )},
        </p>

        <p>
          Your quote has been approved and your order is ready for payment.
        </p>

        <div
          style="
            background:#f1f5f9;
            border-radius:12px;
            padding:18px;
            margin:20px 0;
          "
        >
          <p style="margin:0;">
            <strong>Order ID:</strong>
            ${order._id}
          </p>

          <p style="margin:8px 0 0;">
            <strong>Total:</strong>
            $${formatMoney(
              order.finalPrice ||
              order.price ||
              order.subtotal
            )}
          </p>
        </div>

        <a
          href="${paymentUrl}"
          target="_blank"
          rel="noopener noreferrer"
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

        <p
          style="
            font-size:13px;
            color:#64748b;
            margin-top:22px;
          "
        >
          If the button does not open, copy and paste this link into your browser:
          <br/>

          <a
            href="${paymentUrl}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${paymentUrl}
          </a>
        </p>
      `
    }

    /* =====================================================
       DENIED / REVISION
    ===================================================== */

    else if (
      status === "denied"
    ) {
      subject =
        "Quote Update - SignaVi Studio"

      html += `
        <h2
          style="
            margin-top:0;
            color:#020617;
          "
        >
          Quote update
        </h2>

        <p>
          Hello ${escapeHtml(
            order.customerName ||
              "Customer"
          )},
        </p>

        <p>
          Your order or quote needs revision before moving forward.
        </p>

        ${
          order.denialReason
            ? `
              <div
                style="
                  background:#f1f5f9;
                  border-radius:12px;
                  padding:18px;
                  margin:20px 0;
                "
              >
                ${escapeHtml(
                  order.denialReason
                )}
              </div>
            `
            : ""
        }

        <p>
          Please contact SignaVi Studio if you have questions.
        </p>
      `
    }

    /* =====================================================
       INVOICE
    ===================================================== */

    else if (
      status === "invoice"
    ) {
      subject =
        "Invoice - SignaVi Studio"

      html += `
        <h2
          style="
            margin-top:0;
            color:#020617;
          "
        >
          Your invoice is ready
        </h2>

        <p>
          Hello ${escapeHtml(
            order.customerName ||
              "Customer"
          )},
        </p>

        <p>
          Your invoice is attached to this email.
        </p>

        <div
          style="
            background:#f1f5f9;
            border-radius:12px;
            padding:18px;
            margin:20px 0;
          "
        >
          <p style="margin:0;">
            <strong>Order ID:</strong>
            ${order._id}
          </p>

          <p style="margin:8px 0 0;">
            <strong>Total:</strong>
            $${formatMoney(
              order.finalPrice ||
              order.price ||
              order.subtotal
            )}
          </p>
        </div>

        <a
          href="${invoiceUrl}"
          target="_blank"
          rel="noopener noreferrer"
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

    /* =====================================================
       SHIPPED
    ===================================================== */

    else if (
      status === "shipped"
    ) {
      subject =
        "Your Order Has Shipped - SignaVi Studio"

      html += `
        <h2
          style="
            margin-top:0;
            color:#020617;
          "
        >
          Your order has shipped
        </h2>

        <p>
          Hello ${escapeHtml(
            order.customerName ||
              "Customer"
          )},
        </p>

        <p>
          Your order has shipped. Thank you for choosing SignaVi Studio.
        </p>
      `
    }

    /* =====================================================
       GENERAL STATUS
    ===================================================== */

    else {
      html += `
        <h2
          style="
            margin-top:0;
            color:#020617;
          "
        >
          Order update
        </h2>

        <p>
          Hello ${escapeHtml(
            order.customerName ||
              "Customer"
          )},
        </p>

        <p>
          Your order status has been updated to:
        </p>

        <div
          style="
            background:#f1f5f9;
            border-radius:12px;
            padding:18px;
            margin:20px 0;
          "
        >
          <strong>
            ${escapeHtml(status)}
          </strong>
        </div>
      `
    }

    /* =====================================================
       EMAIL FOOTER
    ===================================================== */

    html += `
          </div>

          <div
            style="
              background:#f8fafc;
              padding:18px 28px;
              color:#64748b;
              font-size:13px;
            "
          >
            <p style="margin:0;">
              SignaVi Studio
            </p>

            <p style="margin:6px 0 0;">
              Custom printing, design, apparel, signage, and production services.
            </p>
          </div>
        </div>
      </div>
    `

    /* =====================================================
       ATTACHMENTS
    ===================================================== */

    const attachments = []

    if (
      invoicePath &&
      fs.existsSync(invoicePath)
    ) {
      const fileData =
        fs.readFileSync(
          invoicePath
        )

      attachments.push({
        content:
          fileData.toString(
            "base64"
          ),

        filename:
          `invoice-${order._id}.pdf`,

        type:
          "application/pdf",

        disposition:
          "attachment"
      })
    }

    /* =====================================================
       SEND EMAIL
    ===================================================== */

    const [response] =
      await sgMail.send({
        from: {
          email:
            INFO_EMAIL,

          name:
            "SignaVi Studio"
        },

        to,

        subject,

        html,

        attachments:
          attachments.length
            ? attachments
            : undefined
      })

    console.log(
      "✅ EMAIL SENT SUCCESSFULLY:",
      {
        to,
        subject,

        statusCode:
          response?.statusCode ||
          null
      }
    )

    return response
  } catch (err) {
    console.error(
      "❌ ORDER EMAIL ERROR:",
      err?.response?.body ||
      err?.message ||
      err
    )

    /*
     * IMPORTANT:
     * Throw the error back to the calling route.
     *
     * This prevents the route from logging
     * "email triggered" when SendGrid actually
     * rejected the message.
     */
    throw err
  }
}