import PDFDocument from "pdfkit"

export const generatePackingSlip = (orders) => {
  const doc = new PDFDocument()

  const buffers = []

  doc.on("data", buffers.push.bind(buffers))

  return new Promise((resolve) => {

    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers)
      resolve(pdfData)
    })

    orders.forEach((order, index) => {

      doc.fontSize(18).text("Signavi Packing Slip", { align: "center" })
      doc.moveDown()

      doc.fontSize(12)
      doc.text(`Order ID: ${order._id}`)
      doc.text(`Customer: ${order.customerName}`)
      doc.text(`Email: ${order.email || "N/A"}`)
      doc.moveDown()

      doc.text("Items:")
      order.items?.forEach(item => {
        doc.text(`- ${item.name} x${item.quantity}`)
      })

      doc.moveDown()

      if (order.trackingNumber) {
        doc.text(`Tracking: ${order.trackingNumber}`)
      }

      doc.text(`Status: ${order.status}`)
      doc.moveDown()

      if (index < orders.length - 1) {
        doc.addPage()
      }
    })

    doc.end()
  })
}