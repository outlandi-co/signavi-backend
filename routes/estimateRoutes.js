import express from "express"

import {
  createEstimate,
  getEstimates,
  getEstimateById,
  deleteEstimate
} from "../controllers/estimateController.js"

const router = express.Router()

router.get("/", getEstimates)
router.get("/:id", getEstimateById)
router.post("/", createEstimate)
router.delete("/:id", deleteEstimate)

export default router