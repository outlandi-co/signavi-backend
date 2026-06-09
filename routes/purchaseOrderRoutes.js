import express from "express"

import {
  getPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  receivePurchaseOrder
} from "../controllers/purchaseOrderController.js"

const router = express.Router()

router.get("/", getPurchaseOrders)

router.get("/:id", getPurchaseOrder)

router.post("/", createPurchaseOrder)

router.put("/:id", updatePurchaseOrder)

router.delete("/:id", deletePurchaseOrder)

router.put(
  "/:id/receive",
  receivePurchaseOrder
)

export default router