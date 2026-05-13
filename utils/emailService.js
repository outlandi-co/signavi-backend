import sgMail from "@sendgrid/mail"

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

/* =========================================================
   SEND ORDER STATUS EMAIL
========================================================= */

export const sendOrderStatusEmail = async (
  customerEmail,
  status,
  order
) => {

  try {

    const subjectMap = {
      production: "Your SignaVi order is now in production",
      shipping: "Your SignaVi order is preparing for shipment",
      shipped: "Your SignaVi order has shipped",
      delivered: "Your SignaVi order has been delivered"
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
      <div style="font-family: Arial; padding: 20px;">
        <h2>SignaVi Studio</h2>

        <p>Hello ${order.customerName || "Customer"},</p>

        <p>${message}</p>

        <hr />

        <h3>Order Summary</h3>

        <p>
          <strong>Order ID:</strong>
          ${order._id}
        </p>

        <p>
          <strong>Status:</strong>
          ${status}
        </p>

        <p>
          <strong>Total:</strong>
          $${Number(order.finalPrice || 0).toFixed(2)}
        </p>

        ${
          order.trackingNumber
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

    await sgMail.send({
      to: customerEmail,

      from:
        process.env.EMAIL_FROM ||
        "admin@signavistudio.store",

      subject,
      html
    })

    console.log(
      `📧 STATUS EMAIL SENT: ${status}`
    )

  } catch (err) {

    console.error(
      "❌ STATUS EMAIL ERROR:",
      err.response?.body || err.message
    )
  }
}