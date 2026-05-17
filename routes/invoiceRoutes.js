import express from "express"

import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  approveFinalProof,
  startProduction,
  markInvoicePaid,
  uploadFinalProof
} from "../controllers/invoiceController.js"

const router = express.Router()

/* ================= CREATE ================= */

router.post("/", createInvoice)

/* ================= READ ================= */

router.get("/", getInvoices)

router.get("/:id", getInvoiceById)

/* ================= UPDATE ================= */

router.patch("/:id", updateInvoice)

router.patch("/:id/final-proof", uploadFinalProof)

router.patch("/:id/approve-proof", approveFinalProof)

router.patch("/:id/mark-paid", markInvoicePaid)

router.patch("/:id/start-production", startProduction)

/* ================= DELETE ================= */

router.delete("/:id", deleteInvoice)

export default router