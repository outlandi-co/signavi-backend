import express from "express"
import multer from "multer"
import fs from "fs"

import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

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

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Social post must use a JPG, PNG, or WEBP image."
        )
      )
    }

    cb(null, true)
  }
})

const sleep = (ms) =>
  new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  )

/* =========================================================
   GENERIC JSON REQUEST
========================================================= */

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

/* =========================================================
   SOCIAL CONNECTION STATUS
   GET /api/social/status
========================================================= */

router.get(
  "/status",
  async (req, res) => {
    res.json({
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
            Boolean(
              process.env
                .TIKTOK_ACCESS_TOKEN
            )
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

  /* ---------- ACCOUNT ---------- */

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

  /* ---------- CONTAINER ---------- */

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
      `📸 Instagram status ${attempt}/20:`,
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

  return {
    success: true,
    postId:
      published.id,
    username:
      profile.username
  }
}

/* =========================================================
   FACEBOOK PAGE PUBLISHER
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

  return {
    success: true,

    postId:
      result.post_id ||
      result.id
  }
}

/* =========================================================
   TIKTOK CREATOR INFO
========================================================= */

async function getTikTokCreatorInfo() {
  const token =
    process.env
      .TIKTOK_ACCESS_TOKEN

  if (!token) {
    throw new Error(
      "TikTok is not configured."
    )
  }

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
        }
      }
    )

  if (
    response?.error?.code &&
    response.error.code !== "ok"
  ) {
    throw new Error(
      response.error.message ||
      response.error.code
    )
  }

  return response.data
}

/* =========================================================
   TIKTOK PHOTO PUBLISHER
========================================================= */

async function publishTikTok({
  imageUrl,
  caption,
  privacyLevel
}) {
  const token =
    process.env
      .TIKTOK_ACCESS_TOKEN

  if (!token) {
    throw new Error(
      "TikTok is not configured."
    )
  }

  const creator =
    await getTikTokCreatorInfo()

  const availablePrivacy =
    creator
      ?.privacy_level_options ||
    []

  let privacy =
    privacyLevel

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

  const payload = {
    post_info: {
      title:
        caption
          ?.slice(0, 90) ||
        "",

      description:
        caption || "",

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
    result.error.code !== "ok"
  ) {
    throw new Error(
      result.error.message ||
      result.error.code
    )
  }

  return {
    success: true,

    publishId:
      result?.data
        ?.publish_id,

    username:
      creator
        ?.creator_username,

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
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Choose an image first."
          })
      }

      const caption =
        String(
          req.body
            ?.caption ||
          ""
        ).trim()

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

      /* ---------- UPLOAD ONCE ---------- */

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

      const results = {}

      /* ---------- INSTAGRAM ---------- */

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

      /* ---------- FACEBOOK ---------- */

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

      /* ---------- TIKTOK ---------- */

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
                  .tiktokPrivacy
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

      const values =
        Object.values(
          results
        )

      const successful =
        values.filter(
          (item) =>
            item.success
        )

      return res.json({
        success:
          successful.length > 0,

        complete:
          successful.length ===
          values.length,

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
      if (
        req.file?.path &&
        fs.existsSync(
          req.file.path
        )
      ) {
        fs.unlinkSync(
          req.file.path
        )
      }
    }
  }
)

export default router