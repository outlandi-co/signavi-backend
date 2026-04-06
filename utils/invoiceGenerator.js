import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

export const generateInvoice = async (order) => {

  const folder = path.join("invoices") // 🔥 FIXED FOLDER NAME
  const fileName = `invoice-${order._id}.pdf`
  const filePath = path.join(folder, fileName)

  /* ================= ENSURE FOLDER ================= */
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true })
  }

  const doc = new PDFDocument({ margin: 40 })
  const stream = fs.createWriteStream(filePath)

  doc.pipe(stream)

  const total = order.finalPrice || order.price || 0

  /* ================= HEADER ================= */
  doc
    .fontSize(22)
    .text("Signavi Studio", { align: "center" })
    .moveDown(0.5)

  doc
    .fontSize(10)
    .text(`Invoice ID: ${order._id}`)
    .text(`Date: ${new Date().toLocaleDateString()}`)
    .moveDown()

  doc
    .text(`Customer: ${order.customerName || "N/A"}`)
    .text(`Email: ${order.email || "N/A"}`)
    .moveDown()

  /* ================= DIVIDER ================= */
  doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke()
  doc.moveDown()

  /* ================= ITEMS ================= */
  doc.fontSize(14).text("Items")
  doc.moveDown(0.5)

  if (order.items?.length) {
    order.items.forEach((item, i) => {
      doc.fontSize(11).text(
        `${i + 1}. ${item.name || "Item"} | Qty: ${item.quantity || 1} | $${(item.price || 0).toFixed(2)}`
      )
    })
  } else {
    doc.fontSize(11).text("Custom Order")
  }

  doc.moveDown()

  /* ================= TOTAL ================= */
  doc
    .fontSize(16)
    .text(`Total: $${total.toFixed(2)}`, { align: "right" })

  doc.moveDown(2)

  doc
    .fontSize(10)
    .text("Thank you for your business 🙏", { align: "center" })

  doc.end()

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve)
    stream.on("error", reject)
  })

  return filePath
}