
import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"

import { requireAuth } from "../middleware/auth.js"

import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  getCustomerProofInvoice,
  sendInvoiceEmail,
  createInvoicePaymentLink,
  updateInvoice,
  deleteInvoice,
  uploadFinalProof,
  approveFinalProof,
  markInvoicePaid,
  startProduction,
  markInvoiceShipped,
  markInvoiceDelivered
} from "../controllers/invoiceController.js"

const router = express.Router()

// =====================================================
// ADMINISTRATOR AUTHORIZATION
// =====================================================

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required."
    })
  }

  next()
}

// =====================================================
// PROOF UPLOAD DIRECTORY
// =====================================================

const uploadBaseDir =
  process.env.UPLOAD_DIR ||
  path.join(process.cwd(), "uploads")

const proofUploadDir = path.join(
  uploadBaseDir,
  "proofs"
)

if (!fs.existsSync(proofUploadDir)) {
  fs.mkdirSync(proofUploadDir, {
    recursive: true
  })
}

console.log(
  "Proof upload directory:",
  proofUploadDir
)

// =====================================================
// PROOF FILE STORAGE
// =====================================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, proofUploadDir)
  },

  filename: (req, file, cb) => {
    const ext = path.extname(
      file.originalname
    )

    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()

    const uniqueName =
      `${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}-${baseName}${ext.toLowerCase()}`

    cb(null, uniqueName)
  }
})

// =====================================================
// PROOF UPLOAD VALIDATION
// =====================================================

const upload = multer({
  storage,

  limits: {
    files: 10,
    fileSize: 15 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf"
    ]

    if (
      allowedMimeTypes.includes(
        file.mimetype
      )
    ) {
      cb(null, true)
      return
    }

    cb(
      new Error(
        "Only image files and PDFs are allowed for final proofs."
      )
    )
  }
})

// =====================================================
// ADMIN — CREATE AND VIEW INVOICES
// =====================================================

router.post(
  "/",
  requireAuth,
  requireAdmin,
  createInvoice
)

router.get(
  "/",
  requireAuth,
  requireAdmin,
  getInvoices
)

// =====================================================
// CUSTOMER — SECURE PROOF ACCESS
// =====================================================

// The customer must provide their private approval token
// using the x-signavi-invoice-approval-token header.
//
// The controller validates the token, expiration,
// and the current proof fingerprint.

router.get(
  "/:id/proof-access",
  getCustomerProofInvoice
)

// =====================================================
// ADMIN — VIEW INDIVIDUAL INVOICE
// =====================================================

// The unrestricted GET /:id endpoint is now protected.

router.get(
  "/:id",
  requireAuth,
  requireAdmin,
  getInvoiceById
)

// =====================================================
// ADMIN — CREATE SQUARE PAYMENT LINK
// =====================================================

router.post(
  "/:id/create-payment-link",
  requireAuth,
  requireAdmin,
  createInvoicePaymentLink
)

// =====================================================
// ADMIN — SEND INVOICE / PROOF EMAIL
// =====================================================

router.post(
  "/:id/send",
  requireAuth,
  requireAdmin,
  sendInvoiceEmail
)

// =====================================================
// ADMIN — UPDATE INVOICE
// =====================================================

router.patch(
  "/:id",
  requireAuth,
  requireAdmin,
  updateInvoice
)

// =====================================================
// ADMIN — UPLOAD FINAL PROOF
// =====================================================

router.patch(
  "/:id/final-proof",
  requireAuth,
  requireAdmin,
  upload.array("proofs", 10),
  uploadFinalProof
)

// =====================================================
// CUSTOMER — APPROVE FINAL PROOF
// =====================================================

// No administrator login is required for customers.
//
// However, approveFinalProof must validate:
// - Private approval token
// - Token expiration
// - Current proof version
// - Explicit agreement acceptance
// - Typed approval name

router.patch(
  "/:id/approve-proof",
  approveFinalProof
)

// =====================================================
// ADMIN — MARK INVOICE PAID
// =====================================================

router.patch(
  "/:id/mark-paid",
  requireAuth,
  requireAdmin,
  markInvoicePaid
)

// =====================================================
// ADMIN — START PRODUCTION
// =====================================================

// The controller must check both:
// - Payment status
// - Current final-proof approval

router.patch(
  "/:id/start-production",
  requireAuth,
  requireAdmin,
  startProduction
)

// =====================================================
// ADMIN — SHIPPING
// =====================================================

router.patch(
  "/:id/ship",
  requireAuth,
  requireAdmin,
  markInvoiceShipped
)

// =====================================================
// ADMIN — DELIVERY
// =====================================================

router.patch(
  "/:id/deliver",
  requireAuth,
  requireAdmin,
  markInvoiceDelivered
)

// =====================================================
// ADMIN — DELETE INVOICE
// =====================================================

router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  deleteInvoice
)


// =====================================================
// ADMIN - DOWNLOAD CUSTOM INVOICE PDF
// =====================================================

router.get(
  "/:id/download",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      if (!/^[a-f0-9]{24}$/i.test(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid invoice ID."
        })
      }

      const [
        { default: Invoice },
        { generateCustomInvoicePdf }
      ] = await Promise.all([
        import("../models/Invoice.js"),
        import("../utils/generateCustomInvoicePdf.js")
      ])

      const invoice = await Invoice.findById(
        req.params.id
      ).select(
        "invoiceNumber createdAt customerName " +
        "customerEmail items subtotal tax shipping " +
        "total notes paymentStatus finalProof.approved"
      )

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: "Invoice not found."
        })
      }

      const pdf = await generateCustomInvoicePdf(invoice)

      const filename = String(
        invoice.invoiceNumber || invoice._id
      )
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .slice(0, 80)

      res.setHeader(
        "Content-Type",
        "application/pdf"
      )

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="signavi-invoice-' +
          filename + '.pdf"'
      )

      res.setHeader(
        "Cache-Control",
        "private, no-store"
      )

      return res.status(200).send(pdf)
    } catch (error) {
      console.error(
        "CUSTOM INVOICE PDF ERROR:",
        error
      )

      return res.status(500).json({
        success: false,
        message: "Failed to generate invoice PDF."
      })
    }
  }
)

export default router
