import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

export const sendOrderStatusEmail = async (email, status, orderId) => {

  try {

    /* STATUS MESSAGE */

    let statusMessage = ""

    switch(status){

      case "processing":
        statusMessage = "Your order is now being processed."
        break

      case "shipping":
        statusMessage = "Your order has shipped and is on its way."
        break

      case "shipping confirmation":
        statusMessage = "Your shipment has been confirmed."
        break

      case "complete":
        statusMessage = "Your order has been completed. Thank you for your purchase."
        break

      default:
        statusMessage = `Your order status is now: ${status}`
    }

    const textMessage = `
Hello,

Your order ${orderId} has been updated.

Current Status: ${status}

${statusMessage}

Thank you for shopping with Signavi.
`

    const htmlMessage = `
      <div style="font-family:Arial, sans-serif; padding:20px">
        <h2>Order Update</h2>
        <p>Your order <strong>${orderId}</strong> has been updated.</p>

        <p>
          <strong>Status:</strong> ${status}
        </p>

        <p>${statusMessage}</p>

        <hr/>

        <p style="font-size:12px;color:#777">
          Thank you for shopping with Signavi.
        </p>
      </div>
    `

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Order Update - ${orderId}`,
      text: textMessage,
      html: htmlMessage
    })

  } catch(error){

    console.error("EMAIL SEND ERROR:", error)

  }

}