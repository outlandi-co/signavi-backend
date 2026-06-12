import mongoose from "mongoose"

const estimateSchema = new mongoose.Schema(
  {
    customerName: { type: String, default: "" },
    projectName: { type: String, required: true },
    jobType: { type: String, required: true },

    productPreset: { type: String, default: "custom" },
    selectedMaterialId: { type: String, default: "" },
    selectedMaterialName: { type: String, default: "" },

    quantity: { type: Number, default: 1 },

    inputs: {
      substrateCostEach: Number,
      hardwareCostEach: Number,
      packagingCostEach: Number,
      designWidth: Number,
      designHeight: Number,
      layers: Number,
      manualMaterialCost: Number,
      dtfRatePerSqIn: Number,
      screenSetupCost: Number,
      screenCount: Number,
      screenInkCostPerPrint: Number,
      laserMinutesEach: Number,
      laserSetupMinutes: Number,
      machineRatePerMinute: Number,
      maskingCostEach: Number,
      laborMinutes: Number,
      hourlyRate: Number,
      shippingCost: Number,
      wastePercent: Number,
      markupPercent: Number
    },

    calculations: {
      substrateCost: Number,
      hardwareCost: Number,
      packagingCost: Number,
      decorationMaterialCost: Number,
      machineCost: Number,
      laborCost: Number,
      setupCost: Number,
      wasteCost: Number,
      costBasis: Number,
      customerPrice: Number,
      pricePerItem: Number,
      costPerItem: Number,
      profit: Number,
      yardsUsed: Number,
      designSqIn: Number,
      totalSqInWithWaste: Number
    },

    status: {
      type: String,
      enum: ["draft", "quoted", "approved", "converted", "archived"],
      default: "draft"
    },

    notes: { type: String, default: "" }
  },
  { timestamps: true }
)

export default mongoose.model("Estimate", estimateSchema)