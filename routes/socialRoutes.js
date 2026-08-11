import express from "express"
import multer from "multer"
import fs from "fs"

import cloudinary from "../utils/cloudinary.js"

import {
  getTikTokAuth,
  isTikTokConnected
} from "../utils/tiktokAuthStore.js"

const router = express.Router()

/* =========================================================
   UPLOAD
========================================================= */

const upload = multer({
  dest: "temp/",

  limits: {
    fileSize: 15 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ]

    if (
      !allowedTypes.includes(
        file.mimetype
      )
    ) {
      return cb(
        new Error(
          "Social post must use a JPG, PNG, or WEBP image."
        )
      )
    }

    cb(null, true)
  }
})

/* =========================================================
   HELPERS
========================================================= */

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  )

const isExpired = (
  expiresAt
) => {
  if (!expiresAt) {
    return false
  }

  const expiration =
    new Date(
      expiresAt
    ).getTime()

  if (
    Number.isNaN(
      expiration
    )
  ) {
    return false
  }

  return Date.now() >= expiration
}

/* =========================================================
   GENERIC JSON REQUEST

   Important:
   TikTok can return HTTP 200 while still returning an
   application-level error inside:
       error.code
       error.message
========================================================= */

async function requestJson(
  url,
  options = {},
  {
    platform = "API",
    inspectTikTokError = false
  } = {}
) {
  const response =
    await fetch(
      url,
      options
    )

  const raw =
    await response.text()

  let data = {}

  try {
    data =
      raw
        ? JSON.parse(raw)
        : {}
  } catch {
    data = {
      raw
    }
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `${platform} request failed with HTTP ${response.status}.`

    const error =
      new Error(message)

    error.status =
      response.status

    error.code =
      data?.error?.code ||
      null

    error.data =
      data

    throw error
  }

  /*
   * TikTok APIs frequently return:
   *
   * {
   *   data: {...},
   *   error: {
   *     code: "...",
   *     message: "...",
   *     log_id: "..."
   *   }
   * }
   *
   * even with HTTP 200.
   */

  if (
    inspectTikTokError &&
    data?.error?.code &&
    data.error.code !== "ok"
  ) {
    const error =
      new Error(
        data.error.message ||
        data.error.code ||
        "TikTok API request failed."
      )

    error.status =
      response.status

    error.code =
      data.error.code

    error.logId =
      data.error.log_id ||
      null

    error.data =
      data

    throw error
  }

  return data
}

/* =========================================================
   SOCIAL STATUS
   GET /api/social/status
========================================================= */

router.get(
  "/status",
  async (req, res) => {
    const tiktokAuth =
      getTikTokAuth()

    const tiktokConfigured =
      Boolean(
        process.env
          .TIKTOK_CLIENT_KEY &&
        process.env
          .TIKTOK_CLIENT_SECRET &&
        process.env
          .TIKTOK_REDIRECT_URI
      )

    const tiktokConnected =
      isTikTokConnected() &&
      !isExpired(
        tiktokAuth.expiresAt
      )

    return res.json({
      success: true,

      platforms: {
        instagram: {
          configured:
            Boolean(
              process.env
                .INSTAGRAM_ACCESS_TOKEN
            )
        },

        facebook: {
          configured:
            Boolean(
              process.env
                .FACEBOOK_PAGE_ID &&
              process.env
                .FACEBOOK_PAGE_ACCESS_TOKEN
            )
        },

        tiktok: {
          configured:
            tiktokConfigured,

          connected:
            tiktokConnected,

          openId:
            tiktokAuth.openId ||
            null,

          scopes:
            tiktokAuth.scopes ||
            [],

          expiresAt:
            tiktokAuth.expiresAt ||
            null
        }
      }
    })
  }
)

/* =========================================================
   INSTAGRAM PUBLISHER
========================================================= */

async function publishInstagram({
  imageUrl,
  caption
}) {
  const token =
    process.env
      .INSTAGRAM_ACCESS_TOKEN

  if (!token) {
    throw new Error(
      "Instagram is not configured."
    )
  }

  /* ---------- PROFILE ---------- */

  const profileUrl =
    new URL(
      "https://graph.instagram.com/me"
    )

  profileUrl.searchParams.set(
    "fields",
    "id,username"
  )

  profileUrl.searchParams.set(
    "access_token",
    token
  )

  const profile =
    await requestJson(
      profileUrl,
      {},
      {
        platform:
          "Instagram"
      }
    )

  if (!profile?.id) {
    throw new Error(
      "Instagram account ID was not returned."
    )
  }

  console.log(
    "📸 Instagram account:",
    profile.username
  )

  /* ---------- CREATE MEDIA ---------- */

  const createBody =
    new URLSearchParams()

  createBody.set(
    "image_url",
    imageUrl
  )

  if (caption) {
    createBody.set(
      "caption",
      caption
    )
  }

  createBody.set(
    "access_token",
    token
  )

  const container =
    await requestJson(
      `https://graph.instagram.com/${profile.id}/media`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          createBody.toString()
      },
      {
        platform:
          "Instagram"
      }
    )

  if (!container?.id) {
    throw new Error(
      "Instagram did not create a media container."
    )
  }

  console.log(
    "✅ Instagram container:",
    container.id
  )

  /* ---------- WAIT ---------- */

  let ready = false

  for (
    let attempt = 1;
    attempt <= 20;
    attempt++
  ) {
    const statusUrl =
      new URL(
        `https://graph.instagram.com/${container.id}`
      )

    statusUrl.searchParams.set(
      "fields",
      "status_code,status"
    )

    statusUrl.searchParams.set(
      "access_token",
      token
    )

    const status =
      await requestJson(
        statusUrl,
        {},
        {
          platform:
            "Instagram"
        }
      )

    console.log(
      `⏳ Instagram status ${attempt}/20:`,
      status.status_code
    )

    if (
      status.status_code ===
      "FINISHED"
    ) {
      ready = true
      break
    }

    if (
      status.status_code ===
        "ERROR" ||
      status.status_code ===
        "EXPIRED"
    ) {
      throw new Error(
        status.status ||
        "Instagram media processing failed."
      )
    }

    await sleep(2000)
  }

  if (!ready) {
    throw new Error(
      "Instagram media did not finish processing."
    )
  }

  /* ---------- PUBLISH ---------- */

  const publishBody =
    new URLSearchParams()

  publishBody.set(
    "creation_id",
    container.id
  )

  publishBody.set(
    "access_token",
    token
  )

  const published =
    await requestJson(
      `https://graph.instagram.com/${profile.id}/media_publish`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          publishBody.toString()
      },
      {
        platform:
          "Instagram"
      }
    )

  return {
    success: true,

    postId:
      published.id,

    username:
      profile.username
  }
}

/* =========================================================
   FACEBOOK PUBLISHER
========================================================= */

async function publishFacebook({
  imageUrl,
  caption
}) {
  const pageId =
    process.env
      .FACEBOOK_PAGE_ID

  const token =
    process.env
      .FACEBOOK_PAGE_ACCESS_TOKEN

  if (
    !pageId ||
    !token
  ) {
    throw new Error(
      "Facebook Page is not configured."
    )
  }

  const body =
    new URLSearchParams()

  body.set(
    "url",
    imageUrl
  )

  body.set(
    "published",
    "true"
  )

  if (caption) {
    body.set(
      "message",
      caption
    )
  }

  body.set(
    "access_token",
    token
  )

  const result =
    await requestJson(
      `https://graph.facebook.com/v23.0/${pageId}/photos`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          body.toString()
      },
      {
        platform:
          "Facebook"
      }
    )

  return {
    success: true,

    postId:
      result.post_id ||
      result.id
  }
}

/* =========================================================
   GET TIKTOK ACCESS TOKEN
========================================================= */

function getTikTokToken() {
  const auth =
    getTikTokAuth()

  if (
    !auth.accessToken
  ) {
    throw new Error(
      "TikTok is not connected."
    )
  }

  if (
    isExpired(
      auth.expiresAt
    )
  ) {
    throw new Error(
      "TikTok access token has expired. Reconnect TikTok."
    )
  }

  return {
    token:
      auth.accessToken,

    auth
  }
}

/* =========================================================
   TIKTOK CREATOR INFO
========================================================= */

async function getTikTokCreatorInfo() {
  const {
    token
  } =
    getTikTokToken()

  console.log(
    "🎵 Loading TikTok creator info..."
  )

  const response =
    await requestJson(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json; charset=UTF-8"
        },

        body:
          JSON.stringify({})
      },
      {
        platform:
          "TikTok",

        inspectTikTokError:
          true
      }
    )

  const creator =
    response?.data

  if (!creator) {
    throw new Error(
      "TikTok creator information was not returned."
    )
  }

  console.log(
    "✅ TikTok creator:",
    {
      username:
        creator.creator_username ||
        null,

      privacyOptions:
        creator
          .privacy_level_options ||
        [],

      commentsDisabled:
        creator.comment_disabled,

      duetDisabled:
        creator.duet_disabled,

      stitchDisabled:
        creator.stitch_disabled
    }
  )

  return creator
}

/* =========================================================
   FRIENDLY TIKTOK ERROR
========================================================= */

function getTikTokFriendlyError(
  error
) {
  const code =
    error?.code ||
    error?.data
      ?.error
      ?.code ||
    ""

  const original =
    error?.message ||
    "TikTok publishing failed."

  switch (code) {
    case "url_ownership_unverified":
      return (
        "TikTok rejected the image URL because its domain is not verified. " +
        "Photo posts must use an image hosted on a TikTok-verified domain or URL prefix."
      )

    case "scope_not_authorized":
      return (
        "TikTok authorization is missing the required publishing permission. " +
        "Reconnect TikTok and approve video.publish."
      )

    case "access_token_invalid":
      return (
        "The TikTok access token is invalid or expired. Reconnect TikTok."
      )

    case "spam_risk_user_banned_from_posting":
      return (
        "TikTok has temporarily blocked posting for this account."
      )

    case "rate_limit_exceeded":
      return (
        "TikTok's posting rate limit was reached. Try again later."
      )

    default:
      return original
  }
}

/* =========================================================
   TIKTOK PHOTO PUBLISHER
========================================================= */

async function publishTikTok({
  imageUrl,
  caption,
  privacyLevel
}) {
  const {
    token,
    auth
  } =
    getTikTokToken()

  console.log(
    "🎵 TikTok authenticated:",
    {
      openId:
        auth.openId,

      scopes:
        auth.scopes
    }
  )

  /* ---------- SCOPE ---------- */

  if (
    !auth.scopes?.includes(
      "video.publish"
    )
  ) {
    throw new Error(
      "TikTok connection does not have the video.publish permission."
    )
  }

  /* ---------- CREATOR INFO ---------- */

  const creator =
    await getTikTokCreatorInfo()

  const availablePrivacy =
    Array.isArray(
      creator
        ?.privacy_level_options
    )
      ? creator
          .privacy_level_options
      : []

  console.log(
    "🎵 TikTok privacy options:",
    availablePrivacy
  )

  /* =====================================================
     PRIVACY

     Sandbox / unaudited clients should use SELF_ONLY.
  ===================================================== */

  let privacy =
    String(
      privacyLevel || ""
    ).trim()

  if (
    !privacy ||
    !availablePrivacy.includes(
      privacy
    )
  ) {
    if (
      availablePrivacy.includes(
        "SELF_ONLY"
      )
    ) {
      privacy =
        "SELF_ONLY"
    } else {
      privacy =
        availablePrivacy[0] ||
        ""
    }
  }

  if (!privacy) {
    throw new Error(
      "TikTok did not return an available privacy option."
    )
  }

  /*
   * Make sandbox behavior explicit.
   */

  if (
    process.env
      .TIKTOK_FORCE_PRIVATE ===
      "true" &&
    availablePrivacy.includes(
      "SELF_ONLY"
    )
  ) {
    privacy =
      "SELF_ONLY"
  }

  /* ---------- CAPTION ---------- */

  const cleanCaption =
    String(
      caption || ""
    ).trim()

  /* ---------- IMAGE URL ---------- */

  if (!imageUrl) {
    throw new Error(
      "TikTok image URL is missing."
    )
  }

  console.log(
    "🎵 TikTok media URL:",
    imageUrl
  )

  /* =====================================================
     PAYLOAD
  ===================================================== */

  const payload = {
    media_type:
      "PHOTO",

    post_mode:
      "DIRECT_POST",

    post_info: {
      title:
        cleanCaption
          .slice(
            0,
            90
          ),

      description:
        cleanCaption,

      privacy_level:
        privacy,

      disable_comment:
        Boolean(
          creator
            ?.comment_disabled
        ),

      auto_add_music:
        true
    },

    source_info: {
      source:
        "PULL_FROM_URL",

      photo_cover_index:
        0,

      photo_images: [
        imageUrl
      ]
    }
  }

  console.log(
    "🎵 TikTok publish payload:",
    {
      media_type:
        payload.media_type,

      post_mode:
        payload.post_mode,

      privacy_level:
        payload
          .post_info
          .privacy_level,

      imageUrl
    }
  )

  /* ---------- POST ---------- */

  let result

  try {
    result =
      await requestJson(
        "https://open.tiktokapis.com/v2/post/publish/content/init/",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json; charset=UTF-8"
          },

          body:
            JSON.stringify(
              payload
            )
        },
        {
          platform:
            "TikTok",

          inspectTikTokError:
            true
        }
      )
  } catch (error) {
    console.error(
      "❌ TIKTOK API ERROR:",
      {
        status:
          error.status,

        code:
          error.code,

        message:
          error.message,

        logId:
          error.logId,

        data:
          error.data
      }
    )

    const friendly =
      new Error(
        getTikTokFriendlyError(
          error
        )
      )

    friendly.code =
      error.code

    friendly.status =
      error.status

    friendly.logId =
      error.logId

    friendly.data =
      error.data

    throw friendly
  }

  const publishId =
    result?.data
      ?.publish_id

  if (!publishId) {
    const error =
      new Error(
        "TikTok accepted the request but did not return a publish ID."
      )

    error.data =
      result

    throw error
  }

  console.log(
    "✅ TikTok publish initialized:",
    publishId
  )

  return {
    success: true,

    publishId,

    username:
      creator
        ?.creator_username ||
      null,

    privacyLevel:
      privacy,

    status:
      "PROCESSING"
  }
}

/* =========================================================
   SOCIAL PUBLISH
   POST /api/social/publish
========================================================= */

router.post(
  "/publish",
  upload.single("image"),
  async (req, res) => {
    try {
      /* ---------- FILE ---------- */

      if (!req.file) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Choose an image first."
          })
      }

      /* ---------- CAPTION ---------- */

      const caption =
        String(
          req.body
            ?.caption ||
          ""
        ).trim()

      /* ---------- FLAGS ---------- */

      const publishInstagramFlag =
        req.body.instagram ===
        "true"

      const publishFacebookFlag =
        req.body.facebook ===
        "true"

      const publishTikTokFlag =
        req.body.tiktok ===
        "true"

      if (
        !publishInstagramFlag &&
        !publishFacebookFlag &&
        !publishTikTokFlag
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Select at least one social platform."
          })
      }

      console.log(
        "🌐 SOCIAL PUBLISH REQUEST:",
        {
          instagram:
            publishInstagramFlag,

          facebook:
            publishFacebookFlag,

          tiktok:
            publishTikTokFlag
        }
      )

      /* =====================================================
         CLOUDINARY
      ===================================================== */

      console.log(
        "📤 Uploading social image..."
      )

      const uploaded =
        await cloudinary
          .uploader
          .upload(
            req.file.path,
            {
              folder:
                "signavi-social",

              resource_type:
                "image"
            }
          )

      const imageUrl =
        uploaded.secure_url

      console.log(
        "✅ Social image uploaded:",
        imageUrl
      )

      const results = {}

      /* =====================================================
         INSTAGRAM
      ===================================================== */

      if (
        publishInstagramFlag
      ) {
        try {
          console.log(
            "📸 Publishing Instagram..."
          )

          results.instagram =
            await publishInstagram({
              imageUrl,
              caption
            })

          console.log(
            "✅ Instagram published"
          )
        } catch (error) {
          console.error(
            "❌ Instagram failed:",
            error.data ||
            error.message
          )

          results.instagram = {
            success: false,

            message:
              error.message,

            code:
              error.code ||
              null,

            details:
              error.data ||
              undefined
          }
        }
      }

      /* =====================================================
         FACEBOOK
      ===================================================== */

      if (
        publishFacebookFlag
      ) {
        try {
          console.log(
            "📘 Publishing Facebook..."
          )

          results.facebook =
            await publishFacebook({
              imageUrl,
              caption
            })

          console.log(
            "✅ Facebook published"
          )
        } catch (error) {
          console.error(
            "❌ Facebook failed:",
            error.data ||
            error.message
          )

          results.facebook = {
            success: false,

            message:
              error.message,

            code:
              error.code ||
              null,

            details:
              error.data ||
              undefined
          }
        }
      }

      /* =====================================================
         TIKTOK
      ===================================================== */

      if (
        publishTikTokFlag
      ) {
        try {
          console.log(
            "🎵 Publishing TikTok..."
          )

          results.tiktok =
            await publishTikTok({
              imageUrl,
              caption,

              privacyLevel:
                req.body
                  ?.tiktokPrivacy
            })

          console.log(
            "✅ TikTok publish initialized"
          )
        } catch (error) {
          console.error(
            "❌ TikTok failed:",
            {
              message:
                error.message,

              code:
                error.code,

              status:
                error.status,

              logId:
                error.logId,

              data:
                error.data
            }
          )

          results.tiktok = {
            success: false,

            message:
              error.message,

            code:
              error.code ||
              error
                ?.data
                ?.error
                ?.code ||
              null,

            logId:
              error.logId ||
              error
                ?.data
                ?.error
                ?.log_id ||
              null,

            details:
              error.data ||
              undefined
          }
        }
      }

      /* =====================================================
         SUMMARY
      ===================================================== */

      const values =
        Object.values(
          results
        )

      const successful =
        values.filter(
          (item) =>
            item?.success
        )

      const complete =
        values.length > 0 &&
        successful.length ===
          values.length

      return res.json({
        success:
          successful.length > 0,

        complete,

        imageUrl,

        results
      })
    } catch (error) {
      console.error(
        "❌ SOCIAL PUBLISH ERROR:",
        error
      )

      return res
        .status(500)
        .json({
          success: false,

          message:
            error.message ||
            "Unable to publish social post."
        })
    } finally {
      /* ---------- CLEAN LOCAL FILE ---------- */

      if (
        req.file?.path &&
        fs.existsSync(
          req.file.path
        )
      ) {
        try {
          fs.unlinkSync(
            req.file.path
          )
        } catch (error) {
          console.warn(
            "⚠️ Unable to delete temporary upload:",
            error.message
          )
        }
      }
    }
  }
)

export default router