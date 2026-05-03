import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export const sendOrderStatusEmail = async (to, status, order) => {
  try {
    if (!to) return
    if (!process.env.RESEND_API_KEY) {
      console.warn("❌ Missing RESEND_API_KEY")
      return
    }

    const CLIENT_URL =
      process.env.CLIENT_URL || "https://signavistudio.store"

    const trackLink = `${CLIENT_URL}/track/${order._id}`
    const checkoutLink = `${CLIENT_URL}/checkout/${order._id}`

    let subject = "SignaVi Studio Update"
    let html = `<h2>SignaVi Studio</h2>`

    /* ================= PAYMENT REQUIRED ================= */
    if (status === "payment_required") {
      subject = "💳 Payment Required"

      html += `
        <p>Hello ${order.customerName || "Customer"},</p>

        <p>Your order is ready for payment.</p>

        <h3>Total: $${Number(order.finalPrice || 0).toFixed(2)}</h3>

        <a href="${checkoutLink}" target="_blank"
          style="padding:12px 20px;background:#06b6d4;color:#000;border-radius:6px;text-decoration:none;">
          💳 Pay Now
        </a>
      `
    }

    /* ================= PAID ================= */
    else if (status === "paid") {
      subject = "🎉 Order Confirmed"

      html += `
        <p>Your payment was received!</p>

        <a href="${trackLink}" target="_blank"
          style="padding:12px 20px;background:#22c55e;color:#000;border-radius:6px;text-decoration:none;">
          📦 Track Order
        </a>
      `
    }

    /* ================= STATUS UPDATES ================= */
    else if (["production", "shipping", "shipped", "delivered"].includes(status)) {
      subject = `📦 Order Update: ${status.toUpperCase()}`

      html += `
        <p>Your order is now:</p>
        <h3>${status.toUpperCase()}</h3>

        <a href="${trackLink}" target="_blank"
          style="padding:12px 20px;background:#22c55e;color:#000;border-radius:6px;text-decoration:none;">
          Track Order
        </a>
      `
    }

    html += `
      <p style="margin-top:20px;">Thank you,<br/>SignaVi Studio</p>
    `

    const response = await resend.emails.send({
      from: "SignaVi Studio <onboarding@resend.dev>", // 🔥 use this for testing
      to,
      subject,
      html
    })

    if (response?.error) {
      console.error("❌ RESEND ERROR:", response.error)
    } else {
      console.log("📧 EMAIL SENT:", to)
    }

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err)
  }
}