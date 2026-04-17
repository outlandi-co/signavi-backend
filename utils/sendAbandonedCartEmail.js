import { sendAbandonedCartEmail } from "../utils/sendEmail.js"

/* =========================================================
   🛒 HANDLE ABANDONED CART
========================================================= */
export const handleAbandonedCart = async (cart) => {
  try {
    if (!cart || !cart.email || !cart.items?.length) {
      console.log("⚠️ Invalid cart, skipping")
      return
    }

    console.log("🛒 Abandoned cart:", cart.email)

    await sendAbandonedCartEmail(cart)

    console.log("📧 Email sent:", cart.email)

  } catch (err) {
    console.error("❌ Abandoned cart error:", err)
  }
}

/* =========================================================
   🔁 OPTIONAL BATCH PROCESSOR
========================================================= */
export const processAbandonedCarts = async (carts = []) => {
  try {
    for (const cart of carts) {
      await handleAbandonedCart(cart)
    }

    console.log("✅ Finished abandoned carts")

  } catch (err) {
    console.error("❌ Batch error:", err)
  }
}