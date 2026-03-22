import Cart from "../models/Cart.js"
import { sendAbandonedCartEmail } from "../utils/sendAbandonedCartEmail.js"
import { generateDiscount } from "./aiDiscount.js"

export const checkAbandonedCarts = async () => {
  try {
    const ONE_HOUR = 1000 * 60 * 60

    const cutoff = new Date(Date.now() - ONE_HOUR)

    const carts = await Cart.find({
      updatedAt: { $lt: cutoff },
      abandonedEmailSent: false,
      recovered: false
    })

    for (const cart of carts) {

      /* 🤖 AI DISCOUNT */
      const { discount, code } = generateDiscount(cart)

      cart.discountPercent = discount
      cart.discountCode = code

      await sendAbandonedCartEmail(cart)

      cart.abandonedEmailSent = true
      await cart.save()
    }

    if (carts.length > 0) {
      console.log(`🔥 ${carts.length} carts recovered with AI discounts`)
    }

  } catch (err) {
    console.error("❌ Abandoned cart error:", err)
  }
}