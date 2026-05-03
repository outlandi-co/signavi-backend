export const orderEmailTemplate = (order) => {
  const trackUrl = `${process.env.CLIENT_URL}/track/${order._id}`

  return `
    <div style="font-family: Arial; padding: 20px;">
      <h2>🎉 Order Received</h2>

      <p>Thanks for your order, ${order.customerName || "Customer"}!</p>

      <p><strong>Order ID:</strong> ${order._id}</p>
      <p><strong>Total:</strong> $${order.finalPrice?.toFixed(2)}</p>

      <a href="${trackUrl}" 
         style="display:inline-block;padding:10px 20px;background:#22c55e;color:white;text-decoration:none;border-radius:5px;margin-top:10px;">
         📦 Track Your Order
      </a>

      <p style="margin-top:20px;">We’ll keep you updated as your order progresses.</p>
    </div>
  `
}

export const statusUpdateTemplate = (order) => {
  const trackUrl = `${process.env.CLIENT_URL}/track/${order._id}`

  return `
    <div style="font-family: Arial; padding: 20px;">
      <h2>📦 Order Update</h2>

      <p>Your order is now:</p>

      <h3>${order.status.toUpperCase()}</h3>

      <a href="${trackUrl}" 
         style="display:inline-block;padding:10px 20px;background:#22c55e;color:white;text-decoration:none;border-radius:5px;">
         Track Order
      </a>
    </div>
  `
}