import express from "express"

import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  sendInvoiceEmail
} from "../controllers/invoiceController.js"

const router = express.Router()

/* ================= CREATE ================= */

router.post("/", createInvoice)

/* ================= READ ================= */

router.get("/", getInvoices)

router.get("/:id", getInvoiceById)

/* ================= EMAIL ================= */

router.post("/:id/send", sendInvoiceEmail)

export default router