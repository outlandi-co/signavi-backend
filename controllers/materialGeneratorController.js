import Material from "../models/Material.js"

const slugify = (value = "") =>
  value
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const makeSkuCode = (colorName = "") => {
  const words = colorName
    .replace(/glitter/gi, "")
    .replace(/fluorescent/gi, "fl")
    .trim()
    .split(/\s+/)

  const code = words
    .map((word) => word.slice(0, 3).toUpperCase())
    .join("")
    .slice(0, 8)

  return code || "COLOR"
}

const guessHex = (name = "") => {
  const color = name.toLowerCase()

  if (color.includes("white")) return "#FFFFFF"
  if (color.includes("black")) return "#000000"
  if (color.includes("royal")) return "#0047AB"
  if (color.includes("navy")) return "#002D72"
  if (color.includes("burgundy")) return "#800020"
  if (color.includes("yellow")) return "#FFD100"
  if (color.includes("green")) return "#009639"
  if (color.includes("orange")) return "#FF6A13"
  if (color.includes("pink")) return "#FF69B4"
  if (color.includes("purple")) return "#7F3F98"
  if (color.includes("gold")) return "#D4AF37"
  if (color.includes("silver")) return "#C0C0C0"
  if (color.includes("brown")) return "#6F4E37"
  if (color.includes("aqua")) return "#00B5E2"
  if (color.includes("mint")) return "#98FF98"
  if (color.includes("coral")) return "#FF7F50"
  if (color.includes("lavender")) return "#B497D6"
  if (color.includes("lime")) return "#A4D65E"
  if (color.includes("red")) return "#C8102E"
  if (color.includes("blue")) return "#0057B8"

  return "#999999"
}

const defaultAdheresTo = [
  "100% Cotton",
  "Poly/Cotton Blends",
  "100% Uncoated Polyester",
  "Leather"
]

const defaultApplicationInstructions = [
  "Cut in reverse",
  "Weed excess material",
  "Preheat garment for 2-3 seconds",
  "Apply design at 305°F / 150°C",
  "Use medium pressure for 10-15 seconds",
  "Peel carrier hot or cold"
]

const glitterApplicationInstructions = [
  "Cut in reverse",
  "Weed excess material",
  "Preheat garment for 2-3 seconds",
  "Apply design at 320°F / 160°C",
  "Use firm pressure for 15-20 seconds",
  "Peel carrier warm"
]

const defaultCareInstructions = [
  "Wait 24 hours before first wash",
  "Machine wash warm with mild detergent",
  "Do not dry clean",
  "Hang item to dry",
  "Do not bleach",
  "Dry at normal setting"
]

const glitterCareInstructions = [
  "Wait 24 hours before first wash",
  "Machine wash warm or cold with mild detergent",
  "Do not dry clean",
  "Hang item to dry",
  "Do not bleach",
  "Dry at normal setting"
]

const defaultAccessories = [
  "Siser Hook Tool",
  "Siser Color Guide",
  "Pro-Grade Non-Stick Sheet",
  "Pro-Grade Parchment Paper",
  "Sof-Fusion Pressing Pillows"
]

const getMaterialDefaults = (productName = "") => {
  const name = productName.toLowerCase()

  if (name.includes("glitter")) {
    return {
      materialType: "Glitter Heat Transfer Vinyl",
      adheresTo: [
        "100% Cotton",
        "Poly/Cotton Blends",
        "100% Uncoated Polyester"
      ],
      applicationInstructions: glitterApplicationInstructions,
      careInstructions: glitterCareInstructions,
      recommendedAccessories: defaultAccessories,
      specs: {
        composition: "PVC",
        backing: "Adhesive Backing",
        finish: "Glitter",
        blade: "45° or 60°",
        certification: "CPSIA Certified"
      }
    }
  }

  return {
    materialType: "Heat Transfer Vinyl",
    adheresTo: defaultAdheresTo,
    applicationInstructions: defaultApplicationInstructions,
    careInstructions: defaultCareInstructions,
    recommendedAccessories: defaultAccessories,
    specs: {
      composition: "Polyurethane",
      backing: "Pressure Sensitive",
      finish: "Semi-gloss",
      blade: "45° or 60°",
      certification: "CPSIA Certified"
    }
  }
}

export const generateMaterial = async (req, res) => {
  try {
    const {
      brand = "Siser",
      productName,
      fullName,
      category = "HTV",
      materialType,
      unit = "yard",
      skuPrefix,
      price,
      regularPrice,
      listedWidth,
      actualWidth,
      thickness,
      colorText = "",
      sourceUrl = ""
    } = req.body

    if (!productName || !skuPrefix || !price || !colorText) {
      return res.status(400).json({
        success: false,
        message: "productName, skuPrefix, price, and colorText are required"
      })
    }

    const defaults = getMaterialDefaults(productName)

    const colorNames = colorText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    const colors = colorNames.map((name) => ({
      sku: `${skuPrefix}-${makeSkuCode(name)}`,
      name,
      hex: guessHex(name),
      stock: 0,
      reorderPoint: 2,
      location: "HTV Rack"
    }))

    const generatedId = slugify(`${brand}-${productName}`)

    const materialData = {
      id: generatedId,
      brand,
      productName,
      fullName: fullName || `${brand} ${productName}`,
      category,
      materialType: materialType || defaults.materialType,
      unit,
      skuPrefix,
      price: Number(price),
      regularPrice: regularPrice ? Number(regularPrice) : undefined,
      currency: "USD",

      dimensions: {
        listedWidth,
        actualWidth,
        lengthPerUnit: '36"',
        thickness
      },

      specs: defaults.specs,
      adheresTo: defaults.adheresTo,
      applicationInstructions: defaults.applicationInstructions,
      careInstructions: defaults.careInstructions,
      recommendedAccessories: defaults.recommendedAccessories,

      source: {
        supplierId: "heat-press-nation",
        vendor: "HeatPressNation",
        url: sourceUrl,
        lastChecked: new Date().toISOString().slice(0, 10)
      },

      inventory: {
        trackInventory: true,
        reorderPoint: 5,
        quantityOnHand: 0
      },

      colors,
      active: true
    }

    let material = await Material.findOne({ id: generatedId })

    if (material) {
      material.set(materialData)
      await material.save()
    } else {
      material = await Material.create(materialData)
    }

    res.status(201).json({
      success: true,
      material,
      updatedExisting: Boolean(
        material.createdAt &&
          material.updatedAt &&
          material.createdAt.getTime() !== material.updatedAt.getTime()
      )
    })
  } catch (err) {
    console.error("❌ GENERATE MATERIAL ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to generate material",
      error: err.message
    })
  }
}