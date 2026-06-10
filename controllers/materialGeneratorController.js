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

  return words
    .map((word) => word.slice(0, 3).toUpperCase())
    .join("")
    .slice(0, 8)
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

export const generateMaterial = async (req, res) => {
  try {
    const {
      brand = "Siser",
      productName,
      fullName,
      category = "HTV",
      materialType = "Heat Transfer Vinyl",
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

    const material = await Material.findOneAndUpdate(
      { id: generatedId },
      {
        id: generatedId,
        brand,
        productName,
        fullName: fullName || `${brand} ${productName}`,
        category,
        materialType,
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
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    )

    res.status(201).json({
      success: true,
      material
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