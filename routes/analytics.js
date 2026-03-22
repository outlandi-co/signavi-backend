import express from "express"
import Order from "../models/Order.js"

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    const orders = await Order.find({})

    let totalRevenue = 0
    let totalCOGS = 0
    let totalFees = 0

    const monthlyMap = {}
    const productMap = {}

    orders.forEach(order => {
      const price = order.price || order.total || 0
      const cost = order.cost || 0
      const fee = order.fees || price * 0.03

      totalRevenue += price
      totalCOGS += cost
      totalFees += fee

      /* ================= MONTHLY ================= */
      const date = new Date(order.createdAt || Date.now())
      const month = date.toLocaleString("default", { month: "short" })

      if (!monthlyMap[month]) {
        monthlyMap[month] = {
          month,
          revenue: 0,
          profit: 0
        }
      }

      monthlyMap[month].revenue += price
      monthlyMap[month].profit += (price - cost - fee)

      /* ================= PRODUCT ANALYTICS ================= */
      if (Array.isArray(order.items)) {
        order.items.forEach(item => {
          const name = item.name || "Unknown"
          const itemRevenue = (item.price || 0) * (item.quantity || 1)
          const itemCost = (item.cost || 0) * (item.quantity || 1)

          if (!productMap[name]) {
            productMap[name] = {
              name,
              revenue: 0,
              cost: 0,
              profit: 0,
              quantity: 0
            }
          }

          productMap[name].revenue += itemRevenue
          productMap[name].cost += itemCost
          productMap[name].profit += (itemRevenue - itemCost)
          productMap[name].quantity += item.quantity || 1
        })
      }
    })

    const totalProfit = totalRevenue - totalCOGS - totalFees

    const monthly = Object.values(monthlyMap)
    const products = Object.values(productMap)

    /* ================= AI INSIGHTS ================= */
    const insights = []

    if (totalRevenue === 0) {
      insights.push("No revenue yet — start pushing sales 🚀")
    }

    if (totalProfit > 0) {
      insights.push("You're profitable — scale what works 🔥")
    } else {
      insights.push("You're losing money — adjust pricing or costs")
    }

    if (products.length > 0) {
      const topProduct = products.sort((a, b) => b.revenue - a.revenue)[0]
      insights.push(`Top product: ${topProduct.name} 💰`)
    }

    if (products.length > 0) {
      const mostProfitable = [...products].sort((a, b) => b.profit - a.profit)[0]
      insights.push(`Most profitable: ${mostProfitable.name} 📈`)
    }

    if (totalFees > totalProfit * 0.3) {
      insights.push("Fees are too high — increase pricing slightly")
    }

    if (monthly.length > 1) {
      const last = monthly[monthly.length - 1]
      const prev = monthly[monthly.length - 2]

      if (last.revenue > prev.revenue) {
        insights.push("Revenue trending up 📊")
      } else {
        insights.push("Revenue dropped — review strategy")
      }
    }

    res.json({
      totalRevenue,
      totalProfit,
      totalFees,
      totalCOGS,
      monthly,
      products, // 🔥 NEW
      insights
    })

  } catch (err) {
    console.error("ANALYTICS ERROR:", err)
    res.status(500).json({ message: err.message })
  }
})

export default router