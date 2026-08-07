import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { Resend } from "resend"

import User from "../models/User.js"
import { requireAuth } from "../middleware/requireAuth.js"

const router = express.Router()

/* ================= EMAIL CONFIG ================= */

const RESEND_API_KEY =
  process.env.RESEND_API_KEY || ""

const INFO_EMAIL =
  process.env.INFO_EMAIL ||
  process.env.EMAIL_FROM ||
  "info@signavistudio.store"

const resend =
  new Resend(RESEND_API_KEY)

if (RESEND_API_KEY) {
  console.log("📨 AUTH RESEND READY")
} else {
  console.warn(
    "⚠️ RESEND_API_KEY missing for auth email"
  )
}

console.log("🔐 AUTH ROUTES LOADED")

/* ================= REGISTER ================= */

router.post(
  "/register",
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        role
      } = req.body || {}

      if (
        !email ||
        !password
      ) {
        return res.status(400).json({
          message:
            "Email and password required"
        })
      }

      if (
        password.length < 6
      ) {
        return res.status(400).json({
          message:
            "Password must be at least 6 characters"
        })
      }

      const cleanEmail =
        email
          .trim()
          .toLowerCase()

      const existingUser =
        await User.findOne({
          email:
            cleanEmail
        })

      if (existingUser) {
        return res.status(400).json({
          message:
            "User already exists"
        })
      }

      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        )

      const user =
        await User.create({
          name:
            name || "",

          email:
            cleanEmail,

          password:
            hashedPassword,

          role:
            role ||
            "customer"
        })

      const token =
        jwt.sign(
          {
            id:
              user._id,

            email:
              user.email,

            role:
              user.role
          },

          process.env.JWT_SECRET,

          {
            expiresIn:
              "7d"
          }
        )

      res.status(201).json({
        token,

        user: {
          _id:
            user._id,

          name:
            user.name,

          email:
            user.email,

          role:
            user.role
        }
      })
    } catch (error) {
      console.error(
        "❌ REGISTER ERROR:",
        error
      )

      res.status(500).json({
        message:
          "Registration failed"
      })
    }
  }
)

/* ================= LOGIN ================= */

router.post(
  "/login",
  async (req, res) => {
    try {
      const {
        email,
        password
      } = req.body || {}

      if (
        !email ||
        !password
      ) {
        return res.status(400).json({
          message:
            "Missing credentials"
        })
      }

      const cleanEmail =
        email
          .trim()
          .toLowerCase()

      const user =
        await User.findOne({
          email:
            cleanEmail
        })

      if (!user) {
        return res.status(400).json({
          message:
            "User not found"
        })
      }

      const validPassword =
        await bcrypt.compare(
          password,
          user.password
        )

      if (!validPassword) {
        return res.status(400).json({
          message:
            "Invalid password"
        })
      }

      const token =
        jwt.sign(
          {
            id:
              user._id,

            email:
              user.email,

            role:
              user.role
          },

          process.env.JWT_SECRET,

          {
            expiresIn:
              "7d"
          }
        )

      res.json({
        token,

        user: {
          _id:
            user._id,

          name:
            user.name,

          email:
            user.email,

          role:
            user.role
        }
      })
    } catch (error) {
      console.error(
        "❌ LOGIN ERROR:",
        error
      )

      res.status(500).json({
        message:
          "Login failed"
      })
    }
  }
)

/* ================= PROFILE ================= */

router.get(
  "/profile",
  requireAuth,
  async (req, res) => {
    try {
      const user =
        await User.findById(
          req.user.id
        ).select(
          "-password"
        )

      if (!user) {
        return res.status(404).json({
          message:
            "User not found"
        })
      }

      res.json({
        user
      })
    } catch (error) {
      console.error(
        "❌ PROFILE ERROR:",
        error
      )

      res.status(500).json({
        message:
          "Failed to load profile"
      })
    }
  }
)

/* ================= CHANGE PASSWORD ================= */

router.post(
  "/change-password",
  requireAuth,
  async (req, res) => {
    try {
      const {
        currentPassword,
        newPassword
      } = req.body || {}

      if (
        !currentPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          message:
            "Current and new password required"
        })
      }

      if (
        newPassword.length < 6
      ) {
        return res.status(400).json({
          message:
            "New password must be at least 6 characters"
        })
      }

      const user =
        await User.findById(
          req.user.id
        )

      if (!user) {
        return res.status(404).json({
          message:
            "User not found"
        })
      }

      const valid =
        await bcrypt.compare(
          currentPassword,
          user.password
        )

      if (!valid) {
        return res.status(400).json({
          message:
            "Incorrect current password"
        })
      }

      user.password =
        await bcrypt.hash(
          newPassword,
          10
        )

      await user.save()

      console.log(
        "🔐 PASSWORD UPDATED:",
        user.email
      )

      res.json({
        message:
          "Password updated successfully"
      })
    } catch (err) {
      console.error(
        "❌ CHANGE PASSWORD ERROR:",
        err
      )

      res.status(500).json({
        message:
          "Password update failed"
      })
    }
  }
)

/* ================= FORGOT PASSWORD ================= */

router.post(
  "/forgot-password",
  async (req, res) => {
    try {
      const {
        email
      } = req.body || {}

      console.log(
        "🔥 FORGOT PASSWORD HIT:",
        email
      )

      if (!email) {
        return res.status(400).json({
          message:
            "Email required"
        })
      }

      if (!RESEND_API_KEY) {
        console.error(
          "❌ Missing RESEND_API_KEY"
        )

        return res.status(500).json({
          message:
            "Email service not configured"
        })
      }

      const cleanEmail =
        email
          .trim()
          .toLowerCase()

      const user =
        await User.findOne({
          email:
            cleanEmail
        })

      /*
       * Keep the response generic so the route
       * does not reveal whether an account exists.
       */
      if (!user) {
        return res.json({
          message:
            "If that email exists, a reset link was sent."
        })
      }

      /* ================= CREATE RESET TOKEN ================= */

      const rawToken =
        crypto
          .randomBytes(32)
          .toString("hex")

      const hashedToken =
        crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex")

      user.resetPasswordToken =
        hashedToken

      user.resetPasswordExpire =
        Date.now() +
        1000 * 60 * 15

      await user.save()

      /* ================= RESET URL ================= */

      const CLIENT_URL =
        process.env.CLIENT_URL ||
        "http://localhost:5173"

      const resetUrl =
        `${CLIENT_URL}/reset-password/${rawToken}`

      console.log(
        "🔐 RESET LINK CREATED"
      )

      /* ================= EMAIL CONTENT ================= */

      const subject =
        "Reset your SignaVi Studio password"

      const text = `
Reset your SignaVi Studio password

Hello ${user.name || "Customer"},

Use this link to reset your password:

${resetUrl}

This link expires in 15 minutes.

If you did not request a password reset, you can ignore this message.
      `.trim()

      const html = `
        <div
          style="
            font-family:Arial,sans-serif;
            background:#f8fafc;
            padding:30px;
            color:#111;
          "
        >
          <div
            style="
              max-width:620px;
              margin:0 auto;
              background:#ffffff;
              border:1px solid #e5e7eb;
              border-radius:14px;
              overflow:hidden;
            "
          >
            <div
              style="
                background:#020617;
                color:#ffffff;
                padding:24px;
              "
            >
              <h1
                style="
                  margin:0;
                  font-size:24px;
                "
              >
                SignaVi Studio
              </h1>
            </div>

            <div
              style="
                padding:28px;
              "
            >
              <h2
                style="
                  margin-top:0;
                  color:#020617;
                "
              >
                Reset your password
              </h2>

              <p>
                Hello ${user.name || "Customer"},
              </p>

              <p>
                We received a request to reset
                your SignaVi Studio password.
              </p>

              <p>
                Click the button below to choose
                a new password.
              </p>

              <div
                style="
                  margin:28px 0;
                "
              >
                <a
                  href="${resetUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="
                    display:inline-block;
                    background:#22d3ee;
                    color:#020617;
                    padding:14px 22px;
                    border-radius:10px;
                    text-decoration:none;
                    font-weight:bold;
                  "
                >
                  Reset Password
                </a>
              </div>

              <p>
                This link expires in
                <strong>15 minutes</strong>.
              </p>

              <p
                style="
                  font-size:13px;
                  color:#64748b;
                  margin-top:24px;
                "
              >
                If the button does not work,
                copy and paste this URL into your browser:
              </p>

              <p
                style="
                  font-size:13px;
                  word-break:break-all;
                "
              >
                <a
                  href="${resetUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ${resetUrl}
                </a>
              </p>

              <p
                style="
                  margin-top:24px;
                  color:#64748b;
                  font-size:13px;
                "
              >
                If you did not request this password reset,
                you can safely ignore this email.
              </p>
            </div>

            <div
              style="
                background:#f8fafc;
                color:#64748b;
                padding:18px 28px;
                font-size:13px;
              "
            >
              SignaVi Studio
            </div>
          </div>
        </div>
      `

      /* ================= SEND WITH RESEND ================= */

      const {
        data,
        error
      } = await resend.emails.send({
        from:
          `SignaVi Studio <${INFO_EMAIL}>`,

        to: [
          user.email
        ],

        subject,

        text,

        html
      })

      if (error) {
        console.error(
          "❌ RESEND PASSWORD EMAIL ERROR:",
          error
        )

        throw new Error(
          error.message ||
          "Failed to send reset email"
        )
      }

      console.log(
        "📧 RESET EMAIL SENT:",
        {
          email:
            user.email,

          resendId:
            data?.id ||
            null
        }
      )

      res.json({
        message:
          "If that email exists, a reset link was sent."
      })
    } catch (err) {
      console.error(
        "❌ FORGOT PASSWORD ERROR:",
        err
      )

      res.status(500).json({
        message:
          "Failed to send reset email",

        error:
          err?.message ||
          "Unknown error"
      })
    }
  }
)

/* ================= RESET PASSWORD ================= */

router.post(
  "/reset-password/:token",
  async (req, res) => {
    try {
      const {
        token
      } = req.params

      const {
        password
      } = req.body || {}

      if (!password) {
        return res.status(400).json({
          message:
            "Password required"
        })
      }

      if (
        password.length < 6
      ) {
        return res.status(400).json({
          message:
            "Password must be at least 6 characters"
        })
      }

      const hashedToken =
        crypto
          .createHash("sha256")
          .update(token)
          .digest("hex")

      const user =
        await User.findOne({
          resetPasswordToken:
            hashedToken,

          resetPasswordExpire: {
            $gt:
              Date.now()
          }
        })

      if (!user) {
        return res.status(400).json({
          message:
            "Invalid or expired token"
        })
      }

      user.password =
        await bcrypt.hash(
          password,
          10
        )

      user.resetPasswordToken =
        undefined

      user.resetPasswordExpire =
        undefined

      await user.save()

      console.log(
        "🔐 PASSWORD RESET SUCCESS:",
        user.email
      )

      res.json({
        message:
          "Password reset successful"
      })
    } catch (err) {
      console.error(
        "❌ RESET PASSWORD ERROR:",
        err
      )

      res.status(500).json({
        message:
          "Reset failed"
      })
    }
  }
)

export default router