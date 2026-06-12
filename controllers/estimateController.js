import Estimate from "../models/Estimate.js"

export const createEstimate = async (req, res) => {
  try {
    const estimate = await Estimate.create(req.body)

    res.status(201).json({
      success: true,
      estimate
    })
  } catch (err) {
    console.error("❌ CREATE ESTIMATE ERROR:", err)

    res.status(500).json({
      success: false,
      message: "Failed to save estimate",
      error: err.message
    })
  }
}

export const getEstimates = async (req, res) => {
  try {
    const estimates = await Estimate.find().sort({ createdAt: -1 })

    res.json({
      success: true,
      count: estimates.length,
      estimates
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load estimates",
      error: err.message
    })
  }
}

export const getEstimateById = async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id)

    if (!estimate) {
      return res.status(404).json({
        success: false,
        message: "Estimate not found"
      })
    }

    res.json({
      success: true,
      estimate
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load estimate",
      error: err.message
    })
  }
}

export const deleteEstimate = async (req, res) => {
  try {
    await Estimate.findByIdAndDelete(req.params.id)

    res.json({
      success: true,
      message: "Estimate deleted"
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to delete estimate",
      error: err.message
    })
  }
}