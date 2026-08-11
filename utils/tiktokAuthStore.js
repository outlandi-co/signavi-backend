/* =========================================================
   TIKTOK AUTH STORE
   utils/tiktokAuthStore.js

   Shared TikTok authentication state used by:
   - tiktokRoutes.js
   - socialRoutes.js
========================================================= */

/* =========================================================
   DEFAULT AUTH STATE
========================================================= */

const createEmptyAuth = () => ({
  accessToken: "",
  refreshToken: "",
  openId: "",
  scopes: [],
  expiresAt: null
})

/* =========================================================
   IN-MEMORY AUTH STORE

   NOTE:
   This works for the current TikTok Sandbox integration.

   Render may restart the Node server, which clears memory.
   Later we can move this into MongoDB so the TikTok
   connection survives deployments and server restarts.
========================================================= */

let tiktokAuth = createEmptyAuth()

/* =========================================================
   GET AUTH
========================================================= */

export const getTikTokAuth = () => {
  return {
    ...tiktokAuth,
    scopes: [
      ...(tiktokAuth.scopes || [])
    ]
  }
}

/* =========================================================
   SET AUTH
========================================================= */

export const setTikTokAuth = ({
  accessToken = "",
  refreshToken = "",
  openId = "",
  scopes = [],
  expiresAt = null
} = {}) => {
  tiktokAuth = {
    accessToken:
      accessToken || "",

    refreshToken:
      refreshToken || "",

    openId:
      openId || "",

    scopes:
      Array.isArray(scopes)
        ? scopes
        : [],

    expiresAt:
      expiresAt || null
  }

  return getTikTokAuth()
}

/* =========================================================
   UPDATE AUTH
========================================================= */

export const updateTikTokAuth = (
  updates = {}
) => {
  tiktokAuth = {
    ...tiktokAuth,
    ...updates
  }

  if (
    !Array.isArray(
      tiktokAuth.scopes
    )
  ) {
    tiktokAuth.scopes = []
  }

  return getTikTokAuth()
}

/* =========================================================
   CLEAR AUTH
========================================================= */

export const clearTikTokAuth = () => {
  tiktokAuth =
    createEmptyAuth()

  return getTikTokAuth()
}

/* =========================================================
   CONNECTION STATUS
========================================================= */

export const isTikTokConnected = () => {
  return Boolean(
    tiktokAuth.accessToken
  )
}

/* =========================================================
   TOKEN EXPIRATION
========================================================= */

export const isTikTokTokenExpired = () => {
  if (
    !tiktokAuth.expiresAt
  ) {
    return false
  }

  const expiration =
    new Date(
      tiktokAuth.expiresAt
    ).getTime()

  if (
    Number.isNaN(expiration)
  ) {
    return false
  }

  return (
    Date.now() >= expiration
  )
}

/* =========================================================
   SAFE STATUS

   Does NOT expose accessToken or refreshToken.
========================================================= */

export const getTikTokStatus = () => {
  return {
    connected:
      isTikTokConnected(),

    openId:
      tiktokAuth.openId ||
      null,

    scopes: [
      ...(tiktokAuth.scopes || [])
    ],

    expiresAt:
      tiktokAuth.expiresAt ||
      null,

    expired:
      isTikTokTokenExpired()
  }
}