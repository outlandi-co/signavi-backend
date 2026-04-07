import Cart from "../models/Cart.js"
import { calculateDiscount } from "./discountEngine.js"
import { sendNotificationEmail } from "../utils/sendEmail.js"

export const checkAbandonedCarts = async () => {
  try {
    const now = new Date()

    const carts = await Cart.find({
      recovered: false,
      abandonedEmailSent: false,
      updatedAt: { $lt: new Date(now - 1000 * 60 * 30) } // 30 min
    })

    for (const cart of carts) {

      /* 🔥 CALCULATE DISCOUNT */
      const discount = calculateDiscount(cart, cart.attempts || 0)

      cart.discountCode = discount.discountCode
      cart.discountPercent = discount.discountPercent
      cart.abandonedEmailSent = true

      await cart.save()

      const total = cart.items.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0
      )

      const discounted = total * (1 - discount.discountPercent / 100)

      /* 🔥 EMAIL */
      await sendNotificationEmail(
        cart.email,
        "🛒 You left items in your cart",
        `
        You left items in your cart.

        💰 Original: $${total.toFixed(2)}  
        🎉 Discount: ${discount.discountPercent}%  
        ✅ New Total: $${discounted.toFixed(2)}

        Use code: <strong>${discount.discountCode}</strong>

        👉 Come back and complete your order!
        `
      )

      console.log("📧 Abandoned cart email sent:", cart.email)
    }

  } catch (err) {
    console.error("❌ Abandoned cart error:", err.message)
  }
}