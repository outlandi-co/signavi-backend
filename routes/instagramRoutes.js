import express from "express"
import multer from "multer"
import fs from "fs"
import cloudinary from "../utils/cloudinary.js"

const router = express.Router()

/* =========================================================
   UPLOAD CONFIG
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

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Instagram post must be a JPG, PNG, or WEBP image."
        )
      )
    }

    cb(null, true)
  }
})

/* =========================================================
   INSTAGRAM REQUEST HELPER
========================================================= */

const instagramRequest = async (
  url,
  options = {}
) => {
  const response = await fetch(
    url,
    options
  )

  const data = await response
    .json()
    .catch(() => ({}))

  if (!response.ok || data?.error) {
    const error = new Error(
      data?.error?.message ||
      "Instagram API request failed"
    )

    error.status =
      response.status || 500

    error.instagram =
      data

    throw error
  }

  return data
}

/* =========================================================
   GET PROFILE
   GET /api/instagram/profile
========================================================= */

router.get(
  "/profile",
  async (req, res) => {
    try {
      const token =
        process.env
          .INSTAGRAM_ACCESS_TOKEN

      if (!token) {
        return res
          .status(500)
          .json({
            message:
              "INSTAGRAM_ACCESS_TOKEN is missing from backend .env"
          })
      }

      const url =
        new URL(
          "https://graph.instagram.com/me"
        )

      url.searchParams.set(
        "fields",
        [
          "id",
          "user_id",
          "username",
          "account_type",
          "profile_picture_url",
          "followers_count",
          "follows_count",
          "media_count"
        ].join(",")
      )

      url.searchParams.set(
        "access_token",
        token
      )

      const profile =
        await instagramRequest(url)

      res.json({
        connected: true,
        profile
      })
    } catch (error) {
      console.error(
        "❌ INSTAGRAM PROFILE ERROR:",
        error.instagram || error
      )

      res
        .status(
          error.status || 500
        )
        .json({
          message:
            "Unable to connect to Instagram",

          error:
            error.message,

          instagram:
            error.instagram ||
            undefined
        })
    }
  }
)

/* =========================================================
   GET MEDIA
   GET /api/instagram/media
========================================================= */

router.get(
  "/media",
  async (req, res) => {
    try {
      const token =
        process.env
          .INSTAGRAM_ACCESS_TOKEN

      if (!token) {
        return res
          .status(500)
          .json({
            message:
              "INSTAGRAM_ACCESS_TOKEN is missing"
          })
      }

      const url =
        new URL(
          "https://graph.instagram.com/me/media"
        )

      url.searchParams.set(
        "fields",
        [
          "id",
          "caption",
          "media_type",
          "media_url",
          "permalink",
          "thumbnail_url",
          "timestamp"
        ].join(",")
      )

      url.searchParams.set(
        "limit",
        "24"
      )

      url.searchParams.set(
        "access_token",
        token
      )

      const data =
        await instagramRequest(url)

      res.json({
        connected: true,

        media:
          data.data || [],

        paging:
          data.paging || null
      })
    } catch (error) {
      console.error(
        "❌ INSTAGRAM MEDIA ERROR:",
        error.instagram || error
      )

      res
        .status(
          error.status || 500
        )
        .json({
          message:
            "Unable to load Instagram media",

          error:
            error.message,

          instagram:
            error.instagram ||
            undefined
        })
    }
  }
)

/* =========================================================
   DEBUG
   GET /api/instagram/debug
========================================================= */

router.get(
  "/debug",
  async (req, res) => {
    try {
      const token =
        process.env
          .INSTAGRAM_ACCESS_TOKEN

      if (!token) {
        return res
          .status(500)
          .json({
            message:
              "INSTAGRAM_ACCESS_TOKEN is missing"
          })
      }

      const profileUrl =
        new URL(
          "https://graph.instagram.com/me"
        )

      profileUrl.searchParams.set(
        "fields",
        "id,user_id,username,account_type,media_count"
      )

      profileUrl.searchParams.set(
        "access_token",
        token
      )

      const mediaUrl =
        new URL(
          "https://graph.instagram.com/me/media"
        )

      mediaUrl.searchParams.set(
        "fields",
        "id,media_type,permalink,timestamp"
      )

      mediaUrl.searchParams.set(
        "access_token",
        token
      )

      mediaUrl.searchParams.set(
        "limit",
        "25"
      )

      const [
        profileResponse,
        mediaResponse
      ] =
        await Promise.all([
          fetch(profileUrl),
          fetch(mediaUrl)
        ])

      const profile =
        await profileResponse.json()

      const media =
        await mediaResponse.json()

      res.json({
        profileStatus:
          profileResponse.status,

        mediaStatus:
          mediaResponse.status,

        profile,
        media
      })
    } catch (error) {
      console.error(
        "❌ INSTAGRAM DEBUG ERROR:",
        error
      )

      res
        .status(500)
        .json({
          message:
            "Instagram debug failed",

          error:
            error.message
        })
    }
  }
)

/* =========================================================
   PUBLISH IMAGE POST
   POST /api/instagram/publish

   FORM DATA:
   image   = uploaded image
   caption = Instagram caption
========================================================= */

router.post(
  "/publish",
  upload.single("image"),
  async (req, res) => {
    try {
      const token =
        process.env
          .INSTAGRAM_ACCESS_TOKEN

      if (!token) {
        return res
          .status(500)
          .json({
            message:
              "INSTAGRAM_ACCESS_TOKEN is missing"
          })
      }

      /* ================= IMAGE REQUIRED ================= */

      if (!req.file) {
        return res
          .status(400)
          .json({
            message:
              "Choose an image to publish."
          })
      }

      const caption =
        String(
          req.body?.caption || ""
        ).trim()

      /* =================================================
         STEP 1
         UPLOAD IMAGE TO CLOUDINARY
      ================================================= */

      console.log(
        "📤 Uploading Instagram image to Cloudinary..."
      )

      const uploaded =
        await cloudinary
          .uploader
          .upload(
            req.file.path,
            {
              folder:
                "signavi-instagram",

              resource_type:
                "image"
            }
          )

      const imageUrl =
        uploaded.secure_url

      console.log(
        "✅ Instagram image uploaded:",
        imageUrl
      )

      /* =================================================
         STEP 2
         GET INSTAGRAM USER ID
      ================================================= */

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
        await instagramRequest(
          profileUrl
        )

      if (!profile?.id) {
        throw new Error(
          "Instagram user ID was not returned."
        )
      }

      console.log(
        "📸 Instagram account:",
        profile.username
      )

      console.log(
        "📸 Instagram scoped ID:",
        profile.id
      )

      /* =================================================
         STEP 3
         CREATE MEDIA CONTAINER
      ================================================= */

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

      console.log(
        "📦 Creating Instagram media container..."
      )

      const container =
        await instagramRequest(
          `https://graph.instagram.com/${profile.id}/media`,
          {
            method:
              "POST",

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
          "Instagram did not return a media container ID."
        )
      }

      console.log(
        "✅ Instagram container:",
        container.id
      )

      /* =================================================
         STEP 4
         WAIT FOR INSTAGRAM MEDIA TO FINISH PROCESSING
      ================================================= */

      console.log(
        "⏳ Waiting for Instagram media to finish processing..."
      )

      let containerReady = false
      let containerStatus = null

      const maxAttempts = 20
      const waitTime = 2000

      for (
        let attempt = 1;
        attempt <= maxAttempts;
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

        containerStatus =
          await instagramRequest(
            statusUrl
          )

        console.log(
          `⏳ Instagram container status ${attempt}/${maxAttempts}:`,
          containerStatus.status_code
        )

        if (
          containerStatus.status_code ===
          "FINISHED"
        ) {
          containerReady = true

          console.log(
            "✅ Instagram media is ready for publishing"
          )

          break
        }

        if (
          containerStatus.status_code === "ERROR" ||
          containerStatus.status_code === "EXPIRED"
        ) {
          throw new Error(
            `Instagram media processing failed: ${
              containerStatus.status ||
              containerStatus.status_code
            }`
          )
        }

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              waitTime
            )
        )
      }

      if (!containerReady) {
        throw new Error(
          "Instagram media is still processing. Please try again in a moment."
        )
      }

      /* =================================================
         STEP 5
         PUBLISH MEDIA CONTAINER
      ================================================= */

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

      console.log(
        "🚀 Publishing Instagram post..."
      )

      const published =
        await instagramRequest(
          `https://graph.instagram.com/${profile.id}/media_publish`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              publishBody.toString()
          }
        )

      console.log(
        "✅ INSTAGRAM POST PUBLISHED:",
        published.id
      )

      return res.json({
        success: true,

        message:
          "Instagram post published.",

        postId:
          published.id,

        containerId:
          container.id,

        imageUrl,

        username:
          profile.username
      })
    } catch (error) {
      console.error(
        "❌ INSTAGRAM PUBLISH ERROR:",
        error.instagram || error
      )

      return res
        .status(
          error.status || 500
        )
        .json({
          message:
            error.message ||
            "Unable to publish Instagram post.",

          instagram:
            error.instagram ||
            undefined
        })
    } finally {
      /* ===============================================
         REMOVE LOCAL TEMP FILE
      =============================================== */

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