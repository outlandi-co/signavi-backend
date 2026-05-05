import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

export const generateInvoice = async (order) => {

  /* ================= PATH SETUP ================= */
  const folder = path.resolve("invoices")
  const fileName = `invoice-${order._id}.pdf`
  const filePath = path.join(folder, fileName)

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true })
  }

  /* ================= CREATE DOC ================= */
  const doc = new PDFDocument({ margin: 50 })
  const stream = fs.createWriteStream(filePath)

  doc.pipe(stream)

  /* ================= SAFE VALUES ================= */
  const items = order.items || []
  const subtotal = items.reduce(
    (sum, i) => sum + (Number(i.price || 0) * Number(i.quantity || 1)),
    0
  )

  const tax = Number(order.tax || subtotal * 0.0825)
  const total = Number(order.finalPrice || subtotal + tax)

  /* ================= HEADER ================= */
  doc
    .fontSize(24)
    .text("SignaVi Studio", { align: "center" })
    .moveDown(0.5)

  doc
    .fontSize(10)
    .text(`Invoice #: ${order._id}`)
    .text(`Date: ${new Date().toLocaleDateString()}`)
    .moveDown()

  /* ================= CUSTOMER ================= */
  doc
    .fontSize(12)
    .text(`Customer: ${order.customerName || "N/A"}`)
    .text(`Email: ${order.email || "N/A"}`)
    .moveDown()

  /* ================= DIVIDER ================= */
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
  doc.moveDown()

  /* ================= ITEMS HEADER ================= */
  doc.fontSize(14).text("Items", { underline: true })
  doc.moveDown(0.5)

  /* ================= ITEMS ================= */
  if (items.length) {
    items.forEach((item, i) => {
      const qty = Number(item.quantity || 1)
      const price = Number(item.price || 0)
      const lineTotal = qty * price

      doc
        .fontSize(11)
        .text(
          `${i + 1}. ${item.name || "Item"}`
        )
        .text(
          `   Qty: ${qty} × $${price.toFixed(2)} = $${lineTotal.toFixed(2)}`
        )
        .moveDown(0.5)
    })
  } else {
    doc.fontSize(11).text("Custom Order").moveDown()
  }

  doc.moveDown()

  /* ================= TOTALS ================= */
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
  doc.moveDown()

  doc
    .fontSize(12)
    .text(`Subtotal: $${subtotal.toFixed(2)}`, { align: "right" })
    .text(`Tax: $${tax.toFixed(2)}`, { align: "right" })
    .moveDown(0.5)

  doc
    .fontSize(16)
    .text(`Total: $${total.toFixed(2)}`, {
      align: "right",
      underline: true
    })

  doc.moveDown(2)

  /* ================= FOOTER ================= */
  doc
    .fontSize(10)
    .text("Thank you for your business 🙏", { align: "center" })

  doc.end()

  /* ================= WAIT FOR FILE ================= */
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve)
    stream.on("error", reject)
  })

  return filePath
}