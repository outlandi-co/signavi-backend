import express from "express"

import {
  getMaterials,
  getMaterialById,
  searchMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial
} from "../controllers/materialController.js"

const router = express.Router()

router.get("/", getMaterials)
router.get("/search", searchMaterials)
router.get("/:id", getMaterialById)

router.post("/", createMaterial)
router.put("/:id", updateMaterial)
router.delete("/:id", deleteMaterial)

export default router