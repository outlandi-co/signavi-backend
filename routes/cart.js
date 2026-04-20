import { useNavigate } from "react-router-dom"
import { useState } from "react"

export default function Cart() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  /* =========================================================
     💳 GO TO CHECKOUT (SQUARE FLOW)
  ========================================================= */
  const handleCheckout = async () => {
    try {
      setLoading(true)

      // 🔥 If you later store cart/order ID in localStorage
      const orderId = localStorage.getItem("lastOrderId")

      if (!orderId) {
        alert("No active order found. Please create a quote first.")
        return
      }

      // 🔥 Redirect into your working checkout pipeline
      navigate(`/checkout/${orderId}`)

    } catch (err) {
      console.error("❌ CART CHECKOUT ERROR:", err)
      alert("Failed to start checkout")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center"
    >
      <h1 className="text-3xl font-bold mb-4">🛒 Cart</h1>

      <p className="text-gray-400 mb-6 max-w-md">
        Your cart has been upgraded to a drawer-based checkout experience.
        Use the cart icon in the navigation bar to review your items and proceed to payment.
      </p>

      {/* 🔥 NEW CHECKOUT BUTTON */}
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="bg-cyan-500 px-6 py-2 rounded text-black font-semibold mb-4"
      >
        {loading ? "Processing..." : "💳 Go to Checkout"}
      </button>

      {/* CONTINUE SHOPPING */}
      <button
        onClick={() => navigate("/store")}
        className="bg-gray-700 px-6 py-2 rounded text-white"
      >
        Continue Shopping
      </button>

      <p className="text-gray-500 mt-6 text-sm">
        💳 Checkout is handled securely via Square
      </p>
    </div>
  )
}