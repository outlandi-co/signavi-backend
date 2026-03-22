import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

export const generateInvoice = (order) => {

  const filePath = path.resolve(`invoices/invoice-${order._id}.pdf`)

  /* ensure folder exists */
  if (!fs.existsSync("invoices")) {
    fs.mkdirSync("invoices")
  }

  const doc = new PDFDocument()

  doc.pipe(fs.createWriteStream(filePath))

  /* ================= HEADER ================= */
  doc.fontSize(20).text("SIGNAVI INVOICE", { align: "center" })
  doc.moveDown()

  doc.fontSize(12).text(`Order ID: ${order._id}`)
  doc.text(`Customer: ${order.customerName}`)
  doc.text(`Email: ${order.email}`)
  doc.text(`Date: ${new Date().toLocaleDateString()}`)

  doc.moveDown()

  /* ================= ITEMS ================= */
  doc.text("Items:", { underline: true })

  order.items?.forEach(item => {
    doc.text(`${item.name} - Qty: ${item.quantity} - $${item.price}`)
  })

  doc.moveDown()

  /* ================= TOTAL ================= */
  doc.fontSize(14).text(`Total: $${order.total || 0}`, {
    align: "right"
  })

  doc.moveDown()

  doc.text("Thank you for your business!", {
    align: "center"
  })

  doc.end()

  return filePath
}