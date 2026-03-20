import { useState } from "react"

export default function useCart() {
  const [cart, setCart] = useState([])

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(p => p._id === product._id)

      if (existing) {
        return prev.map(p =>
          p._id === product._id
            ? { ...p, quantity: p.quantity + 1 }
            : p
        )
      }

      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(p => p._id !== id))
  }

  const clearCart = () => setCart([])

  return { cart, addToCart, removeFromCart, clearCart }
}