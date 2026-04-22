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

/* ================= SAFE URL ================= */
const buildSafeUrl = (base, path = "") => {
  let url = base || "https://signavistudio.store"

  if (!url.startsWith("http")) {
    url = `https://${url}`
  }

  if (url.endsWith("/")) {
    url = url.slice(0, -1)
  }

  return `${url}${path}`
}

export const sendOrderStatusEmail = async (to, status, id, order = {}) => {
  try {
    const transporter = getTransporter()

    const CLIENT_URL = process.env.CLIENT_URL || "https://signavistudio.store"

    const safeLink = buildSafeUrl(CLIENT_URL, `/quote/${id}`)
    const paymentLink = order?.paymentUrl || safeLink

    const html = `
      <h2>SignaVi Studio</h2>

      <p>Hello ${order?.customerName || "Customer"},</p>

      <p>Total: $${order?.price || 0}</p>

      <p>
        <a href="${paymentLink}" target="_blank"
          style="padding:14px 24px;background:#06b6d4;color:#000;">
          💳 Pay Now
        </a>
      </p>

      <p>Direct link:</p>
      <a href="${paymentLink}" target="_blank">${paymentLink}</a>
    `

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: "Payment Required",
      html
    })

  } catch (err) {
    console.error(err)
  }
}