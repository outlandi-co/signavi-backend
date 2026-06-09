import express from "express"

import {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier
} from "../controllers/supplierController.js"

const router = express.Router()

router.get("/", getSuppliers)

router.get("/:id", getSupplier)

router.post("/", createSupplier)

router.put("/:id", updateSupplier)

router.delete("/:id", deleteSupplier)

export default router