import PDFDocument from "pdfkit"
import QRCode from "qrcode"
import fs from "fs"
import path from "path"

export const generatePackingSlip = async (order) => {

  const FRONTEND_URL =
  process.env.CLIENT_URL || "https://signavistudio.store"

  const fileName = `packing-slip-${order._id}.pdf`
  const filePath = path.join("labels", fileName)

  if (!fs.existsSync("labels")) {
    fs.mkdirSync("labels", { recursive: true })
  }

  const doc = new PDFDocument({ margin: 40 })
  const stream = fs.createWriteStream(filePath)

  doc.pipe(stream)

  /* ================= HEADER ================= */
  doc.fontSize(18).text("Signavi Studio", { align: "center" })
  doc.moveDown()

  doc.fontSize(12)
  doc.text(`Order ID: ${order._id}`)
  doc.text(`Customer: ${order.customerName || "N/A"}`)
  doc.text(`Email: ${order.email || "N/A"}`)
  doc.moveDown()

  /* ================= ITEMS ================= */
  doc.fontSize(14).text("Items:")
  doc.moveDown(0.5)

  if (order.items?.length) {
    order.items.forEach((item, i) => {
      doc.text(
        `${i + 1}. ${item.name} | Qty: ${item.quantity} | $${item.price}`
      )
    })
  } else {
    doc.text("Custom Order")
  }

  doc.moveDown()

  /* ================= QR ================= */
  const trackingUrl = `${FRONTEND_URL}/track/${order._id}`

  const qr = await QRCode.toDataURL(trackingUrl)
  const base64 = qr.replace(/^data:image\/png;base64,/, "")
  const qrBuffer = Buffer.from(base64, "base64")

  doc.image(qrBuffer, {
    fit: [120, 120],
    align: "center"
  })

  doc.moveDown()
  doc.fontSize(10).text("Scan to track order", { align: "center" })

  doc.end()

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve)
    stream.on("error", reject)
  })

  return filePath
}