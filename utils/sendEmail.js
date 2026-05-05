import nodemailer from "nodemailer"

/* 🔥 ONLY SAFE LOG HERE */
console.log("📧 Email module loaded")

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
    /* 🔥 LOG INSIDE FUNCTION (CORRECT PLACE) */
    console.log("📧 EMAIL FUNCTION HIT:", { to, status })

    let subject = "SignaVi Update"
    let html = `<h2>SignaVi Studio</h2>`

    if (status === "payment_required") {
      subject = "💳 Payment Required"
      html += `<p>Your order is ready for payment.</p>`
    }

    if (status === "invoice") {
      subject = "🧾 Invoice"
      html += `<p>Your invoice is attached.</p>`
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    }

    /* 📎 ATTACH INVOICE */
    if (invoicePath) {
      mailOptions.attachments = [
        {
          filename: "invoice.pdf",
          path: invoicePath
        }
      ]
    }

    /* 🔥 TEMP TEST: SEND TO YOURSELF */
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "TEST EMAIL",
      text: "If you see this, email works"
    })

    console.log("📧 EMAIL SENT SUCCESSFULLY")

  } catch (err) {
    console.error("❌ EMAIL ERROR FULL:", err)
  }
}