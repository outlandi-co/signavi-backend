import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

export const sendOrderStatusEmail = async (email, status, orderId) => {

  const mailOptions = {
    from: `"Signavi Store" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Order Update - ${orderId}`,
    html: `
      <h2>Your Order Status Updated</h2>
      <p>Order ID: <b>${orderId}</b></p>
      <p>New Status: <b>${status}</b></p>
      <p>Thank you for shopping with us!</p>
    `
  }

  await transporter.sendMail(mailOptions)
}