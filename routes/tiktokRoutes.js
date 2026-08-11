import express from "express"
import crypto from "crypto"

const router = express.Router()

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
   TEMP TOKEN STORAGE
   =========================================================

   This is okay for the first sandbox connection test.

   IMPORTANT:
   Render can restart at any time, so this should eventually
   move into MongoDB so the TikTok refresh token persists.
========================================================= */

let tiktokAuth = {
  accessToken: "",
  refreshToken: "",
  openId: "",
  scopes: [],
  expiresAt: null
}

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
  return crypto.randomBytes(24).toString("hex")
}

/* =========================================================
   STATUS
   GET /api/tiktok/status
========================================================= */

router.get("/status", (req, res) => {
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
      tiktokAuth.openId || null,

    scopes:
      tiktokAuth.scopes || [],

    expiresAt:
      tiktokAuth.expiresAt || null
  })
})

/* =========================================================
   LOGIN
   GET /api/tiktok/login
========================================================= */

router.get("/login", (req, res) => {
  if (!ensureTikTokConfig(res)) return

  const state = generateState()

  const scopes = [
    "user.info.basic",
    "video.publish",
    "video.upload"
  ].join(",")

  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    scope: scopes,
    response_type: "code",
    redirect_uri: TIKTOK_REDIRECT_URI,
    state
  })

  const authUrl =
    `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`

  console.log(
    "🎵 TikTok OAuth redirect:",
    authUrl
  )

  res.redirect(authUrl)
})

/* =========================================================
   CALLBACK
   GET /api/tiktok/callback
========================================================= */

router.get(
  "/callback",
  async (req, res) => {
    if (!ensureTikTokConfig(res)) return

    try {
      const {
        code,
        error,
        error_description: errorDescription
      } = req.query

      if (error) {
        console.error(
          "❌ TIKTOK AUTH ERROR:",
          {
            error,
            errorDescription
          }
        )

        return res.redirect(
          `${FRONTEND_URL}/admin/marketing?tiktok=error`
        )
      }

      if (!code) {
        return res.status(400).json({
          success: false,
          message:
            "TikTok authorization code missing."
        })
      }

      console.log(
        "🎵 TikTok authorization code received"
      )

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

            body
          }
        )

      const tokenData =
        await tokenResponse.json()

      console.log(
        "🎵 TikTok token response status:",
        tokenResponse.status
      )

      if (
        !tokenResponse.ok ||
        !tokenData?.access_token
      ) {
        console.error(
          "❌ TIKTOK TOKEN ERROR:",
          tokenData
        )

        return res.status(
          tokenResponse.status || 500
        ).json({
          success: false,
          message:
            "TikTok token exchange failed.",
          error:
            tokenData
        })
      }

      const expiresIn =
        Number(
          tokenData.expires_in || 0
        )

      tiktokAuth = {
        accessToken:
          tokenData.access_token,

        refreshToken:
          tokenData.refresh_token || "",

        openId:
          tokenData.open_id || "",

        scopes:
          String(
            tokenData.scope || ""
          )
            .split(",")
            .map((scope) =>
              scope.trim()
            )
            .filter(Boolean),

        expiresAt:
          expiresIn
            ? new Date(
                Date.now() +
                expiresIn * 1000
              ).toISOString()
            : null
      }

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
        `${FRONTEND_URL}/admin/marketing?tiktok=connected`
      )
    } catch (err) {
      console.error(
        "❌ TIKTOK CALLBACK ERROR:",
        err
      )

      return res.status(500).json({
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
    if (!ensureTikTokConfig(res)) return

    try {
      if (!tiktokAuth.refreshToken) {
        return res.status(400).json({
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
            tiktokAuth.refreshToken
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

            body
          }
        )

      const data =
        await response.json()

      if (
        !response.ok ||
        !data?.access_token
      ) {
        console.error(
          "❌ TIKTOK REFRESH ERROR:",
          data
        )

        return res.status(
          response.status || 500
        ).json({
          success: false,
          message:
            "TikTok token refresh failed.",
          error:
            data
        })
      }

      const expiresIn =
        Number(
          data.expires_in || 0
        )

      tiktokAuth = {
        accessToken:
          data.access_token,

        refreshToken:
          data.refresh_token ||
          tiktokAuth.refreshToken,

        openId:
          data.open_id ||
          tiktokAuth.openId,

        scopes:
          String(
            data.scope || ""
          )
            .split(",")
            .map((scope) =>
              scope.trim()
            )
            .filter(Boolean),

        expiresAt:
          expiresIn
            ? new Date(
                Date.now() +
                expiresIn * 1000
              ).toISOString()
            : null
      }

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

      return res.status(500).json({
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

   TikTok requires creator information to be queried
   before Direct Post.
========================================================= */

router.get(
  "/creator-info",
  async (req, res) => {
    try {
      if (!tiktokAuth.accessToken) {
        return res.status(401).json({
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
            },

            body:
              JSON.stringify({})
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        console.error(
          "❌ TIKTOK CREATOR INFO ERROR:",
          data
        )

        return res.status(
          response.status
        ).json({
          success: false,
          message:
            "Failed to retrieve TikTok creator info.",
          error:
            data
        })
      }

      return res.json({
        success: true,
        data
      })
    } catch (err) {
      console.error(
        "❌ TIKTOK CREATOR INFO ERROR:",
        err
      )

      return res.status(500).json({
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
    tiktokAuth = {
      accessToken: "",
      refreshToken: "",
      openId: "",
      scopes: [],
      expiresAt: null
    }

    res.json({
      success: true,
      message:
        "TikTok disconnected."
    })
  }
)

export default router