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

/* =========================================================
   MATERIAL CATALOG ROUTES
========================================================= */

router.get("/", (req, res, next) => {
  console.log("📦 GET /api/materials")
  next()
}, getMaterials)

router.get("/search", (req, res, next) => {
  console.log("🔍 GET /api/materials/search")
  next()
}, searchMaterials)

router.get("/export", (req, res, next) => {
  console.log("⬇️ GET /api/materials/export")
  next()
}, exportMaterialsCSV)

router.post(
  "/import",
  upload.single("file"),
  (req, res, next) => {
    console.log("⬆️ POST /api/materials/import")
    next()
  },
  importMaterialsCSV
)

/* =========================================================
   MATERIAL DETAILS
   KEEP THESE BELOW SEARCH / EXPORT ROUTES
========================================================= */

router.get("/:id", (req, res, next) => {
  console.log(`📄 GET MATERIAL: ${req.params.id}`)
  next()
}, getMaterialById)

/* =========================================================
   MATERIAL MANAGEMENT
========================================================= */

router.post("/", (req, res, next) => {
  console.log("➕ CREATE MATERIAL")
  next()
}, createMaterial)

router.put("/:id", (req, res, next) => {
  console.log(`✏️ UPDATE MATERIAL: ${req.params.id}`)
  next()
}, updateMaterial)

router.delete("/:id", (req, res, next) => {
  console.log(`🗑️ DELETE MATERIAL: ${req.params.id}`)
  next()
}, deleteMaterial)

export default router