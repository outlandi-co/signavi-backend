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

import { generateMaterial } from "../controllers/materialGeneratorController.js"

import upload from "../middleware/upload.js"
import { requireAuth } from "../middleware/auth.js"

const router = express.Router()

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required"
    })
  }

  next()
}

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

router.get("/export", requireAuth, requireAdmin, (req, res, next) => {
  console.log("⬇️ GET /api/materials/export")
  next()
}, exportMaterialsCSV)

router.post(
  "/import",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  (req, res, next) => {
    console.log("⬆️ POST /api/materials/import")
    next()
  },
  importMaterialsCSV
)

/* =========================================================
   MATERIAL GENERATOR
   KEEP THIS ABOVE /:id
========================================================= */

router.post("/generate", requireAuth, requireAdmin, (req, res, next) => {
  console.log("⚡ POST /api/materials/generate")
  next()
}, generateMaterial)

/* =========================================================
   MATERIAL DETAILS
   KEEP THESE BELOW SEARCH / EXPORT / GENERATE ROUTES
========================================================= */

router.get("/:id", (req, res, next) => {
  console.log(`📄 GET MATERIAL: ${req.params.id}`)
  next()
}, getMaterialById)

/* =========================================================
   MATERIAL MANAGEMENT
========================================================= */

router.post("/", requireAuth, requireAdmin, (req, res, next) => {
  console.log("➕ CREATE MATERIAL")
  next()
}, createMaterial)

router.put("/:id", requireAuth, requireAdmin, (req, res, next) => {
  console.log(`✏️ UPDATE MATERIAL: ${req.params.id}`)
  next()
}, updateMaterial)

router.delete("/:id", requireAuth, requireAdmin, (req, res, next) => {
  console.log(`🗑️ DELETE MATERIAL: ${req.params.id}`)
  next()
}, deleteMaterial)

export default router