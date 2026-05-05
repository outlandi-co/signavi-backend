import nodemailer from "nodemailer"
import fs from "fs"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

export const sendOrderStatusEmail = async (
  to,
  status,
  order,
  invoicePath = null
) => {
  try {
    let subject = "SignaVi Update"
    let html = `<h2>SignaVi Studio</h2>`

    if (status === "invoice") {
      subject = "🧾 Invoice"
      html += `<p>Your invoice is attached.</p>`
    }

    if (status === "payment_required") {
      subject = "💳 Payment Required"
      html += `<p>Your order is ready for payment.</p>`
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    }

    if (invoicePath) {
      mailOptions.attachments = [
        {
          filename: "invoice.pdf",
          path: invoicePath
        }
      ]
    }

    await transporter.sendMail(mailOptions)

    console.log("📧 EMAIL SENT:", to)

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err)
  }
}