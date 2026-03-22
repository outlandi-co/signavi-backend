export const generateDiscount = (cart) => {

  const total = cart.items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  )

  let discount = 10

  if (total > 200) discount = 20
  if (total > 500) discount = 25

  const code = `SAVE${discount}-${Math.floor(Math.random() * 9999)}`

  return {
    discount,
    code
  }
}