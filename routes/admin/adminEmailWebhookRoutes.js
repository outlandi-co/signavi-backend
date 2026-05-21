import express from "express"
import multer from "multer"
import { receiveInboundEmail } from "../../controllers/adminEmailWebhookController.js"

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage()
})

router.post(
  "/inbound",
  upload.any(),
  receiveInboundEmail
)

export default router