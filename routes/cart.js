import { useNavigate } from "react-router-dom"
import { useState } from "react"

export default function Cart() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  /* =========================================================
     💳 GO TO CHECKOUT (SQUARE FLOW)
  ========================================================= */
  const handleCheckout = async () => {
    try {
      setLoading(true)
      setError("")

      const orderId = localStorage.getItem("lastOrderId")

      if (!orderId) {
        setError("No active order found. Please create a quote first.")
        setLoading(false)
        return
      }

      console.log("🛒 Redirecting to checkout:", orderId)

      navigate(`/checkout/${orderId}`)

    } catch (err) {
      console.error("❌ CART CHECKOUT ERROR:", err)
      setError("Failed to start checkout")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
      
      <h1 className="text-3xl font-bold mb-4">🛒 Cart</h1>

      <p className="text-gray-400 mb-6 max-w-md">
        Your cart uses a drawer-based checkout. Click below to proceed with your latest order.
      </p>

      {/* 🔥 ERROR MESSAGE */}
      {error && (
        <p className="text-red-400 mb-4">
          {error}
        </p>
      )}

      {/* 🔥 CHECKOUT BUTTON */}
      <button
        onClick={handleCheckout}
        disabled={loading}
        className={`px-6 py-2 rounded font-semibold mb-4 ${
          loading ? "bg-gray-500" : "bg-cyan-500 text-black"
        }`}
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
        💳 Checkout is securely powered by Square
      </p>
    </div>
  )
}