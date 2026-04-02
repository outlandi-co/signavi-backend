// 📁 utils/sendEmail.js
import nodemailer from "nodemailer"

export const sendOrderStatusEmail = async (
  to,
  status,
  orderId,
  order
) => {
  try {
    console.log("📧 EMAIL FUNCTION HIT")
    console.log("📧 TO:", to)
    console.log("📧 STATUS:", status)

    /* ================= TRANSPORT ================= */
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })

    /* ================= VERIFY ================= */
    await transporter.verify()
    console.log("✅ SMTP CONNECTION VERIFIED")

    /* ================= CONTENT ================= */
    let subject = ""
    let html = ""

    if (status === "payment_required") {
      subject = "💳 Payment Required - Signavi"

      html = `
        <div style="font-family: Arial; padding: 20px;">
          <h2 style="color:#000;">Signavi Studio</h2>

          <p>Hello ${order.customerName || "Customer"},</p>

          <p>Your order is ready for payment.</p>

          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Amount:</strong> $${order.finalPrice || order.price || 0}</p>

          <a href="http://localhost:5173/checkout/${orderId}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#000;
              color:#fff;
              text-decoration:none;
              border-radius:6px;
              margin-top:10px;
            "
          >
            💳 Pay Now
          </a>
        </div>
      `
    }

    if (status === "paid") {
      subject = "✅ Payment Received - Signavi"

      html = `
        <div style="font-family: Arial; padding: 20px;">
          <h2>Payment Confirmed</h2>

          <p>Thank you ${order.customerName || ""}!</p>

          <p>Your payment has been received.</p>

          <p><strong>Order ID:</strong> ${orderId}</p>
        </div>
      `
    }

    /* ================= SEND ================= */
    const info = await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    })

    console.log("✅ EMAIL SENT SUCCESSFULLY")
    console.log("📨 RESPONSE:", info.response)

  } catch (error) {
    console.error("❌ EMAIL FAILED HARD:", error.message)
  }
}