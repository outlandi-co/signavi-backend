export function calculatePrice(baseCost, quantity) {
  const profit = baseCost * 0.6
  const unit = baseCost + profit
  const total = unit * quantity

  return {
    unit,
    total
  }
}