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

/* ================= UPLOAD DIRECTORY ================= */
/*
  Local:
    /your-project/uploads/proofs

  Render persistent disk:
    UPLOAD_DIR=/var/data/uploads
    proof files save to /var/data/uploads/proofs
*/

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
  "🖼️ Proof upload directory:",
  proofUploadDir
)

/* ================= MULTER STORAGE ================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, proofUploadDir)
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)

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
      allowedMimeTypes.includes(file.mimetype)
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

router.patch(
  "/:id/final-proof",
  upload.array("proofs", 10),
  uploadFinalProof
)

router.patch(
  "/:id/approve-proof",
  approveFinalProof
)

router.patch(
  "/:id/mark-paid",
  markInvoicePaid
)

router.patch(
  "/:id/start-production",
  startProduction
)

/* ================= DELETE ================= */

router.delete("/:id", deleteInvoice)

export default router