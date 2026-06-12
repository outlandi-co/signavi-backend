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
    .replace(/electric/gi, "el")
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

  if (color.includes("white opal")) return "#F8F6FF"
  if (color.includes("silver lens")) return "#C0C0C0"
  if (color.includes("gold lens")) return "#D4AF37"
  if (color.includes("rose gold")) return "#B76E79"
  if (color.includes("orange soda")) return "#FF7A00"
  if (color.includes("green apple")) return "#8DC63F"
  if (color.includes("vegas gold")) return "#C5B358"
  if (color.includes("texas orange")) return "#BF5700"
  if (color.includes("lemon lime")) return "#DFFF00"
  if (color.includes("sunrise coral")) return "#FF7E67"
  if (color.includes("sea glass")) return "#9FD8CB"
  if (color.includes("sweet mint")) return "#98FF98"
  if (color.includes("frosty mint")) return "#CFFFE5"
  if (color.includes("purple berry")) return "#7D3C98"
  if (color.includes("ballerina pink")) return "#F2C1D1"
  if (color.includes("calypso coral")) return "#FF6F61"
  if (color.includes("cobalt blue")) return "#0047AB"
  if (color.includes("celestial blue")) return "#4997D0"
  if (color.includes("bright orchid")) return "#D65282"
  if (color.includes("bubble gum")) return "#FF85C1"
  if (color.includes("charcoal")) return "#36454F"
  if (color.includes("coffee")) return "#6F4E37"
  if (color.includes("wisteria")) return "#C9A0DC"
  if (color.includes("totally teal")) return "#008080"
  if (color.includes("blue teal")) return "#008C8C"
  if (color.includes("peacock teal")) return "#008C8C"
  if (color.includes("teal")) return "#008080"
  if (color.includes("spearmint")) return "#7FFFD4"
  if (color.includes("turquoise")) return "#40E0D0"
  if (color.includes("cranberry")) return "#B31B34"
  if (color.includes("grape")) return "#6F2DA8"
  if (color.includes("peach fuzz")) return "#FFBE98"
  if (color.includes("tungsten")) return "#7A7A7A"
  if (color.includes("frosted blueberry")) return "#6A8DFF"
  if (color.includes("columbia")) return "#B9D9EB"
  if (color.includes("olive")) return "#708238"
  if (color.includes("eucalyptus")) return "#5F8575"
  if (color.includes("fresh grass")) return "#4CBB17"
  if (color.includes("cool aqua")) return "#66D9E8"
  if (color.includes("storm blue")) return "#4F6D7A"
  if (color.includes("blue horizon")) return "#4A90E2"
  if (color.includes("red earth")) return "#8A3324"
  if (color.includes("medium purple")) return "#9370DB"
  if (color.includes("veri peri")) return "#6667AB"
  if (color.includes("dark gold")) return "#B8860B"
  if (color.includes("chestnut")) return "#954535"
  if (color.includes("sun yellow")) return "#FFD100"

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
  if (color.includes("gray")) return "#808080"
  if (color.includes("grey")) return "#808080"
  if (color.includes("lemon")) return "#FFF44F"
  if (color.includes("sun")) return "#FDB813"
  if (color.includes("pearl")) return "#F8F6F0"
  if (color.includes("copper")) return "#B87333"
  if (color.includes("cherry")) return "#C21833"

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

const stretchApplicationInstructions = [
  "Cut in reverse",
  "Weed excess material",
  "Preheat garment for 2-3 seconds",
  "Apply design at 320°F / 160°C",
  "Use firm pressure for 20 seconds",
  "Peel carrier hot or cold"
]

const ecoStretchApplicationInstructions = [
  "Cut in reverse",
  "Weed excess material",
  "Preheat garment for 2-3 seconds",
  "Apply design at 250°F / 120°C",
  "Use medium pressure for 10-15 seconds",
  "Peel carrier hot"
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

const ecoStretchCareInstructions = [
  "Wait 24 hours before first wash",
  "Machine wash cold with mild detergent",
  "Do not dry clean",
  "Hang item to dry",
  "Do not bleach",
  "Dry at low setting",
  "Do not use fabric softener",
  "Wash regularly or inside-out"
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

  if (name.includes("ecostretch")) {
    return {
      materialType: "Eco Stretch Heat Transfer Vinyl",
      adheresTo: [
        "100% Cotton",
        "Poly/Cotton Blends",
        "100% Uncoated Polyester",
        "Lycra / Spandex"
      ],
      applicationInstructions: ecoStretchApplicationInstructions,
      careInstructions: ecoStretchCareInstructions,
      recommendedAccessories: defaultAccessories,
      specs: {
        composition: "Water-Based Polyurethane",
        backing: "Pressure Sensitive",
        finish: "Matte (Silver, Gold, Vegas Gold, and Rose Gold have a Glossy Finish)",
        blade: "45° or 60°",
        certification: "CPSIA Certified"
      }
    }
  }

  if (name.includes("stretch")) {
    return {
      materialType: "Stretch Heat Transfer Vinyl",
      adheresTo: [
        "100% Cotton",
        "Poly/Cotton Blends",
        "100% Uncoated Polyester",
        "Lycra / Spandex"
      ],
      applicationInstructions: stretchApplicationInstructions,
      careInstructions: defaultCareInstructions,
      recommendedAccessories: defaultAccessories,
      specs: {
        composition: "Polyurethane",
        backing: "Pressure Sensitive",
        finish: "True Matte Finish",
        blade: "45° or 60°",
        certification: "CPSIA Certified"
      }
    }
  }

  if (name.includes("matte")) {
    return {
      materialType: "Heat Transfer Vinyl",
      adheresTo: defaultAdheresTo,
      applicationInstructions: defaultApplicationInstructions,
      careInstructions: defaultCareInstructions,
      recommendedAccessories: defaultAccessories,
      specs: {
        composition: "Polyurethane",
        backing: "Pressure Sensitive",
        finish: "Matte",
        blade: "45° or 60°",
        certification: "CPSIA Certified"
      }
    }
  }

  if (name.includes("electric")) {
    return {
      materialType: "Electric Heat Transfer Vinyl",
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
      sourceUrl = "",

      // JSON override fields from the Admin Materials generator textarea
      specs,
      adheresTo,
      applicationInstructions,
      careInstructions,
      recommendedAccessories
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

      specs: specs || defaults.specs,
      adheresTo: adheresTo || defaults.adheresTo,
      applicationInstructions:
        applicationInstructions || defaults.applicationInstructions,
      careInstructions:
        careInstructions || defaults.careInstructions,
      recommendedAccessories:
        recommendedAccessories || defaults.recommendedAccessories,

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