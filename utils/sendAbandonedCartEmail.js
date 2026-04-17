import Cart from "../models/Cart.js"
import { calculateDiscount } from "./discountEngine.js"
import { sendAbandonedCartEmail } from "../utils/sendEmail.js"

export const checkAbandonedCarts = async () => {
  try {
    const now = new Date()

    const carts = await Cart.find({
      recovered: false,
      abandonedEmailSent: false,
      updatedAt: { $lt: new Date(now - 1000 * 60 * 30) }
    })

    for (const cart of carts) {

      const discount = calculateDiscount(cart, cart.attempts || 0)

      cart.discountCode = discount.discountCode
      cart.discountPercent = discount.discountPercent
      cart.abandonedEmailSent = true

      await cart.save()

      await sendAbandonedCartEmail(cart)

      console.log("📧 Abandoned cart email sent:", cart.email)
    }

  } catch (err) {
    console.error("❌ Abandoned cart error:", err.message)
  }
}