import { Readable } from "stream"
import csvParser from "csv-parser"

import Material from "../models/Material.js"

const csvEscape = (value) => {
  if (value === null || value === undefined) return ""

  const stringValue = String(value).replace(/"/g, '""')
  return `"${stringValue}"`
}

const sendCSV = (res, filename, rows) => {
  const csv = rows
    .map((row) => row.map(csvEscape).join(","))
    .join("\n")

  res.setHeader("Content-Type", "text/csv")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  )

  res.send(csv)
}

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback

  const number = Number(value)

  return Number.isNaN(number) ? fallback : number
}

const splitInstructions = (value) => {
  if (!value) return []

  return String(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
}

const parseCSVBuffer = (buffer) => {
  return new Promise((resolve, reject) => {
    const rows = []

    Readable.from(buffer)
      .pipe(csvParser())
      .on("data", (row) => {
        rows.push(row)
      })
      .on("end", () => {
        resolve(rows)
      })
      .on("error", reject)
  })
}

const buildMaterialFromRow = (row) => {
  return {
    id: row.id,
    brand: row.brand || "",
    productName: row.productName || "",
    fullName: row.fullName || row.productName || "",

    category: row.category || "",
    materialType: row.materialType || "",
    unit: row.unit || "yard",
    skuPrefix: row.skuPrefix || "",

    price: toNumber(row.price),
    regularPrice: toNumber(row.regularPrice),
    currency: row.currency || "USD",

    dimensions: {
      listedWidth: row.listedWidth || "",
      actualWidth: row.actualWidth || "",
      lengthPerUnit: row.lengthPerUnit || "",
      thickness: row.thickness || ""
    },

    specs: {
      composition: row.composition || "",
      backing: row.backing || "",
      finish: row.finish || "",
      blade: row.blade || "",
      certification: row.certification || ""
    },

    source: {
      supplierId: row.supplierId || "",
      vendor: row.vendor || "",
      url: row.sourceUrl || "",
      lastChecked: row.lastChecked || new Date().toISOString().slice(0, 10)
    },

    careInstructions: splitInstructions(row.careInstructions),

    applicationInstructions: splitInstructions(row.applicationInstructions),

    priceWatch: {
      enabled: true,
      currentPrice: toNumber(row.price),
      previousPrice: toNumber(row.regularPrice || row.price),
      alertOnChange: true,
      lastChecked: null
    },

    inventory: {
      trackInventory: true,
      quantityOnHand: 0,
      reorderPoint: 5
    },

    colors: [],

    active: true
  }
}

const buildColorFromRow = (row) => {
  if (!row.colorSku && !row.colorName && !row.hex) return null

  return {
    sku: row.colorSku || "",
    name: row.colorName || "",
    hex: row.hex || "#000000",
    stock: toNumber(row.stock)
  }
}

export const getMaterials = async (req, res) => {
  try {
    const materials = await Material.find().sort({ brand: 1, productName: 1 })
    res.json(materials)
  } catch (error) {
    console.error("GET MATERIALS ERROR:", error)
    res.status(500).json({ message: "Failed to fetch materials" })
  }
}

export const getMaterialById = async (req, res) => {
  try {
    const material = await Material.findOne({ id: req.params.id })

    if (!material) {
      return res.status(404).json({ message: "Material not found" })
    }

    res.json(material)
  } catch (error) {
    console.error("GET MATERIAL ERROR:", error)
    res.status(500).json({ message: "Failed to fetch material" })
  }
}

export const searchMaterials = async (req, res) => {
  try {
    const q = req.query.q || ""

    const materials = await Material.find({
      $or: [
        { brand: { $regex: q, $options: "i" } },
        { productName: { $regex: q, $options: "i" } },
        { fullName: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
        { skuPrefix: { $regex: q, $options: "i" } },
        { "colors.name": { $regex: q, $options: "i" } },
        { "colors.sku": { $regex: q, $options: "i" } },
        { "source.vendor": { $regex: q, $options: "i" } }
      ]
    }).sort({ brand: 1, productName: 1 })

    res.json(materials)
  } catch (error) {
    console.error("SEARCH MATERIALS ERROR:", error)
    res.status(500).json({ message: "Failed to search materials" })
  }
}

export const createMaterial = async (req, res) => {
  try {
    const material = await Material.create(req.body)
    res.status(201).json(material)
  } catch (error) {
    console.error("CREATE MATERIAL ERROR:", error)
    res.status(400).json({ message: "Failed to create material" })
  }
}

export const updateMaterial = async (req, res) => {
  try {
    const material = await Material.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { new: true, runValidators: true }
    )

    if (!material) {
      return res.status(404).json({ message: "Material not found" })
    }

    res.json(material)
  } catch (error) {
    console.error("UPDATE MATERIAL ERROR:", error)
    res.status(400).json({ message: "Failed to update material" })
  }
}

export const deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findOneAndDelete({ id: req.params.id })

    if (!material) {
      return res.status(404).json({ message: "Material not found" })
    }

    res.json({ message: "Material deleted successfully" })
  } catch (error) {
    console.error("DELETE MATERIAL ERROR:", error)
    res.status(500).json({ message: "Failed to delete material" })
  }
}

export const exportMaterialsCSV = async (req, res) => {
  try {
    const materials = await Material.find().sort({ brand: 1, productName: 1 })

    const rows = [
      [
        "id",
        "brand",
        "productName",
        "fullName",
        "category",
        "materialType",
        "unit",
        "skuPrefix",
        "price",
        "regularPrice",
        "currency",
        "listedWidth",
        "actualWidth",
        "lengthPerUnit",
        "thickness",
        "composition",
        "backing",
        "finish",
        "blade",
        "certification",
        "supplierId",
        "vendor",
        "sourceUrl",
        "lastChecked",
        "colorSku",
        "colorName",
        "hex",
        "stock",
        "careInstructions",
        "applicationInstructions"
      ]
    ]

    materials.forEach((material) => {
      const colors = material.colors?.length
        ? material.colors
        : [{ sku: "", name: "", hex: "", stock: "" }]

      colors.forEach((color) => {
        rows.push([
          material.id,
          material.brand,
          material.productName,
          material.fullName,
          material.category,
          material.materialType,
          material.unit,
          material.skuPrefix,
          material.price,
          material.regularPrice,
          material.currency,
          material.dimensions?.listedWidth || "",
          material.dimensions?.actualWidth || "",
          material.dimensions?.lengthPerUnit || "",
          material.dimensions?.thickness || "",
          material.specs?.composition || "",
          material.specs?.backing || "",
          material.specs?.finish || "",
          material.specs?.blade || "",
          material.specs?.certification || "",
          material.source?.supplierId || "",
          material.source?.vendor || "",
          material.source?.url || "",
          material.source?.lastChecked || "",
          color.sku || "",
          color.name || "",
          color.hex || "",
          color.stock ?? "",
          (material.careInstructions || []).join(" | "),
          (material.applicationInstructions || []).join(" | ")
        ])
      })
    })

    sendCSV(res, "signavi-material-catalog.csv", rows)
  } catch (error) {
    console.error("EXPORT MATERIALS CSV ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to export materials CSV"
    })
  }
}

export const importMaterialsCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "CSV file is required"
      })
    }

    const rows = await parseCSVBuffer(req.file.buffer)

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "CSV file is empty"
      })
    }

    const groupedMaterials = new Map()

    rows.forEach((row) => {
      if (!row.id) return

      if (!groupedMaterials.has(row.id)) {
        groupedMaterials.set(row.id, buildMaterialFromRow(row))
      }

      const material = groupedMaterials.get(row.id)
      const color = buildColorFromRow(row)

      if (color) {
        const exists = material.colors.some(
          (item) => item.sku === color.sku
        )

        if (!exists) {
          material.colors.push(color)
        }
      }
    })

    let created = 0
    let updated = 0

    for (const material of groupedMaterials.values()) {
      const existing = await Material.findOne({ id: material.id })

      if (existing) {
        await Material.findOneAndUpdate(
          { id: material.id },
          material,
          { new: true, runValidators: true }
        )

        updated += 1
      } else {
        await Material.create(material)
        created += 1
      }
    }

    res.json({
      success: true,
      message: "Materials CSV imported successfully",
      rowsProcessed: rows.length,
      materialsProcessed: groupedMaterials.size,
      created,
      updated
    })
  } catch (error) {
    console.error("IMPORT MATERIALS CSV ERROR:", error)

    res.status(500).json({
      success: false,
      message: "Failed to import materials CSV",
      error: error.message
    })
  }
}