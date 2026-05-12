import sgMail from "@sendgrid/mail"

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const CLIENT_URL =
  process.env.CLIENT_URL ||
  "https://signavistudio.store"

const formatMoney = (value) => {
  return Number(value || 0).toFixed(2)
}

const buildReceiptUrl = (order) => {
  return `${CLIENT_URL}/receipt/${order._id}`
}

const buildOrderUrl = (order) => {
  return `${CLIENT_URL}/customer/orders/${order._id}`
}

const sendReceiptEmail = async (order) => {
  try {
    if (!order?.email) {
      console.warn("📧 RECEIPT EMAIL SKIPPED: Missing customer email")
      return
    }

    if (!process.env.SENDGRID_API_KEY) {
      console.warn("📧 RECEIPT EMAIL SKIPPED: Missing SENDGRID_API_KEY")
      return
    }

    if (!process.env.EMAIL_FROM) {
      console.warn("📧 RECEIPT EMAIL SKIPPED: Missing EMAIL_FROM")
      return
    }

    const receiptUrl = buildReceiptUrl(order)
    const orderUrl = buildOrderUrl(order)

    const itemsHtml = (order.items || []).map((item) => {
      const lineTotal = Number(item.price || 0) * Number(item.quantity || 1)

      return `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb;">
            ${item.name || "Item"}
            ${
              item.variant?.color || item.variant?.size
                ? `<br/><span style="font-size:12px; color:#64748b;">
                    ${item.variant?.color || ""} ${item.variant?.size || ""}
                  </span>`
                : ""
            }
          </td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb; text-align:center;">
            ${item.quantity || 1}
          </td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb; text-align:right;">
            $${formatMoney(item.price)}
          </td>
          <td style="padding:10px; border-bottom:1px solid #e5e7eb; text-align:right;">
            $${formatMoney(lineTotal)}
          </td>
        </tr>
      `
    }).join("")

    const html = `
      <div style="font-family: Arial, sans-serif; background:#f8fafc; padding:30px;">
        <div style="max-width:680px; margin:0 auto; background:white; border-radius:14px; overflow:hidden; border:1px solid #e5e7eb;">
          
          <div style="background:#020617; color:white; padding:24px;">
            <h1 style="margin:0; font-size:24px;">SignaVi Studio</h1>
            <p style="margin:8px 0 0; color:#cbd5e1;">Payment received — thank you!</p>
          </div>

          <div style="padding:28px;">
            <h2 style="margin-top:0; color:#020617;">Your receipt</h2>

            <p>Hello ${order.customerName || "Customer"},</p>

            <p>
              Thank you for your payment. Your order has been received and moved into production.
            </p>

            <div style="background:#f1f5f9; border-radius:12px; padding:18px; margin:20px 0;">
              <p style="margin:0;"><strong>Order ID:</strong> ${order._id}</p>
              <p style="margin:8px 0 0;"><strong>Payment Status:</strong> Paid</p>
              <p style="margin:8px 0 0;"><strong>Paid At:</strong> ${
                order.paidAt
                  ? new Date(order.paidAt).toLocaleString()
                  : new Date().toLocaleString()
              }</p>
              ${
                order.squarePaymentId
                  ? `<p style="margin:8px 0 0;"><strong>Square Payment ID:</strong> ${order.squarePaymentId}</p>`
                  : ""
              }
            </div>

            <table style="width:100%; border-collapse:collapse; margin-top:18px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:10px; text-align:left; border-bottom:1px solid #e5e7eb;">Item</th>
                  <th style="padding:10px; text-align:center; border-bottom:1px solid #e5e7eb;">Qty</th>
                  <th style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">Price</th>
                  <th style="padding:10px; text-align:right; border-bottom:1px solid #e5e7eb;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${
                  itemsHtml ||
                  `
                    <tr>
                      <td colspan="4" style="padding:10px; border-bottom:1px solid #e5e7eb;">
                        Custom order
                      </td>
                    </tr>
                  `
                }
              </tbody>
            </table>

            <div style="margin-top:20px; background:#f8fafc; border-radius:12px; padding:18px;">
              <p style="margin:0; display:flex; justify-content:space-between;">
                <span>Subtotal:</span>
                <strong>$${formatMoney(order.subtotal)}</strong>
              </p>

              <p style="margin:8px 0 0; display:flex; justify-content:space-between;">
                <span>Tax:</span>
                <strong>$${formatMoney(order.tax)}</strong>
              </p>

              <p style="margin:8px 0 0; display:flex; justify-content:space-between;">
                <span>Shipping:</span>
                <strong>$${formatMoney(order.shipping)}</strong>
              </p>

              <hr style="border:none; border-top:1px solid #e5e7eb; margin:14px 0;" />

              <p style="margin:0; display:flex; justify-content:space-between; font-size:18px;">
                <span>Total Paid:</span>
                <strong>$${formatMoney(order.finalPrice)}</strong>
              </p>
            </div>

            <div style="margin-top:24px;">
              <a
                href="${receiptUrl}"
                target="_blank"
                style="
                  display:inline-block;
                  background:#16a34a;
                  color:white;
                  text-decoration:none;
                  padding:14px 22px;
                  border-radius:10px;
                  font-weight:bold;
                  margin-right:10px;
                "
              >
                View Receipt
              </a>

              <a
                href="${orderUrl}"
                target="_blank"
                style="
                  display:inline-block;
                  background:#020617;
                  color:white;
                  text-decoration:none;
                  padding:14px 22px;
                  border-radius:10px;
                  font-weight:bold;
                "
              >
                View Order
              </a>
            </div>

            <p style="font-size:13px; color:#64748b; margin-top:22px;">
              If the receipt button does not open, copy and paste this link into your browser:<br/>
              <a href="${receiptUrl}" target="_blank">${receiptUrl}</a>
            </p>
          </div>

          <div style="background:#f8fafc; padding:18px 28px; color:#64748b; font-size:13px;">
            <p style="margin:0;">SignaVi Studio</p>
            <p style="margin:6px 0 0;">Custom printing, design, apparel, signage, and production services.</p>
          </div>
        </div>
      </div>
    `

    const msg = {
      to: order.email,
      from: `SignaVi Studio <${process.env.EMAIL_FROM}>`,
      subject: `Receipt for Order ${order._id} - SignaVi Studio`,
      html
    }

    await sgMail.send(msg)

    console.log("📧 RECEIPT EMAIL SENT SUCCESSFULLY:", {
      to: order.email,
      orderId: order._id
    })

  } catch (err) {
    console.error(
      "❌ SEND RECEIPT EMAIL ERROR:",
      err.response?.body || err.message
    )

    throw err
  }
}

export default sendReceiptEmail