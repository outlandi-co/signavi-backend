import jsPDF from "jspdf"

export function generateOrderPDF(order) {
  const doc = new jsPDF()

  let y = 20

  doc.setFontSize(18)
  doc.text("Production Work Order", 20, y)
  y += 10

  doc.setFontSize(12)
  doc.text(`Customer: ${order.customerName}`, 20, y)
  y += 8

  doc.text(`Email: ${order.email || "N/A"}`, 20, y)
  y += 8

  doc.text(`Order ID: ${order._id}`, 20, y)
  y += 8

  doc.text(`Status: ${order.status}`, 20, y)
  y += 8

  if (order.finalPrice) {
    doc.text(`Total: $${order.finalPrice}`, 20, y)
    y += 8
  }

  return doc.output("arraybuffer")
}