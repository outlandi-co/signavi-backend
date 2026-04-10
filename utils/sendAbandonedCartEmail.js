import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

export const sendAbandonedCartEmail = async (cart) => {
  try {

    const itemsList = cart.items.map(item => `
      <li>${item.name} (x${item.quantity}) - $${item.price}</li>
    `).join("")

    const discountBlock = cart.discountCode
      ? `
        <h3>🔥 Your Discount: ${cart.discountPercent}% OFF</h3>
        <p>Use code: <b>${cart.discountCode}</b></p>
      `
      : ""

    /* 🔥 PASS DISCOUNT INTO LINK */
    const CLIENT_URL =
  process.env.CLIENT_URL || "https://signavistudio.store"

const link = cart.discountCode
  ? `${CLIENT_URL}/store?code=${cart.discountCode}&discount=${cart.discountPercent}`
  : `${CLIENT_URL}/store`

    await transporter.sendMail({
      from: `"Signavi Store" <${process.env.EMAIL_USER}>`,
      to: cart.email,
      subject: "🛒 You left items in your cart!",
      html: `
        <h2>Don't miss out 👀</h2>

        ${discountBlock}

        <ul>${itemsList}</ul>

        <p>
          👉 <a href="${link}">
            Return to your cart
          </a>
        </p>
      `
    })

    console.log("📧 Discount email sent:", cart.email)

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err)
  }
}