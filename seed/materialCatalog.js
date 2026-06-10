const makeColor = (sku, name, hex, stock = 0, reorderPoint = 2, location = "HTV Rack") => ({
  sku,
  name,
  hex,
  stock,
  reorderPoint,
  location,
})

const easyWeedCare = [
  "Wait 24 hours before first wash",
  "Machine wash warm with mild detergent",
  "Do not dry clean",
  "Hang item to dry",
  "Do not bleach",
  "Dry at normal setting",
]

const easyWeedApplication = [
  "Cut in reverse",
  "Weed excess material",
  "Preheat garment for 2-3 seconds",
  "Apply design at 305°F / 150°C",
  "Use medium pressure for 10-15 seconds",
  "Peel carrier hot or cold",
]

const easyWeedAccessories = [
  "Siser Hook Tool",
  "Siser Color Guide",
  "Pro-Grade Non-Stick Sheet",
  "Pro-Grade Parchment Paper",
  "Sof-Fusion Pressing Pillows",
]

const easyWeedAdheresTo = [
  "100% Cotton",
  "Poly/Cotton Blends",
  "100% Uncoated Polyester",
  "Leather",
]

const easyWeedSpecs = {
  composition: "Polyurethane",
  backing: "Pressure Sensitive",
  finish: "Semi-gloss",
  blade: "45° or 60°",
  certification: "CPSIA Certified",
}

const materialCatalog = [
  {
    id: "siser-easyweed-20-yard",
    brand: "Siser",
    productName: 'EasyWeed Heat Transfer Vinyl 20" - By the Yard',
    fullName: 'Siser EasyWeed Heat Transfer Vinyl 20" - By the Yard',
    category: "HTV",
    materialType: "Cuttable Heat Transfer Vinyl",
    unit: "yard",
    skuPrefix: "EW20",
    price: 10.79,
    regularPrice: 11.99,
    currency: "USD",

    dimensions: {
      listedWidth: '20"',
      actualWidth: '19.66"',
      lengthPerUnit: '36"',
      thickness: "90 microns / 3.5 mils",
    },

    specs: easyWeedSpecs,
    adheresTo: easyWeedAdheresTo,
    applicationInstructions: easyWeedApplication,
    careInstructions: easyWeedCare,
    recommendedAccessories: easyWeedAccessories,

    source: {
      supplierId: "heat-press-nation",
      vendor: "HeatPressNation",
      url: "https://www.heatpressnation.com/products/siser-easyweed-heat-transfer-vinyl-20-by-the-yard",
      lastChecked: "2026-06-08",
    },

    priceWatch: {
      enabled: true,
      currentPrice: 10.79,
      previousPrice: 10.79,
      alertOnChange: true,
      lastChecked: null,
      tiers: [
        { minQty: 1, maxQty: 4, price: 10.79 },
        { minQty: 5, maxQty: 9, price: 8.21 },
        { minQty: 10, maxQty: 24, price: 7.88 },
        { minQty: 25, maxQty: 49, price: 7.33 },
        { minQty: 50, maxQty: null, price: 6.97 },
      ],
    },

    inventory: {
      trackInventory: true,
      reorderPoint: 5,
      quantityOnHand: 0,
    },

    colors: [
      makeColor("EW20-WHT", "White", "#FFFFFF"),
      makeColor("EW20-BLK", "Black", "#000000"),
      makeColor("EW20-RYL", "Royal Blue", "#0057B8"),
      makeColor("EW20-NVY", "Navy", "#002D72"),
      makeColor("EW20-RED", "Red", "#C8102E"),
      makeColor("EW20-YLW", "Yellow", "#FFD100"),
      makeColor("EW20-GRN", "Green", "#009639"),
      makeColor("EW20-ORG", "Orange", "#FF6A13"),
      makeColor("EW20-PNK", "Pink", "#FF69B4"),
      makeColor("EW20-SKY", "Sky Blue", "#6EC6FF"),
      makeColor("EW20-BRN", "Brown", "#6F4E37"),
      makeColor("EW20-GLD", "Gold", "#D4AF37"),
      makeColor("EW20-SLV", "Silver", "#C0C0C0"),
      makeColor("EW20-BUR", "Burgundy", "#7C2529"),
      makeColor("EW20-PUR", "Purple", "#7F3F98"),
      makeColor("EW20-LEM", "Lemon", "#FFF44F"),
      makeColor("EW20-GRY", "Gray", "#808080"),
      makeColor("EW20-DGN", "Dark Green", "#006341"),
      makeColor("EW20-TUR", "Turquoise", "#00B5E2"),
      makeColor("EW20-SUN", "Sun", "#FFB81C"),
      makeColor("EW20-CRM", "Cream", "#F5E6C8"),
      makeColor("EW20-BRD", "Bright Red", "#E10600"),
      makeColor("EW20-GAP", "Green Apple", "#8DC63F"),
      makeColor("EW20-LME", "Lime", "#A4D65E"),
      makeColor("EW20-MEL", "Melon", "#FF8A80"),
    ],

    active: true,
  },

  {
    id: "siser-easyweed-fluorescent-15-yard",
    brand: "Siser",
    productName: 'EasyWeed Fluorescent Heat Transfer Vinyl 15" - By the Yard',
    fullName: 'Siser EasyWeed Fluorescent Heat Transfer Vinyl 15" - By the Yard',
    category: "HTV",
    materialType: "Cuttable Heat Transfer Vinyl",
    unit: "yard",
    skuPrefix: "EWF15",
    price: 10.79,
    regularPrice: 11.99,
    currency: "USD",

    dimensions: {
      listedWidth: '15"',
      actualWidth: '14.75"',
      lengthPerUnit: '36"',
      thickness: "90 microns / 3.5 mils",
    },

    specs: easyWeedSpecs,
    adheresTo: easyWeedAdheresTo,
    applicationInstructions: easyWeedApplication,
    careInstructions: easyWeedCare,
    recommendedAccessories: easyWeedAccessories,

    source: {
      supplierId: "heat-press-nation",
      vendor: "HeatPressNation",
      url: "https://www.heatpressnation.com/products/siser-easyweed-fluorescent-heat-transfer-vinyl-15-by-the-yard",
      lastChecked: "2026-06-09",
    },

    priceWatch: {
      enabled: true,
      currentPrice: 10.79,
      previousPrice: 10.79,
      alertOnChange: true,
      lastChecked: null,
      tiers: [
        { minQty: 1, maxQty: 4, price: 10.79 },
        { minQty: 5, maxQty: 9, price: 7.77 },
        { minQty: 10, maxQty: 24, price: 7.44 },
        { minQty: 25, maxQty: 49, price: 7.15 },
        { minQty: 50, maxQty: null, price: 6.82 },
      ],
    },

    inventory: {
      trackInventory: true,
      reorderPoint: 5,
      quantityOnHand: 0,
    },

    colors: [
      makeColor("EWF15-FP", "Fluorescent Pink", "#FF1493"),
      makeColor("EWF15-FR", "Fluorescent Raspberry", "#E30B5D"),
      makeColor("EWF15-FC", "Fluorescent Coral", "#FF6F61"),
      makeColor("EWF15-FO", "Fluorescent Orange", "#FF5F1F"),
      makeColor("EWF15-FY", "Fluorescent Yellow", "#FFFF33"),
      makeColor("EWF15-FG", "Fluorescent Green", "#39FF14"),
      makeColor("EWF15-FB", "Fluorescent Blue", "#1F75FE"),
    ],

    active: true,
  },
]

export default materialCatalog