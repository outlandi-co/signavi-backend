import { Resend } from "resend"

const RESEND_API_KEY =
  process.env.RESEND_API_KEY || ""

const INFO_EMAIL =
  process.env.INFO_EMAIL ||
  "info@signavistudio.store"

const resend =
  new Resend(RESEND_API_KEY)

if (RESEND_API_KEY) {
  console.log("📨 ORDER STATUS RESEND READY")
} else {
  console.warn(
    "⚠️ RESEND_API_KEY missing for order status email"
  )
}

/* =========================================================
   SEND ORDER STATUS EMAIL
========================================================= */

export const sendOrderStatusEmail = async (
  customerEmail,
  status,
  order
) => {
  try {
    if (!customerEmail) {
      console.warn(
        "⚠️ STATUS EMAIL SKIPPED: customer email missing"
      )

      return
    }

    if (!RESEND_API_KEY) {
      throw new Error(
        "RESEND_API_KEY is not configured"
      )
    }

    const subjectMap = {
      production:
        "Your SignaVi order is now in production",

      shipping:
        "Your SignaVi order is preparing for shipment",

      shipped:
        "Your SignaVi order has shipped",

      delivered:
        "Your SignaVi order has been delivered"
    }

    const messageMap = {
      production:
        "Your order is now in production and being prepared.",

      shipping:
        "Your order is being packaged and prepared for shipment.",

      shipped:
        "Your order has officially shipped and is on the way.",

      delivered:
        "Your order has been marked delivered. Thank you for choosing SignaVi Studio."
    }

    const subject =
      subjectMap[status] ||
      "Order Update"

    const message =
      messageMap[status] ||
      "Your order status has been updated."

    const html = `
      <div
        style="
          font-family: Arial, sans-serif;
          padding: 20px;
          color: #111;
          line-height: 1.6;
        "
      >
        <h2>SignaVi Studio</h2>

        <p>
          Hello ${order?.customerName || "Customer"},
        </p>

        <p>
          ${message}
        </p>

        <hr />

        <h3>Order Summary</h3>

        <p>
          <strong>Order ID:</strong>
          ${order?._id || ""}
        </p>

        <p>
          <strong>Status:</strong>
          ${status}
        </p>

        <p>
          <strong>Total:</strong>
          $${Number(
            order?.finalPrice ||
            order?.price ||
            0
          ).toFixed(2)}
        </p>

        ${
          order?.trackingNumber
            ? `
              <p>
                <strong>Tracking:</strong>
                ${order.trackingNumber}
              </p>
            `
            : ""
        }

        <br />

        <p>
          Thank you for supporting SignaVi Studio.
        </p>
      </div>
    `

    const {
      data,
      error
    } = await resend.emails.send({
      from:
        `SignaVi Studio <${INFO_EMAIL}>`,

      to: [
        customerEmail
      ],

      subject,

      text:
        message,

      html
    })

    if (error) {
      console.error(
        "❌ RESEND STATUS EMAIL ERROR:",
        error
      )

      throw new Error(
        error.message ||
        "Failed to send order status email"
      )
    }

    console.log(
      `📧 STATUS EMAIL SENT: ${status}`,
      data?.id || ""
    )

    return data
  } catch (err) {
    console.error(
      "❌ STATUS EMAIL ERROR:",
      err?.message || err
    )

    return null
  }
}