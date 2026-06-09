import PurchaseOrder from "../models/PurchaseOrder.js"

export const getPurchaseOrders = async (
  req,
  res
) => {
  try {
    const orders =
      await PurchaseOrder.find()
        .populate("supplier")
        .sort({
          createdAt: -1
        })

    res.json(orders)
  } catch (error) {
    console.error(
      "GET PURCHASE ORDERS ERROR:",
      error
    )

    res.status(500).json({
      message:
        "Failed to load purchase orders"
    })
  }
}

export const getPurchaseOrder = async (
  req,
  res
) => {
  try {
    const order =
      await PurchaseOrder.findById(
        req.params.id
      ).populate("supplier")

    if (!order) {
      return res.status(404).json({
        message:
          "Purchase order not found"
      })
    }

    res.json(order)
  } catch (error) {
    console.error(
      "GET PURCHASE ORDER ERROR:",
      error
    )

    res.status(500).json({
      message:
        "Failed to load purchase order"
    })
  }
}

export const createPurchaseOrder =
  async (req, res) => {
    try {
      const order =
        await PurchaseOrder.create(
          req.body
        )

      res.status(201).json(order)
    } catch (error) {
      console.error(
        "CREATE PURCHASE ORDER ERROR:",
        error
      )

      res.status(500).json({
        message:
          "Failed to create purchase order"
      })
    }
  }

export const updatePurchaseOrder =
  async (req, res) => {
    try {
      const order =
        await PurchaseOrder.findByIdAndUpdate(
          req.params.id,
          req.body,
          {
            new: true,
            runValidators: true
          }
        )

      if (!order) {
        return res.status(404).json({
          message:
            "Purchase order not found"
        })
      }

      res.json(order)
    } catch (error) {
      console.error(
        "UPDATE PURCHASE ORDER ERROR:",
        error
      )

      res.status(500).json({
        message:
          "Failed to update purchase order"
      })
    }
  }

export const deletePurchaseOrder =
  async (req, res) => {
    try {
      const order =
        await PurchaseOrder.findByIdAndDelete(
          req.params.id
        )

      if (!order) {
        return res.status(404).json({
          message:
            "Purchase order not found"
        })
      }

      res.json({
        message:
          "Purchase order deleted"
      })
    } catch (error) {
      console.error(
        "DELETE PURCHASE ORDER ERROR:",
        error
      )

      res.status(500).json({
        message:
          "Failed to delete purchase order"
      })
    }
  }

export const receivePurchaseOrder =
  async (req, res) => {
    try {
      const order =
        await PurchaseOrder.findById(
          req.params.id
        )

      if (!order) {
        return res.status(404).json({
          message:
            "Purchase order not found"
        })
      }

      order.status = "received"

      await order.save()

      res.json(order)
    } catch (error) {
      console.error(
        "RECEIVE PURCHASE ORDER ERROR:",
        error
      )

      res.status(500).json({
        message:
          "Failed to receive purchase order"
      })
    }
  }