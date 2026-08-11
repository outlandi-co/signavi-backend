import express from "express"
import crypto from "crypto"

import {
  getTikTokAuth,
  setTikTokAuth,
  clearTikTokAuth
} from "../utils/tiktokAuthStore.js"

const router = express.Router()

/* =========================================================
   CONFIG
========================================================= */

const TIKTOK_CLIENT_KEY =
  process.env.TIKTOK_CLIENT_KEY || ""

const TIKTOK_CLIENT_SECRET =
  process.env.TIKTOK_CLIENT_SECRET || ""

const TIKTOK_REDIRECT_URI =
  process.env.TIKTOK_REDIRECT_URI ||
  "https://signavi-backend.onrender.com/api/tiktok/callback"

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "https://signavistudio.store"

/* =========================================================
   HELPERS
========================================================= */

const ensureTikTokConfig = (res) => {
  if (
    !TIKTOK_CLIENT_KEY ||
    !TIKTOK_CLIENT_SECRET ||
    !TIKTOK_REDIRECT_URI
  ) {
    res.status(500).json({
      success: false,
      message:
        "TikTok environment variables are not configured."
    })

    return false
  }

  return true
}

const generateState = () => {
  return crypto
    .randomBytes(24)
    .toString("hex")
}

const normalizeScopes = (
  value = ""
) => {
  return String(value)
    .split(",")
    .map((scope) =>
      scope.trim()
    )
    .filter(Boolean)
}

const calculateExpiresAt = (
  expiresIn
) => {
  const seconds =
    Number(expiresIn || 0)

  if (!seconds) {
    return null
  }

  return new Date(
    Date.now() +
    seconds * 1000
  ).toISOString()
}

/* =========================================================
   STATUS
   GET /api/tiktok/status
========================================================= */

router.get(
  "/status",
  (req, res) => {
    const tiktokAuth =
      getTikTokAuth()

    res.json({
      success: true,

      configured: Boolean(
        TIKTOK_CLIENT_KEY &&
        TIKTOK_CLIENT_SECRET &&
        TIKTOK_REDIRECT_URI
      ),

      connected: Boolean(
        tiktokAuth.accessToken
      ),

      openId:
        tiktokAuth.openId ||
        null,

      scopes:
        tiktokAuth.scopes ||
        [],

      expiresAt:
        tiktokAuth.expiresAt ||
        null
    })
  }
)

/* =========================================================
   LOGIN
   GET /api/tiktok/login
========================================================= */

router.get(
  "/login",
  (req, res) => {
    if (
      !ensureTikTokConfig(res)
    ) {
      return
    }

    const state =
      generateState()

    /*
     * Keep OAuth state in an HTTP-only cookie.
     * TikTok returns it to the callback.
     */
    res.cookie(
      "tiktok_oauth_state",
      state,
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge:
          10 * 60 * 1000
      }
    )

    const scopes = [
      "user.info.basic",
      "video.publish",
      "video.upload"
    ].join(",")

    const params =
      new URLSearchParams({
        client_key:
          TIKTOK_CLIENT_KEY,

        scope:
          scopes,

        response_type:
          "code",

        redirect_uri:
          TIKTOK_REDIRECT_URI,

        state
      })

    const authUrl =
      `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`

    console.log(
      "🎵 TikTok OAuth redirect ready"
    )

    return res.redirect(
      authUrl
    )
  }
)

/* =========================================================
   CALLBACK
   GET /api/tiktok/callback
========================================================= */

router.get(
  "/callback",
  async (req, res) => {
    if (
      !ensureTikTokConfig(res)
    ) {
      return
    }

    try {
      const {
        code,
        state,
        error,
        error_description:
          errorDescription
      } = req.query

      /* ---------- TIKTOK ERROR ---------- */

      if (error) {
        console.error(
          "❌ TIKTOK AUTH ERROR:",
          {
            error,
            errorDescription
          }
        )

        return res.redirect(
          `${FRONTEND_URL}/admin/instagram?tiktok=error`
        )
      }

      /* ---------- STATE ---------- */

      const expectedState =
        req.cookies
          ?.tiktok_oauth_state

      if (
        !state ||
        !expectedState ||
        state !== expectedState
      ) {
        console.error(
          "❌ TIKTOK OAUTH STATE MISMATCH"
        )

        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid TikTok OAuth state."
          })
      }

      res.clearCookie(
        "tiktok_oauth_state"
      )

      /* ---------- CODE ---------- */

      if (!code) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "TikTok authorization code missing."
          })
      }

      console.log(
        "🎵 TikTok authorization code received"
      )

      /* ---------- TOKEN EXCHANGE ---------- */

      const body =
        new URLSearchParams({
          client_key:
            TIKTOK_CLIENT_KEY,

          client_secret:
            TIKTOK_CLIENT_SECRET,

          code:
            String(code),

          grant_type:
            "authorization_code",

          redirect_uri:
            TIKTOK_REDIRECT_URI
        })

      const tokenResponse =
        await fetch(
          "https://open.tiktokapis.com/v2/oauth/token/",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              body.toString()
          }
        )

      const tokenData =
        await tokenResponse
          .json()
          .catch(() => ({}))

      console.log(
        "🎵 TikTok token response status:",
        tokenResponse.status
      )

      if (
        !tokenResponse.ok ||
        !tokenData
          ?.access_token
      ) {
        console.error(
          "❌ TIKTOK TOKEN ERROR:",
          tokenData
        )

        return res
          .status(
            tokenResponse.status ||
            500
          )
          .json({
            success: false,
            message:
              "TikTok token exchange failed.",
            error:
              tokenData
          })
      }

      /* ---------- SAVE TOKEN ---------- */

      const tiktokAuth =
        setTikTokAuth({
          accessToken:
            tokenData.access_token,

          refreshToken:
            tokenData.refresh_token ||
            "",

          openId:
            tokenData.open_id ||
            "",

          scopes:
            normalizeScopes(
              tokenData.scope
            ),

          expiresAt:
            calculateExpiresAt(
              tokenData.expires_in
            )
        })

      console.log(
        "✅ TikTok connected:",
        {
          openId:
            tiktokAuth.openId,

          scopes:
            tiktokAuth.scopes,

          expiresAt:
            tiktokAuth.expiresAt
        }
      )

      return res.redirect(
        `${FRONTEND_URL}/admin/instagram?tiktok=connected`
      )
    } catch (err) {
      console.error(
        "❌ TIKTOK CALLBACK ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            "TikTok callback failed.",
          error:
            err.message
        })
    }
  }
)

/* =========================================================
   REFRESH TOKEN
   POST /api/tiktok/refresh
========================================================= */

router.post(
  "/refresh",
  async (req, res) => {
    if (
      !ensureTikTokConfig(res)
    ) {
      return
    }

    try {
      const currentAuth =
        getTikTokAuth()

      if (
        !currentAuth
          .refreshToken
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "No TikTok refresh token available."
          })
      }

      const body =
        new URLSearchParams({
          client_key:
            TIKTOK_CLIENT_KEY,

          client_secret:
            TIKTOK_CLIENT_SECRET,

          grant_type:
            "refresh_token",

          refresh_token:
            currentAuth
              .refreshToken
        })

      const response =
        await fetch(
          "https://open.tiktokapis.com/v2/oauth/token/",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              body.toString()
          }
        )

      const data =
        await response
          .json()
          .catch(() => ({}))

      if (
        !response.ok ||
        !data?.access_token
      ) {
        console.error(
          "❌ TIKTOK REFRESH ERROR:",
          data
        )

        return res
          .status(
            response.status ||
            500
          )
          .json({
            success: false,
            message:
              "TikTok token refresh failed.",
            error:
              data
          })
      }

      const tiktokAuth =
        setTikTokAuth({
          accessToken:
            data.access_token,

          refreshToken:
            data.refresh_token ||
            currentAuth.refreshToken,

          openId:
            data.open_id ||
            currentAuth.openId,

          scopes:
            normalizeScopes(
              data.scope ||
              currentAuth
                .scopes
                .join(",")
            ),

          expiresAt:
            calculateExpiresAt(
              data.expires_in
            )
        })

      console.log(
        "✅ TikTok token refreshed"
      )

      return res.json({
        success: true,

        connected: true,

        openId:
          tiktokAuth.openId,

        scopes:
          tiktokAuth.scopes,

        expiresAt:
          tiktokAuth.expiresAt
      })
    } catch (err) {
      console.error(
        "❌ TIKTOK REFRESH ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            "TikTok refresh failed.",
          error:
            err.message
        })
    }
  }
)

/* =========================================================
   CREATOR INFO
   GET /api/tiktok/creator-info
========================================================= */

router.get(
  "/creator-info",
  async (req, res) => {
    try {
      const tiktokAuth =
        getTikTokAuth()

      if (
        !tiktokAuth
          .accessToken
      ) {
        return res
          .status(401)
          .json({
            success: false,
            message:
              "TikTok is not connected."
          })
      }

      const response =
        await fetch(
          "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${tiktokAuth.accessToken}`,

              "Content-Type":
                "application/json; charset=UTF-8"
            }
          }
        )

      const data =
        await response
          .json()
          .catch(() => ({}))

      if (
        !response.ok ||
        (
          data?.error?.code &&
          data.error.code !==
            "ok"
        )
      ) {
        console.error(
          "❌ TIKTOK CREATOR INFO ERROR:",
          data
        )

        return res
          .status(
            response.status ||
            500
          )
          .json({
            success: false,
            message:
              "Failed to retrieve TikTok creator info.",
            error:
              data
          })
      }

      return res.json({
        success: true,
        data:
          data.data
      })
    } catch (err) {
      console.error(
        "❌ TIKTOK CREATOR INFO ERROR:",
        err
      )

      return res
        .status(500)
        .json({
          success: false,
          message:
            "TikTok creator info failed.",
          error:
            err.message
        })
    }
  }
)

/* =========================================================
   DISCONNECT
   POST /api/tiktok/disconnect
========================================================= */

router.post(
  "/disconnect",
  (req, res) => {
    clearTikTokAuth()

    console.log(
      "🎵 TikTok disconnected"
    )

    return res.json({
      success: true,
      message:
        "TikTok disconnected."
    })
  }
)

export default router