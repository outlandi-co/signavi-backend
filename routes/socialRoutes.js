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
    fileSize:
      15 * 1024 * 1024
  },

  fileFilter: (
    req,
    file,
    cb
  ) => {
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
  new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  )

async function requestJson(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      options
    )

  const data =
    await response
      .json()
      .catch(() => ({}))

  if (!response.ok) {
    const error =
      new Error(
        data?.error?.message ||
        data?.message ||
        "API request failed"
      )

    error.status =
      response.status

    error.data =
      data

    throw error
  }

  return data
}

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

  return (
    Date.now() >=
    expiration
  )
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

  profileUrl
    .searchParams
    .set(
      "fields",
      "id,username"
    )

  profileUrl
    .searchParams
    .set(
      "access_token",
      token
    )

  const profile =
    await requestJson(
      profileUrl
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

  /* ---------- CREATE MEDIA CONTAINER ---------- */

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

  /* ---------- WAIT FOR PROCESSING ---------- */

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

    statusUrl
      .searchParams
      .set(
        "fields",
        "status_code,status"
      )

    statusUrl
      .searchParams
      .set(
        "access_token",
        token
      )

    const status =
      await requestJson(
        statusUrl
      )

    console.log(
      `⏳ Instagram container status ${attempt}/20:`,
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
      }
    )

  console.log(
    "✅ Instagram published:",
    published.id
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
      }
    )

  console.log(
    "✅ Facebook published:",
    result.post_id ||
    result.id
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
  const tiktokAuth =
    getTikTokAuth()

  if (
    !tiktokAuth.accessToken
  ) {
    throw new Error(
      "TikTok is not connected."
    )
  }

  if (
    isExpired(
      tiktokAuth.expiresAt
    )
  ) {
    throw new Error(
      "TikTok access token has expired. Reconnect or refresh TikTok."
    )
  }

  return {
    token:
      tiktokAuth.accessToken,

    auth:
      tiktokAuth
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
      }
    )

  if (
    response?.error?.code &&
    response.error.code !==
      "ok"
  ) {
    const error =
      new Error(
        response.error.message ||
        response.error.code ||
        "TikTok creator info failed."
      )

    error.data =
      response

    throw error
  }

  const creator =
    response?.data

  if (!creator) {
    throw new Error(
      "TikTok creator information was not returned."
    )
  }

  console.log(
    "✅ TikTok creator:",
    creator.creator_username ||
    "connected account"
  )

  return creator
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
    "🎵 TikTok connected:",
    {
      openId:
        auth.openId,

      scopes:
        auth.scopes
    }
  )

  /* ---------- CHECK SCOPE ---------- */

  if (
    !auth.scopes
      ?.includes(
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
    creator
      ?.privacy_level_options ||
    []

  console.log(
    "🎵 TikTok privacy options:",
    availablePrivacy
  )

  let privacy =
    privacyLevel

  /*
   * Sandbox / unaudited TikTok apps commonly
   * require SELF_ONLY.
   */
  if (
    !privacy ||
    !availablePrivacy.includes(
      privacy
    )
  ) {
    privacy =
      availablePrivacy.includes(
        "SELF_ONLY"
      )
        ? "SELF_ONLY"
        : availablePrivacy[0]
  }

  if (!privacy) {
    throw new Error(
      "TikTok did not return an available privacy option."
    )
  }

  /* ---------- POST DATA ---------- */

  const cleanCaption =
    String(
      caption || ""
    ).trim()

  const payload = {
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
        false,

      brand_content_toggle:
        false,

      brand_organic_toggle:
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
    },

    post_mode:
      "DIRECT_POST",

    media_type:
      "PHOTO"
  }

  console.log(
    "🎵 Sending TikTok photo post..."
  )

  const result =
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
      }
    )

  if (
    result?.error?.code &&
    result.error.code !==
      "ok"
  ) {
    const error =
      new Error(
        result.error.message ||
        result.error.code ||
        "TikTok publish failed."
      )

    error.data =
      result

    throw error
  }

  const publishId =
    result?.data
      ?.publish_id

  if (!publishId) {
    throw new Error(
      "TikTok accepted the request but did not return a publish ID."
    )
  }

  console.log(
    "✅ TikTok publish request accepted:",
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
      privacy
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
    let uploadedPublicId =
      null

    try {
      /* ---------- IMAGE ---------- */

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

      /* ---------- PLATFORM FLAGS ---------- */

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
         CLOUDINARY UPLOAD
      ===================================================== */

      console.log(
        "📤 Uploading social media image..."
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

      uploadedPublicId =
        uploaded.public_id

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
            "📸 Publishing to Instagram..."
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
            "❌ Instagram publish failed:",
            error.data ||
            error.message
          )

          results.instagram = {
            success: false,

            message:
              error.message,

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
            "📘 Publishing to Facebook..."
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
            "❌ Facebook publish failed:",
            error.data ||
            error.message
          )

          results.facebook = {
            success: false,

            message:
              error.message,

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
            "🎵 Publishing to TikTok..."
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
            "✅ TikTok publish request accepted"
          )
        } catch (error) {
          console.error(
            "❌ TikTok publish failed:",
            error.data ||
            error.message
          )

          results.tiktok = {
            success: false,

            message:
              error.message,

            details:
              error.data ||
              undefined
          }
        }
      }

      /* =====================================================
         RESULT SUMMARY
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

      const failed =
        values.filter(
          (item) =>
            !item?.success
        )

      const complete =
        values.length > 0 &&
        successful.length ===
          values.length

      const anySuccessful =
        successful.length > 0

      console.log(
        "🌐 SOCIAL PUBLISH COMPLETE:",
        {
          total:
            values.length,

          successful:
            successful.length,

          failed:
            failed.length
        }
      )

      return res.json({
        success:
          anySuccessful,

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
      /* ---------- DELETE LOCAL TEMP FILE ---------- */

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

      /*
       * IMPORTANT:
       *
       * Do NOT immediately delete the Cloudinary image here.
       *
       * Instagram and TikTok retrieve the media remotely
       * after receiving the URL. Removing the Cloudinary
       * image too early can cause media processing failures.
       */
    }
  }
)

export default router