import express from "express"
import OpenAI from "openai"

const router = express.Router()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const SYSTEM_PROMPT = `
You are the SignaVi Studio website assistant.

Your job is to help visitors understand SignaVi Studio services and guide them toward a quote, order, or contact request.

Business context:
- SignaVi Studio offers custom apparel, screen printing, engraving, digital art downloads, photography, videography, drone footage, design services, and custom creative projects.
- Digital products may include low-resolution previews and high-resolution files after purchase.
- Digital downloads can have license limits such as personal use, small business use, commercial use, extended commercial use, or exclusive licensing.
- Do not promise exact pricing unless the user provides details or the price is visible in product data.
- If someone asks for a custom project, ask for their name, email, project type, quantity, deadline, and artwork/design details.
- If someone asks about order status, tell them to log into their customer account or contact support with their order email.
- Be friendly, clear, professional, and concise.
- Do not provide legal advice. For licensing questions, explain general usage terms and suggest contacting SignaVi Studio for custom licensing.
`

router.post("/", async (req, res) => {
  try {
    const { message, history = [] } = req.body || {}

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required"
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "OPENAI_API_KEY is missing on the backend"
      })
    }

    const safeHistory = Array.isArray(history)
      ? history.slice(-8).map(item => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: String(item.content || "").slice(0, 1000)
        }))
      : []

    const input = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      ...safeHistory,
      {
        role: "user",
        content: String(message).trim()
      }
    ]

    const response = await openai.responses.create({
      model: "gpt-5.5",
      input,
      max_output_tokens: 350
    })

    return res.json({
      success: true,
      reply: response.output_text || "I’m sorry, I could not create a response."
    })
  } catch (err) {
    console.error("❌ AI CHAT ERROR:", err)

    return res.status(500).json({
      success: false,
      message: "AI chat failed",
      error: err.message
    })
  }
})

export default router