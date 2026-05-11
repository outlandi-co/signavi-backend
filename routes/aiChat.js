// routes/aiChatRoutes.js
import express from "express"

const router = express.Router()

router.post("/", async (req, res) => {
  try {
    const { message } = req.body

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required"
      })
    }

    // No API key or no billing yet = fallback response
    if (!process.env.OPENAI_API_KEY || process.env.AI_CHAT_ENABLED !== "true") {
      return res.json({
        success: true,
        reply: "Thanks for reaching out to SignaVi Studio. We received your message and someone will follow up soon. You can ask about quotes, custom products, artwork uploads, or order updates."
      })
    }

    // Later: OpenAI call goes here

  } catch (error) {
    console.error("AI CHAT ERROR:", error)

    return res.status(500).json({
      success: false,
      message: "Chat support is temporarily unavailable."
    })
  }
})

export default router