import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

export const generateInvoice = (order) => {

  /* ================= PATH ================= */
  const invoicesDir = path.resolve("invoices")

  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir)
  }

  const filePath = path.join(invoicesDir, `invoice-${order._id}.pdf`)

  const doc = new PDFDocument({ margin: 50 })
  const stream = fs.createWriteStream(filePath)

  doc.pipe(stream)

  /* ================= LOGO ================= */
  try {
    const logoPath = path.resolve("assets/logo.png")

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 120 })
    }
  } catch (err) {
    console.log("⚠️ Logo not found")
  }

  /* ================= COMPANY INFO ================= */
  doc
    .fontSize(10)
    .text("Signavi", 350, 50, { align: "right" })
    .text("Printing & Design Services", { align: "right" })
    .text("Merced, California", { align: "right" })
    .text("Email: support@signavi.com", { align: "right" })

  doc.moveDown(4)

  /* ================= TITLE ================= */
  doc
    .fontSize(22)
    .text("INVOICE", { align: "center" })

  doc.moveDown(2)

  /* ================= CUSTOMER INFO ================= */
  doc.fontSize(12)

  doc.text(`Invoice #: ${order._id}`)
  doc.text(`Customer: ${order.customerName || "N/A"}`)
  doc.text(`Email: ${order.email || "N/A"}`)
  doc.text(`Date: ${new Date().toLocaleDateString()}`)

  doc.moveDown(2)

  /* ================= TABLE ================= */
  const startX = 50

  doc.font("Helvetica-Bold")
  doc.text("Item", startX, doc.y)
  doc.text("Qty", 250, doc.y)
  doc.text("Price", 320, doc.y)
  doc.text("Total", 420, doc.y)

  doc.moveDown()

  doc.moveTo(startX, doc.y).lineTo(550, doc.y).stroke()
  doc.moveDown(0.5)

  doc.font("Helvetica")

  let subtotal = 0

  ;(order.items || []).forEach(item => {
    const qty = Number(item.quantity || 1)
    const price = Number(item.price || 0)
    const total = qty * price

    subtotal += total

    doc.text(item.name || "Item", startX, doc.y)
    doc.text(qty.toString(), 250, doc.y)
    doc.text(`$${price.toFixed(2)}`, 320, doc.y)
    doc.text(`$${total.toFixed(2)}`, 420, doc.y)

    doc.moveDown()
  })

  doc.moveDown()

  /* ================= TOTALS ================= */
  const shipping = Number(order.shippingCost || 0)
  const taxRate = 0.08 // 🔥 you can change this
  const tax = subtotal * taxRate
  const finalTotal = subtotal + shipping + tax

  doc.moveTo(startX, doc.y).lineTo(550, doc.y).stroke()
  doc.moveDown()

  doc.text(`Subtotal: $${subtotal.toFixed(2)}`, { align: "right" })
  doc.text(`Shipping: $${shipping.toFixed(2)}`, { align: "right" })
  doc.text(`Tax (8%): $${tax.toFixed(2)}`, { align: "right" })

  doc.font("Helvetica-Bold")
  doc.text(`Total: $${finalTotal.toFixed(2)}`, { align: "right" })
  doc.font("Helvetica")

  doc.moveDown(3)

  /* ================= FOOTER ================= */
  doc
    .fontSize(10)
    .text("Thank you for your business!", { align: "center" })

  doc.moveDown(0.5)

  doc
    .fontSize(8)
    .text("Signavi © 2026 | Built with precision and creativity", {
      align: "center"
    })

  doc.end()

  return filePath
}