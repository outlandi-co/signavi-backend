import { sendAbandonedCartEmail } from "../utils/sendEmail.js"

/**
 * 🛒 Handle Abandoned Cart Logic
 * - Can be triggered manually or via interval/cron later
 */
export const handleAbandonedCart = async (cart) => {
  try {
    if (!cart || !cart.email || !cart.items?.length) {
      console.log("⚠️ Invalid cart, skipping email")
      return
    }

    console.log("🛒 Processing abandoned cart for:", cart.email)

    /* 🔥 Send Email */
    await sendAbandonedCartEmail(cart)

    console.log("✅ Abandoned cart email sent:", cart.email)

  } catch (err) {
    console.error("❌ Abandoned Cart Service Error:", err)
  }
}

/**
 * 🔁 OPTIONAL: Batch processor (future use)
 */
export const processAbandonedCarts = async (carts = []) => {
  try {
    for (const cart of carts) {
      await handleAbandonedCart(cart)
    }

    console.log("🚀 Finished processing abandoned carts")

  } catch (err) {
    console.error("❌ Batch abandoned cart error:", err)
  }
}