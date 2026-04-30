import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

/* =========================================================
   📧 MAIN EMAIL FUNCTION
========================================================= */
export const sendOrderStatusEmail = async (
  to,
  status,
  id,
  order = {}
) => {
  try {
    console.log("📧 EMAIL FUNCTION TRIGGERED:", { to, status, id })

    if (!to) {
      console.log("⚠️ No email provided")
      return
    }

    if (!process.env.RESEND_API_KEY) {
      console.log("❌ RESEND_API_KEY MISSING")
      return
    }

    const CLIENT_URL =
      process.env.CLIENT_URL || "https://signavistudio.store"

    const checkoutLink = `${CLIENT_URL}/checkout/${id}`

    let subject = "SignaVi Studio Update"
    let html = `<h2>SignaVi Studio</h2>`

    /* =========================================================
       🔐 RESET PASSWORD
    ========================================================= */
    if (status === "reset_password") {
      subject = "🔐 Reset Your Password"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>You requested a password reset.</p>

        <p>
          <a href="${order.resetUrl}" target="_blank"
            style="
              display:inline-block;
              padding:14px 24px;
              background:#06b6d4;
              color:#000;
              text-decoration:none;
              border-radius:6px;
              font-weight:bold;
            ">
            🔐 Reset Password
          </a>
        </p>

        <p>This link expires in 15 minutes.</p>
      `
    }

    /* =========================================================
       💳 PAYMENT REQUIRED
    ========================================================= */
    else if (status === "payment_required") {
      subject = "💳 Payment Required – Your Order is Ready"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>Your quote has been approved and is ready for payment.</p>

        <h3>Total: $${Number(order?.price || 0).toFixed(2)}</h3>

        <p>
          <a href="${checkoutLink}" target="_blank"
            style="
              display:inline-block;
              padding:14px 24px;
              background:#06b6d4;
              color:#000;
              text-decoration:none;
              border-radius:6px;
              font-weight:bold;
            ">
            💳 Pay Now
          </a>
        </p>
      `
    }

    /* =========================================================
       ❌ DENIED
    ========================================================= */
    else if (status === "denied") {
      subject = "❌ Your Quote Was Not Approved"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>Your quote was denied.</p>
      `
    }

    /* =========================================================
       📦 DEFAULT
    ========================================================= */
    else {
      html += `<p>Status update: ${status}</p>`
    }

    /* ================= FOOTER ================= */
    html += `
      <p style="margin-top:20px;">
        Thank you,<br/>
        <strong>SignaVi Studio</strong>
      </p>
    `

    console.log("📤 SENDING EMAIL TO:", to)

    const response = await resend.emails.send({
      from: "SignaVi Studio <noreply@signavistudio.store>",
      to,
      subject,
      html
    })

    /* =========================================================
       🔍 HANDLE RESEND ERRORS PROPERLY
    ========================================================= */
    if (response?.error) {
      console.error("❌ RESEND ERROR:", response.error)
    } else {
      console.log("📧 EMAIL SUCCESS:", response)
    }

  } catch (err) {
    console.error("❌ EMAIL ERROR FULL:", err)
  }
}