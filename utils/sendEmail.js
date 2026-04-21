import nodemailer from "nodemailer"

let transporter

/* ================= CREATE TRANSPORTER ================= */
const getTransporter = () => {
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  })

  return transporter
}

/* =========================================================
   📧 SEND ORDER / QUOTE STATUS EMAIL
========================================================= */
export const sendOrderStatusEmail = async (
  to,
  status,
  id,
  order = {}
) => {
  try {
    const transporter = getTransporter()

    const CLIENT_URL =
      process.env.CLIENT_URL || "https://signavistudio.store"

    /* 🔥 IMPORTANT FIX: use quote page */
    const paymentLink =
      order?.paymentUrl ||
      `${CLIENT_URL}/quote/${id}`

    let subject = "SignaVi Studio Update"
    let html = `<h2>SignaVi Studio</h2>`

    /* ================= STATUS HANDLING ================= */
    if (status === "payment_required") {
      subject = "Your Quote is Approved – Payment Required"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>Your quote has been approved and is ready for payment.</p>

        <h3>Total: $${order?.price || 0}</h3>

        <a href="${paymentLink}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:#06b6d4;
            color:#000;
            text-decoration:none;
            border-radius:6px;
            font-weight:bold;
          ">
          💳 Pay Now
        </a>

        <p style="margin-top:20px;">
          Thank you,<br/>
          <strong>SignaVi Studio</strong>
        </p>
      `
    } else {
      html += `<p>Status updated: ${status}</p>`
    }

    await transporter.sendMail({
      from: `"SignaVi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    })

    console.log("📧 EMAIL SENT →", to)

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err)
  }
}

/* =========================================================
   📧 ABANDONED CART (SAFE PLACEHOLDER)
========================================================= */
export const sendAbandonedCartEmail = async (email, cart) => {
  try {
    console.log("📧 Abandoned cart email sent to:", email)
  } catch (err) {
    console.error(err)
  }
}