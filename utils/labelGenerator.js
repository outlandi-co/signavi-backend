import PDFDocument from "pdfkit"
import QRCode from "qrcode"
import fs from "fs"
import path from "path"

/* ================= BULK LABEL GENERATOR ================= */
export const generateBulkLabels = async (orders) => {

  const FRONTEND_URL =
    process.env.FRONTEND_URL || "http://localhost:5173"

  const fileName = `labels-${Date.now()}.pdf`
  const filePath = path.join("labels", fileName)

  /* ================= ENSURE DIR ================= */
  if (!fs.existsSync("labels")) {
    fs.mkdirSync("labels", { recursive: true })
  }

  const doc = new PDFDocument({
    size: [300, 400],
    margin: 20
  })

  const stream = fs.createWriteStream(filePath)
  doc.pipe(stream)

  for (let i = 0; i < orders.length; i++) {

    const order = orders[i]

    if (i !== 0) doc.addPage()

    const trackUrl = `${FRONTEND_URL}/track/${order._id}`

    const qrData = await QRCode.toDataURL(trackUrl)
    const base64 = qrData.replace(/^data:image\/png;base64,/, "")
    const qrBuffer = Buffer.from(base64, "base64")

    doc.fontSize(14).text("Signavi Studio", { align: "center" })
    doc.moveDown()

    doc.fontSize(10)
    doc.text(`Order: ${order._id}`)
    doc.text(`Customer: ${order.customerName || "N/A"}`)
    doc.moveDown()

    doc.image(qrBuffer, {
      fit: [140, 140],
      align: "center"
    })

    doc.moveDown()
    doc.fontSize(8).text("Scan to track", { align: "center" })
  }

  doc.end()

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve)
    stream.on("error", reject)
  })

  return filePath
}