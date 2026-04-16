import { useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "../services/api"

export default function CustomerRegister() {

  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: ""
  })

  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      /* 🔥 STEP 1: REGISTER USER */
      await api.post("/auth/register", {
        name: form.name,
        email: form.email,
        password: form.password,
        role: "customer"
      })

      /* 🔥 STEP 2: LOGIN USER */
      const res = await api.post("/auth/login", {
        email: form.email,
        password: form.password
      })

      /* 🔥 STORE CUSTOMER AUTH */
      localStorage.setItem("customerToken", res.data.token)
      localStorage.setItem("customerUser", JSON.stringify(res.data.user))

      alert("Welcome! You're now logged in.")

      navigate("/store")

    } catch (err) {
      console.error("❌ REGISTER ERROR:", err)
      alert("Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={wrap}>
      <form onSubmit={handleSubmit} style={card}>

        <h2>Create Account</h2>

        <input
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={handleChange}
          required
          style={input}
        />

        <input
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
          style={input}
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
          style={input}
        />

        <button type="submit" style={btn}>
          {loading ? "Creating..." : "Register"}
        </button>

      </form>
    </div>
  )
}

/* STYLES */
const wrap = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "80vh",
  color: "white"
}

const card = {
  background: "#020617",
  padding: 30,
  borderRadius: 12,
  width: 300,
  display: "flex",
  flexDirection: "column",
  gap: 10
}

const input = {
  padding: 10,
  borderRadius: 6,
  border: "1px solid #1e293b",
  background: "#0f172a",
  color: "white"
}

const btn = {
  marginTop: 10,
  padding: 10,
  background: "#22c55e",
  border: "none",
  borderRadius: 6,
  cursor: "pointer"
}