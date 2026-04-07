import { Link, useNavigate, useLocation } from "react-router-dom"
import { useMemo } from "react"
import logo from "../assets/SignaVi_Logo.jpg"
import NotificationBell from "./NotificationBell"
import useCart from "../hooks/useCart"

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()

  const { cart } = useCart()

  /* ✅ SAFE USER PARSE */
  let user = null
  try {
    user = JSON.parse(localStorage.getItem("user") || "null")
  } catch {
    user = null
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    navigate("/")
  }

  /* 🔥 FIXED ACTIVE LOGIC */
  const isActive = (path) => {
    if (path === "/") return location.pathname === "/"
    return location.pathname.startsWith(path)
  }

  /* ✅ MEMOIZED COUNT */
  const totalItems = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.quantity || 1), 0)
  }, [cart])

  return (
    <div style={nav}>

      {/* LEFT */}
      <div style={left}>

        <Link to="/" style={logoWrap}>
          <img src={logo} alt="Logo" style={logoStyle} />
        </Link>

        <div style={linkGroup}>

          <NavLink to="/" active={isActive("/")}>
            Home
          </NavLink>

          <NavLink to="/store" active={isActive("/store")}>
            Store
          </NavLink>

          {/* 🛒 CART */}
          <NavLink to="/cart" active={isActive("/cart")}>
            🛒 Cart
            {totalItems > 0 && (
              <span style={badge}>{totalItems}</span>
            )}
          </NavLink>

          {/* 🔔 ALERTS */}
          {user && (
            <NavLink to="/notifications" active={isActive("/notifications")}>
              🔔 Alerts
            </NavLink>
          )}

        </div>

        {/* ADMIN NAV */}
        {user?.role === "admin" && (
          <div style={adminGroup}>
            <NavLink to="/admin/production" active={isActive("/admin/production")}>Production</NavLink>
            <NavLink to="/admin/orders" active={isActive("/admin/orders")}>Orders</NavLink>
            <NavLink to="/admin/customers" active={isActive("/admin/customers")}>Customers</NavLink>
            <NavLink to="/admin/pricing" active={isActive("/admin/pricing")}>Pricing</NavLink>
            <NavLink to="/admin/inventory" active={isActive("/admin/inventory")}>Inventory</NavLink>
            <NavLink to="/admin/mockups" active={isActive("/admin/mockups")}>Mockups</NavLink>
            <NavLink to="/admin/revenue" active={isActive("/admin/revenue")}>Revenue</NavLink>
          </div>
        )}

      </div>

      {/* RIGHT */}
      <div style={right}>

        <NotificationBell />

        {user ? (
          <button onClick={handleLogout} style={logoutBtn}>
            Logout
          </button>
        ) : (
          <>
            <NavLink to="/login" active={isActive("/login")}>Admin Login</NavLink>
            <NavLink to="/customer-login" active={isActive("/customer-login")}>Customer Login</NavLink>
          </>
        )}
      </div>
    </div>
  )
}

/* NAV LINK */
function NavLink({ to, children, active }) {
  return (
    <Link
      to={to}
      style={{
        ...link,
        ...(active ? activeLink : {})
      }}
    >
      {children}
    </Link>
  )
}

/* STYLES */
const nav = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 24px",
  background: "#020617",
  borderBottom: "1px solid #1e293b",
  color: "white"
}

const left = {
  display: "flex",
  alignItems: "center",
  gap: "30px"
}

const right = {
  display: "flex",
  alignItems: "center",
  gap: 15
}

const logoWrap = { display: "flex", alignItems: "center" }

const logoStyle = {
  height: "42px",
  objectFit: "contain"
}

const linkGroup = {
  display: "flex",
  gap: "18px",
  alignItems: "center"
}

const adminGroup = {
  display: "flex",
  gap: "12px",
  marginLeft: "20px",
  paddingLeft: "20px",
  borderLeft: "1px solid #1e293b"
}

const link = {
  textDecoration: "none",
  color: "#cbd5f5",
  fontWeight: "600",
  fontSize: "15px",
  padding: "6px 10px",
  borderRadius: "6px",
  display: "flex",
  alignItems: "center",
  gap: 6
}

const activeLink = {
  color: "#fff",
  background: "#06b6d4",
  boxShadow: "0 0 10px rgba(6,182,212,0.6)"
}

const badge = {
  background: "#22c55e",
  padding: "2px 7px",
  borderRadius: "999px",
  fontSize: "12px",
  color: "#fff",
  fontWeight: "bold"
}

const logoutBtn = {
  padding: "6px 12px",
  background: "#ef4444",
  border: "none",
  borderRadius: "6px",
  color: "white",
  cursor: "pointer"
}

export default Navbar