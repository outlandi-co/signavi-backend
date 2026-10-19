import PDFDocument from "pdfkit"

const money = (value) => {
  const amount = Number(value ?? 0)

  return Number.isFinite(amount)
    ? amount.toFixed(2)
    : "0.00"
}

const clean = (value) =>
  String(value ?? "").replace(/\s+/g, " ").trim()

export const generateCustomInvoicePdf = (invoice) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 50
    })

    const chunks = []

    doc.on("data", (chunk) => chunks.push(chunk))
    doc.once("error", reject)
    doc.once("end", () => {
      resolve(Buffer.concat(chunks))
    })

    try {
      // ===============================================
      // BRAND HEADER
      // ===============================================

      doc.rect(0, 0, 612, 100)
        .fill("#071427")

      doc.fillColor("#35D5E8")
        .font("Helvetica-Bold")
        .fontSize(24)
        .text("SIGNAVI STUDIO", 50, 30)

      doc.fillColor("#FFFFFF")
        .font("Helvetica")
        .fontSize(11)
        .text("CUSTOM INVOICE", 50, 65)

      doc.fillColor("#111827")
      doc.y = 125

      // ===============================================
      // INVOICE INFORMATION
      // ===============================================

      doc.font("Helvetica-Bold")
        .fontSize(16)
        .text(
          "Invoice " +
          clean(invoice.invoiceNumber || invoice._id)
        )

      const date = invoice.createdAt
        ? new Date(invoice.createdAt).toLocaleDateString("en-US")
        : "N/A"

      doc.font("Helvetica")
        .fontSize(10)
        .moveDown(0.5)
        .text("Date: " + date)
        .text("Customer: " + clean(invoice.customerName))
        .text("Email: " + clean(invoice.customerEmail))
        .text(
          "Payment status: " +
          clean(invoice.paymentStatus || "unpaid").toUpperCase()
        )
        .text(
          "Final proof: " +
          (invoice.finalProof?.approved
            ? "Approved"
            : "Pending approval")
        )

      doc.moveDown(1.5)

      // ===============================================
      // ITEMIZED PRODUCTS
      // ===============================================

      doc.font("Helvetica-Bold")
        .fontSize(13)
        .text("ITEMIZED PRODUCTS")

      doc.moveDown(0.5)

      const items = Array.isArray(invoice.items)
        ? invoice.items
        : []

      if (!items.length) {
        doc.font("Helvetica")
          .fontSize(10)
          .text("No itemized products.")
      }

      for (const item of items) {
        const quantity = Number(item.quantity || 0)
        const price = Number(item.price || 0)
        const lineTotal = quantity * price

        doc.font("Helvetica-Bold")
          .fontSize(11)
          .text(clean(item.name) || "Custom item")

        doc.font("Helvetica")
          .fontSize(10)
          .text(
            "Qty: " + quantity +
            "    Unit price: $" + money(price) +
            "    Amount: $" + money(lineTotal)
          )

        doc.moveDown(0.75)
      }

      // ===============================================
      // TOTALS
      // ===============================================

      doc.moveDown()

      doc.moveTo(50, doc.y)
        .lineTo(562, doc.y)
        .strokeColor("#CBD5E1")
        .stroke()

      doc.moveDown()

      doc.font("Helvetica")
        .fontSize(11)
        .text(
          "Subtotal: $" + money(invoice.subtotal),
          { align: "right" }
        )
        .text(
          "Tax: $" + money(invoice.tax),
          { align: "right" }
        )
        .text(
          "Shipping: $" + money(invoice.shipping),
          { align: "right" }
        )

      doc.moveDown(0.5)

      doc.font("Helvetica-Bold")
        .fontSize(16)
        .text(
          "TOTAL: $" + money(invoice.total),
          { align: "right" }
        )

      // ===============================================
      // NOTES
      // ===============================================

      if (clean(invoice.notes)) {
        doc.moveDown(1.5)

        doc.font("Helvetica-Bold")
          .fontSize(11)
          .text("NOTES")

        doc.font("Helvetica")
          .fontSize(10)
          .text(clean(invoice.notes))
      }

      // ===============================================
      // FOOTER
      // ===============================================

      doc.moveDown(2)

      doc.font("Helvetica")
        .fontSize(9)
        .fillColor("#64748B")
        .text(
          "Thank you for your business.",
          { align: "center" }
        )

      doc.end()
    } catch (error) {
      reject(error)
    }
  })