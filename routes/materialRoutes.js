import express from "express"

import {
  getMaterials,
  getMaterialById,
  searchMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  exportMaterialsCSV,
  importMaterialsCSV
} from "../controllers/materialController.js"

import upload from "../middleware/upload.js"

const router = express.Router()

/* ================= MATERIAL CATALOG ================= */

router.get("/", getMaterials)

router.get("/search", searchMaterials)

router.get("/export", exportMaterialsCSV)

router.post(
  "/import",
  upload.single("file"),
  importMaterialsCSV
)

/* ================= MATERIAL DETAILS ================= */

router.get("/:id", getMaterialById)

/* ================= MATERIAL MANAGEMENT ================= */

router.post("/", createMaterial)

router.put("/:id", updateMaterial)

router.delete("/:id", deleteMaterial)

export default router