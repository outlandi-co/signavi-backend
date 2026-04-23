import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

export const generateInvoice = (order) => {

  /* ================= PATH ================= */
  const invoicesDir = path.resolve("invoices")

  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true }) // ✅ safer
  }

  const filePath = path.join(
    invoicesDir,
    `invoice-${order._id}-${Date.now()}.pdf` // ✅ avoid overwrite
  )

  const doc = new PDFDocument({ margin: 50 })
  const stream = fs.createWriteStream(filePath)

  doc.pipe(stream)

  /* ================= LOGO ================= */
  try {
    const logoPath = path.resolve("assets/logo.png")

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 120 })
    }
  } catch {
    console.log("⚠️ Logo not found")
  }

  /* ================= COMPANY ================= */
  doc
    .fontSize(10)
    .text("Signavi", 350, 50, { align: "right" })
    .text("Printing & Design Services", { align: "right" })
    .text("Merced, California", { align: "right" })
    .text("support@signavi.com", { align: "right" })

  doc.moveDown(4)

  /* ================= TITLE ================= */
  doc.fontSize(22).text("INVOICE", { align: "center" })
  doc.moveDown(2)

  /* ================= CUSTOMER ================= */
  doc.fontSize(12)

  doc.text(`Invoice #: ${order._id}`)
  doc.text(`Customer: ${order.customerName || "Guest"}`)
  doc.text(`Email: ${order.email || "N/A"}`)
  doc.text(`Date: ${new Date(order.createdAt || Date.now()).toLocaleDateString()}`)

  doc.moveDown(2)

  /* ================= TABLE HEADER ================= */
  const startX = 50
  const colQty = 260
  const colPrice = 340
  const colTotal = 430

  doc.font("Helvetica-Bold")

  doc.text("Item", startX, doc.y)
  doc.text("Qty", colQty, doc.y)
  doc.text("Price", colPrice, doc.y)
  doc.text("Total", colTotal, doc.y)

  doc.moveDown(0.5)
  doc.moveTo(startX, doc.y).lineTo(550, doc.y).stroke()
  doc.moveDown(0.5)

  doc.font("Helvetica")

  /* ================= ITEMS ================= */
  let subtotal = 0

  ;(order.items || []).forEach(item => {
    const qty = Number(item?.quantity || 1)
    const price = Number(item?.price || 0)
    const total = qty * price

    subtotal += total

    const y = doc.y

    doc.text(item?.name || "Item", startX, y)
    doc.text(qty.toString(), colQty, y)
    doc.text(`$${price.toFixed(2)}`, colPrice, y)
    doc.text(`$${total.toFixed(2)}`, colTotal, y)

    doc.moveDown()
  })

  doc.moveDown()

  /* ================= TOTALS ================= */

  const shipping = Number(order.shippingCost || 0)

  // ✅ USE EXISTING TAX / PRICE IF AVAILABLE
  const tax = Number(order.tax ?? subtotal * 0.08)

  const finalTotal =
    Number(order.finalPrice) ||
    subtotal + shipping + tax

  doc.moveTo(startX, doc.y).lineTo(550, doc.y).stroke()
  doc.moveDown()

  doc.text(`Subtotal: $${subtotal.toFixed(2)}`, { align: "right" })
  doc.text(`Shipping: $${shipping.toFixed(2)}`, { align: "right" })
  doc.text(`Tax: $${tax.toFixed(2)}`, { align: "right" })

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