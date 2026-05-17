import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"

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

const proofUploadDir = path.join(process.cwd(), "uploads", "proofs")

if (!fs.existsSync(proofUploadDir)) {
  fs.mkdirSync(proofUploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, proofUploadDir)
  },

  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-")
    cb(null, `${Date.now()}-${safeName}`)
  }
})

const upload = multer({
  storage,
  limits: {
    files: 10,
    fileSize: 15 * 1024 * 1024
  }
})

router.post("/", createInvoice)

router.get("/", getInvoices)

router.get("/:id", getInvoiceById)

router.post("/:id/create-payment-link", createInvoicePaymentLink)

router.post("/:id/send", sendInvoiceEmail)

router.patch("/:id", updateInvoice)

router.patch(
  "/:id/final-proof",
  upload.array("proofs", 10),
  uploadFinalProof
)

router.patch("/:id/approve-proof", approveFinalProof)

router.patch("/:id/mark-paid", markInvoicePaid)

router.patch("/:id/start-production", startProduction)

router.delete("/:id", deleteInvoice)

export default router