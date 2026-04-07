export const calculateDiscount = (cart, attempts = 0) => {
  const total = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  let percent = 0
  let code = ""

  /* 🔥 RULES */

  // High value cart
  if (total >= 200) {
    percent = 15
    code = "VIP15"
  }

  // Medium cart
  else if (total >= 100) {
    percent = 10
    code = "SAVE10"
  }

  // Repeat abandoner
  if (attempts >= 2) {
    percent = Math.max(percent, 20)
    code = "COME_BACK20"
  }

  return {
    discountPercent: percent,
    discountCode: code
  }
}