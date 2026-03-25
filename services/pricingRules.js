export const applyPricingRules = (items = []) => {
  return items.map(item => {
    let price = Number(item.price || 0)

    const name = item.name.toLowerCase()

    /* ================= BASE PRODUCT RULES ================= */

    if (name.includes("shirt")) {
      price = Math.max(price, 6) // 🔥 minimum shirt cost
    }

    if (name.includes("hoodie")) {
      price = Math.max(price, 15)
    }

    /* ================= PRINT RULES ================= */

    if (name.includes("print") || name.includes("color")) {
      price = Math.max(price, 2) // per piece print cost
    }

    /* ================= RUSH FEE ================= */

    if (name.includes("rush")) {
      price = Math.max(price, 25)
    }

    /* ================= MINIMUM FLOOR ================= */
    price = Math.max(price, 1)

    return {
      ...item,
      price
    }
  })
}