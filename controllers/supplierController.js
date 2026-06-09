import Supplier from "../models/Supplier.js"

export const getSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ name: 1 })
    res.json(suppliers)
  } catch (error) {
    console.error("GET SUPPLIERS ERROR:", error)
    res.status(500).json({ message: "Failed to load suppliers" })
  }
}

export const getSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id)

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" })
    }

    res.json(supplier)
  } catch (error) {
    console.error("GET SUPPLIER ERROR:", error)
    res.status(500).json({ message: "Failed to load supplier" })
  }
}

export const createSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.create(req.body)
    res.status(201).json(supplier)
  } catch (error) {
    console.error("CREATE SUPPLIER ERROR:", error)
    res.status(500).json({ message: "Failed to create supplier" })
  }
}

export const updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    )

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" })
    }

    res.json(supplier)
  } catch (error) {
    console.error("UPDATE SUPPLIER ERROR:", error)
    res.status(500).json({ message: "Failed to update supplier" })
  }
}

export const deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndDelete(req.params.id)

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" })
    }

    res.json({ message: "Supplier deleted" })
  } catch (error) {
    console.error("DELETE SUPPLIER ERROR:", error)
    res.status(500).json({ message: "Failed to delete supplier" })
  }
}