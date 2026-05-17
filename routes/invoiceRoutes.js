import express from "express"

import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  sendInvoiceEmail,
  createInvoicePaymentLink,
  updateInvoice,
  deleteInvoice,
  uploadFinalProof,
  approveFinalProof,
  markInvoicePaid,
  startProduction
} from "../controllers/invoiceController.js"

const router = express.Router()

/* ================= CREATE ================= */

router.post("/", createInvoice)

/* ================= READ ================= */

router.get("/", getInvoices)

router.get("/:id", getInvoiceById)

/* ================= PAYMENT ================= */

router.post(
  "/:id/create-payment-link",
  createInvoicePaymentLink
)

/* ================= EMAIL ================= */

router.post("/:id/send", sendInvoiceEmail)

/* ================= UPDATE ================= */

router.patch("/:id", updateInvoice)

router.patch("/:id/final-proof", uploadFinalProof)

router.patch("/:id/approve-proof", approveFinalProof)

router.patch("/:id/mark-paid", markInvoicePaid)

router.patch("/:id/start-production", startProduction)

/* ================= DELETE ================= */

router.delete("/:id", deleteInvoice)

export default router