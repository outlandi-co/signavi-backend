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
    // 🔥 DEBUG ENTRY POINT
    console.log("📧 EMAIL FUNCTION TRIGGERED:", {
      to,
      status,
      id
    })

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

    /* ================= PAYMENT REQUIRED (🔥 PRIMARY FLOW) ================= */
    if (status === "payment_required") {
      subject = "💳 Payment Required – Your Order is Ready"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>Your quote has been approved and is ready for payment.</p>

        <h3>Total: $${order?.price || 0}</h3>

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

    /* ================= APPROVED (fallback) ================= */
    else if (status === "approved") {
      subject = "✅ Your Quote Has Been Approved"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>Your quote has been approved.</p>

        <h3>Total: $${order?.price || 0}</h3>
      `
    }

    /* ================= DENIED ================= */
    else if (status === "denied") {
      subject = "❌ Your Quote Was Not Approved"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>Your quote was <strong>denied</strong>.</p>

        <p><strong>Reason:</strong> ${
          order?.denialReason || "Not specified"
        }</p>
      `
    }

    /* ================= DEFAULT ================= */
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

    // 🔥 SEND EMAIL
    console.log("📤 SENDING EMAIL TO:", to)

    const response = await resend.emails.send({
      from: "SignaVi Studio <onboarding@resend.dev>",
      to,
      subject,
      html
    })

    console.log("📧 EMAIL SUCCESS:", response)

  } catch (err) {
    console.error("❌ EMAIL ERROR FULL:", err)
  }
}