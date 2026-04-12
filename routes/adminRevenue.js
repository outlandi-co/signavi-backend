import { useEffect, useState } from "react"
import api from "../../services/api"

export default function AdminRevenue() {

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  /* ================= LOAD ================= */
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/orders")

        console.log("🔥 RAW ORDERS:", res.data)

        // ✅ FORCE SAFE ARRAY
        let safeOrders = []

        if (Array.isArray(res.data)) {
          safeOrders = res.data
        } else if (Array.isArray(res.data?.data)) {
          safeOrders = res.data.data
        }

        console.log("✅ SAFE ORDERS:", safeOrders)

        setOrders(safeOrders)

      } catch (err) {
        console.error("❌ REVENUE LOAD ERROR:", err)
        setOrders([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  /* ================= LOADING ================= */
  if (loading) {
    return (
      <div style={center}>
        <h2 style={{ color: "white" }}>⏳ Loading revenue...</h2>
      </div>
    )
  }

  /* ================= SAFE DATA ================= */
  const safeOrders = Array.isArray(orders) ? orders : []

  /* ================= CALCULATIONS ================= */
  const totalRevenue = safeOrders.reduce(
    (sum, o) => sum + Number(o.finalPrice || o.price || 0),
    0
  )

  const lowProfit = safeOrders.filter(
    o => Number(o.profit || 0) < 5
  )

  const topJobs = [...safeOrders]
    .sort((a, b) => Number(b.profit || 0) - Number(a.profit || 0))
    .slice(0, 5)

  /* ================= UI ================= */
  return (
    <div style={container}>
      <h1 style={title}>💰 Revenue Dashboard</h1>

      {/* SUMMARY */}
      <div style={summary}>
        <div style={card}>
          <p>Total Revenue</p>
          <strong>${totalRevenue.toFixed(2)}</strong>
        </div>
      </div>

      {/* ALERTS */}
      <div style={card}>
        <h2>🚨 Alerts</h2>
        <p style={{ color: "#f87171" }}>
          {lowProfit.length} low-profit job(s)
        </p>
      </div>

      {/* TOP JOBS */}
      <div style={card}>
        <h2>🏆 Top Profit Jobs</h2>

        {topJobs.length === 0 ? (
          <p>No jobs yet</p>
        ) : (
          topJobs.map((job, i) => (
            <div key={job._id} style={row}>
              <p>{i + 1}. {job.customerName || "Unknown"}</p>
              <p style={{ color: "#22c55e" }}>
                ${Number(job.profit || 0)}
              </p>
            </div>
          ))
        )}
      </div>

    </div>
  )
}

/* ================= STYLES ================= */

const container = {
  padding: 20,
  background: "#020617",
  minHeight: "100vh",
  color: "white"
}

const title = {
  marginBottom: 20
}

const summary = {
  display: "flex",
  gap: 20,
  marginBottom: 20
}

const card = {
  background: "#1e293b",
  padding: 15,
  borderRadius: 8,
  marginBottom: 20
}

const row = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 0",
  borderBottom: "1px solid #334155"
}

const center = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100vh",
  background: "#020617"
}