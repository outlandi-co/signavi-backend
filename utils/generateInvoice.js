import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

export const generateInvoice = async (order) => {
  const folder = path.resolve("invoices")
  const filePath = path.join(folder, `invoice-${order._id}.pdf`)

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true })
  }

  const doc = new PDFDocument()
  const stream = fs.createWriteStream(filePath)

  doc.pipe(stream)

  doc.fontSize(20).text("SignaVi Studio", { align: "center" })
  doc.moveDown()

  doc.text(`Invoice ID: ${order._id}`)
  doc.text(`Customer: ${order.customerName}`)
  doc.text(`Email: ${order.email}`)
  doc.moveDown()

  doc.text(`Total: $${order.finalPrice}`)

  doc.end()

  await new Promise((resolve) => stream.on("finish", resolve))

  return filePath
}