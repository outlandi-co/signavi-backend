import Invoice from "../models/Invoice.js"

/* ================= CREATE INVOICE ================= */

export const createInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.create(req.body)

    res.status(201).json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("CREATE INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to create invoice"
    })
  }
}

/* ================= GET ALL INVOICES ================= */

export const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 })

    res.json({
      success: true,
      data: invoices
    })
  } catch (error) {
    console.error("GET INVOICES ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to get invoices"
    })
  }
}

/* ================= GET SINGLE INVOICE ================= */

export const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("GET INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to get invoice"
    })
  }
}

/* ================= UPDATE INVOICE ================= */

export const updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("UPDATE INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to update invoice"
    })
  }
}

/* ================= DELETE INVOICE ================= */

export const deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndDelete(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    res.json({
      success: true,
      message: "Invoice deleted successfully"
    })
  } catch (error) {
    console.error("DELETE INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to delete invoice"
    })
  }
}

/* ================= UPLOAD FINAL PROOF ================= */

export const uploadFinalProof = async (req, res) => {
  try {
    const { imageUrl, fileName } = req.body

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      {
        status: "proof_uploaded",
        finalProof: {
          imageUrl,
          fileName,
          approved: false,
          approvedAt: null,
          approvalName: "",
          approvalEmail: ""
        }
      },
      { new: true, runValidators: true }
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("UPLOAD FINAL PROOF ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to upload final proof"
    })
  }
}

/* ================= APPROVE FINAL PROOF ================= */

export const approveFinalProof = async (req, res) => {
  try {
    const { approvalName, approvalEmail } = req.body

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      {
        status: "proof_approved",
        "finalProof.approved": true,
        "finalProof.approvedAt": new Date(),
        "finalProof.approvalName": approvalName,
        "finalProof.approvalEmail": approvalEmail
      },
      { new: true, runValidators: true }
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("APPROVE FINAL PROOF ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to approve proof"
    })
  }
}

/* ================= MARK PAID ================= */

export const markInvoicePaid = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    invoice.paymentStatus = "paid"
    invoice.status = "ready_for_production"
    invoice.paidAt = new Date()

    await invoice.save()

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("MARK INVOICE PAID ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to mark invoice paid"
    })
  }
}

/* ================= START PRODUCTION MANUALLY ================= */

export const startProduction = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    if (invoice.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Invoice must be paid before production starts"
      })
    }

    if (!invoice.finalProof?.approved) {
      return res.status(400).json({
        success: false,
        message: "Final proof must be approved before production starts"
      })
    }

    invoice.status = "production"

    await invoice.save()

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("START PRODUCTION ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to start production"
    })
  }
}