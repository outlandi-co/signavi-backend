import jsPDF from "jspdf"

export function generateOrderPDF(order) {
  const doc = new jsPDF()

  let y = 20

  /* ================= LOGO ================= */
  // 🔥 Replace with your logo (base64 or URL)
  const logo = order.logoBase64 || null

  if (logo) {
    doc.addImage(logo, "PNG", 70, 10, 60, 20)
    y = 40
  } else {
    doc.setFontSize(18)
    doc.text("SIGNAVI", 80, y)
    y += 10
  }

  /* ================= HEADER ================= */
  doc.setFontSize(16)
  doc.text("Production Work Order", 20, y)
  y += 10

  doc.setFontSize(12)
  doc.text(`Customer: ${order.customerName || "N/A"}`, 20, y)
  y += 8

  doc.text(`Email: ${order.email || "N/A"}`, 20, y)
  y += 8

  doc.text(`Order ID: ${order._id}`, 20, y)
  y += 8

  doc.text(`Status: ${order.status}`, 20, y)
  y += 10

  /* ================= TABLE HEADER ================= */
  doc.setFont("helvetica", "bold")

  doc.text("Item", 20, y)
  doc.text("Qty", 120, y)
  doc.text("Price", 140, y)
  doc.text("Total", 170, y)

  y += 5

  doc.line(20, y, 190, y)
  y += 8

  doc.setFont("helvetica", "normal")

  /* ================= ITEMS ================= */
  let grandTotal = 0

  if (order.items && order.items.length > 0) {
    order.items.forEach(item => {
      const qty = Number(item.quantity || 1)
      const price = Number(item.price || 0)
      const total = qty * price

      grandTotal += total

      doc.text(item.name || "Item", 20, y)
      doc.text(String(qty), 120, y)
      doc.text(`$${price.toFixed(2)}`, 140, y)
      doc.text(`$${total.toFixed(2)}`, 170, y)

      y += 8
    })
  } else {
    /* 🔥 FALLBACK (your current system) */
    const fallback = Number(
      order.total || order.finalPrice || order.price || 0
    )

    grandTotal = fallback

    doc.text(`Order #${order._id}`, 20, y)
    doc.text("1", 120, y)
    doc.text(`$${fallback.toFixed(2)}`, 140, y)
    doc.text(`$${fallback.toFixed(2)}`, 170, y)

    y += 10
  }

  /* ================= TOTAL ================= */
  y += 5
  doc.line(20, y, 190, y)
  y += 10

  doc.setFont("helvetica", "bold")
  doc.text(`Total: $${grandTotal.toFixed(2)}`, 140, y)

  y += 15

  /* ================= FOOTER ================= */
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("Thank you for your business!", 70, y)

  return doc.output("arraybuffer")
}