import sgMail from "@sendgrid/mail"

sgMail.setApiKey(process.env.SENDGRID_API_KEY) // ✅ FIXED

export const sendOrderStatusEmail = async (
  to,
  status,
  order,
  invoicePath = null
) => {
  try {
    console.log("📧 EMAIL FUNCTION HIT:", { to, status })
    console.log("📨 SENDING FROM:", process.env.EMAIL_FROM)

    let subject = "SignaVi Update"
    let html = `<h2>SignaVi Studio</h2>`

    if (status === "payment_required") {
      subject = "💳 Payment Required"
      html += `
        <p>Hello ${order.customerName || "Customer"},</p>
        <p>Your order is ready for payment.</p>
        <p><b>Total:</b> $${order.finalPrice || 0}</p>
      `
    }

    if (status === "denied") {
      subject = "❌ Order Update"
      html += `<p>Your order was denied or needs revision.</p>`
    }

    if (status === "invoice") {
      subject = "🧾 Invoice"
      html += `<p>Your invoice is attached.</p>`
    }

    const msg = {
      to,
      from: `SignaVi Studio <${process.env.EMAIL_FROM}>`, // 🔥 branding + domain
      subject,
      html
    }

    await sgMail.send(msg)

    console.log("📧 EMAIL SENT SUCCESSFULLY")

  } catch (err) {
    console.error("❌ SENDGRID ERROR:", err.response?.body || err.message)
  }
}