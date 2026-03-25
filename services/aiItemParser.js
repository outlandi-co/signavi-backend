import OpenAI from "openai"

let openai = null

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
} else {
  console.warn("⚠️ AI DISABLED")
}

export const parseOrderItems = async (description) => {
  try {
    if (!openai) return []

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a professional print shop pricing engine.

Rules:
- Include base product cost (shirts, hoodies, etc.)
- Include print cost per color
- Include setup or rush fees if needed
- Prices should be realistic for a small business

Return ONLY JSON:

{
  "items": [
    { "name": "", "quantity": 0, "price": 0 }
  ],
  "total": number
}
`
        },
        {
          role: "user",
          content: description
        }
      ],
      temperature: 0.3
    })

    const text = response.choices[0].message.content

    const parsed = JSON.parse(text)

    return parsed

  } catch (err) {
    console.error("❌ AI PRICING ERROR:", err.message)
    return { items: [], total: 0 }
  }
}