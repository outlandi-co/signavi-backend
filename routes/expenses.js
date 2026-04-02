import express from "express"
import Expense from "../models/Expense.js"

const router = express.Router()

/* ================= GET ================= */
router.get("/", async (req, res) => {
  const expenses = await Expense.find().sort({ createdAt: -1 })
  res.json(expenses)
})

/* ================= CREATE OR UPDATE ================= */
router.post("/", async (req, res) => {
  try {
    if (req.body._id) {
      const updated = await Expense.findByIdAndUpdate(
        req.body._id,
        req.body,
        { new: true }
      )
      return res.json(updated)
    }

    const expense = new Expense(req.body)
    await expense.save()

    res.json(expense)

  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

/* ================= DELETE ================= */
router.delete("/:id", async (req, res) => {
  await Expense.findByIdAndDelete(req.params.id)
  res.json({ success: true })
})

export default router