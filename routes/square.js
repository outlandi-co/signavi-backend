router.post("/create-payment/:id", async (req, res) => {
  console.log("💳 CREATE PAYMENT:", req.params.id)

  try {
    const { id } = req.params

    const quote = await Quote.findById(id)

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" })
    }

    let price = Number(quote.price || 25)
    if (!price || price <= 0) price = 25

    // 🔥 FIX: Convert to BigInt
    const amount = BigInt(Math.round(price * 100))

    console.log("💰 AMOUNT (BigInt):", amount.toString())

    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: `${id}-${Date.now()}`,
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [
          {
            name: `Order #${id}`,
            quantity: "1",
            basePriceMoney: {
              amount: amount, // ✅ FIXED
              currency: "USD"
            }
          }
        ]
      }
    })

    const url = response?.result?.paymentLink?.url

    if (!url) {
      throw new Error("No payment URL returned from Square")
    }

    // 🔥 Save to DB (important for email reuse)
    quote.paymentUrl = url
    await quote.save()

    console.log("✅ PAYMENT LINK:", url)

    return res.json({
      success: true,
      url
    })

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err)

    return res.status(500).json({
      message: err.message
    })
  }
})