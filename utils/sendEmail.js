import sgMail from "@sendgrid/mail"

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

export const sendOrderStatusEmail = async (
  to,
  status,
  order,
  invoicePath = null
) => {
  try {
    console.log("📧 EMAIL FUNCTION HIT:", { to, status })

    let subject = "SignaVi Update"
    let html = `<h2>SignaVi Studio</h2>`

    if (status === "payment_required") {
      subject = "💳 Payment Required"
      html += `
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
      from: process.env.EMAIL_FROM,
      subject,
      html
    }

    /* 📎 ATTACH INVOICE (optional) */
    if (invoicePath) {
      const fs = await import("fs")

      const fileContent = fs.readFileSync(invoicePath).toString("base64")

      msg.attachments = [
        {
          content: fileContent,
          filename: "invoice.pdf",
          type: "application/pdf",
          disposition: "attachment"
        }
      ]
    }

    await sgMail.send(msg)

    console.log("📧 EMAIL SENT SUCCESSFULLY")

  } catch (err) {
    console.error("❌ SENDGRID ERROR:", err.response?.body || err.message)
  }
}