import Material from "../models/Material.js"

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