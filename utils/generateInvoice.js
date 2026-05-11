import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

export const generateInvoice = async (order) => {
  const folder = path.resolve("invoices")
  const fileName = `invoice-${order._id}.pdf`
  const filePath = path.join(folder, fileName)

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true })
  }

  const doc = new PDFDocument({ margin: 50 })
  const stream = fs.createWriteStream(filePath)

  doc.pipe(stream)

  const items = order.items || []

  const subtotal = Number(
    order.subtotal ||
      items.reduce(
        (sum, item) =>
          sum + Number(item.price || 0) * Number(item.quantity || 1),
        0
      )
  )

  const tax = Number(order.tax || subtotal * 0.0825)
  const total = Number(order.finalPrice || subtotal + tax)

  doc.fontSize(24).text("SignaVi Studio", { align: "center" })
  doc.fontSize(10).text("From Ideation to Creation", { align: "center" })
  doc.moveDown()

  doc.fontSize(12)
  doc.text(`Invoice #: ${order._id}`)
  doc.text(`Date: ${new Date().toLocaleDateString()}`)
  doc.text(`Status: ${order.status || "N/A"}`)
  doc.moveDown()

  doc.text(`Customer: ${order.customerName || "Customer"}`)
  doc.text(`Email: ${order.email || "N/A"}`)
  doc.moveDown()

  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
  doc.moveDown()

  doc.fontSize(14).text("Items", { underline: true })
  doc.moveDown(0.5)

  if (items.length) {
    items.forEach((item, index) => {
      const qty = Number(item.quantity || 1)
      const price = Number(item.price || 0)
      const lineTotal = qty * price

      doc.fontSize(11)
      doc.text(`${index + 1}. ${item.name || "Item"}`)
      doc.text(`   Qty: ${qty} × $${price.toFixed(2)} = $${lineTotal.toFixed(2)}`)

      if (item.variant?.color || item.variant?.size) {
        doc.text(
          `   Variant: ${item.variant?.color || "N/A"} / ${item.variant?.size || "N/A"}`
        )
      }

      doc.moveDown(0.5)
    })
  } else {
    doc.fontSize(11).text("Custom Order")
    doc.moveDown()
  }

  doc.moveDown()
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
  doc.moveDown()

  doc.fontSize(12)
  doc.text(`Subtotal: $${subtotal.toFixed(2)}`, { align: "right" })
  doc.text(`Tax: $${tax.toFixed(2)}`, { align: "right" })
  doc.moveDown(0.5)

  doc.fontSize(16)
  doc.text(`Total: $${total.toFixed(2)}`, {
    align: "right",
    underline: true
  })

  doc.moveDown(2)
  doc.fontSize(10).text("Thank you for your business!", { align: "center" })

  doc.end()

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve)
    stream.on("error", reject)
  })

  return filePath
}