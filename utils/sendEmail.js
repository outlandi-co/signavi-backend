import nodemailer from "nodemailer"

let transporter

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

/* ================= STATUS EMAIL ================= */
export const sendOrderStatusEmail = async (to, status, id, order) => {
  try {
    const transporter = getTransporter()

    const CLIENT_URL = process.env.CLIENT_URL || "https://signavistudio.store"

    const paymentLink =
      order?.paymentUrl ||
      `${CLIENT_URL}/checkout/${id}`

    let html = `<h2>Signavi Studio</h2><p>Status: ${status}</p>`

    if (status === "payment_required") {
      html += `
        <a href="${paymentLink}"
          style="padding:12px 20px;background:#06b6d4;color:#000;text-decoration:none;">
          💳 Pay Now
        </a>
      `
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: "Order Update",
      html
    })

  } catch (err) {
    console.error(err)
  }
}

/* ================= FIX THIS (CRITICAL) ================= */
export const sendAbandonedCartEmail = async (email, cart) => {
  console.log("📧 Abandoned cart email sent to:", email)
}