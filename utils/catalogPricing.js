
const toCents = (value) => {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number) && number >= 0
    ? Math.round((number + Number.EPSILON) * 100)
    : null
}

const text = (value) => String(value ?? "").trim()

const optionKey = (value) => text(value).toLowerCase()

const requirePrice = (value, label) => {
  const cents = toCents(value)

  if (cents === null || cents <= 0) {
    throw new Error(
      `${label} must have a valid price greater than zero.`
    )
  }

  return cents
}

const getStock = (value) => {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const stock = Number(value)

  return Number.isSafeInteger(stock) && stock >= 0
    ? stock
    : null
}

const applyPercent = (cents, percent) =>
  Math.max(
    0,
    cents - Math.round(cents * (percent / 100))
  )

export function calculateCatalogItem(product, cartItem) {
  if (!product || !cartItem) {
    throw new Error("Product and cart item are required.")
  }

  const productId = text(product._id ?? product.id)

  if (!productId) {
    throw new Error("Product is missing its database ID.")
  }

  if (
    product.active === false ||
    product.storefrontVisible === false ||
    text(product.storefront) !== "signavi_store"
  ) {
    throw new Error(
      `${text(product.name) || "Product"} is not available on Signavi Store.`
    )
  }

  const qty = Number(cartItem.quantity ?? 1)

  if (
    !Number.isSafeInteger(qty) ||
    qty < 1 ||
    qty > 500
  ) {
    throw new Error(
      "Quantity must be a whole number between 1 and 500."
    )
  }

  const productType = text(
    product.productType || "physical"
  ).toLowerCase()

  if (productType === "digital" && qty !== 1) {
    throw new Error(
      "Digital products may only be ordered one at a time."
    )
  }

  const variants = Array.isArray(product.variants)
    ? product.variants
    : []

  const selected =
    cartItem.selectedVariant ??
    cartItem.variant ??
    null

  let variant = null

  if (variants.length > 0) {
    const color = optionKey(selected?.color)
    const size = optionKey(selected?.size)

    if (!color || !size) {
      throw new Error(
        `Choose a color and size for ${product.name}.`
      )
    }

    variant = variants.find(
      (item) =>
        optionKey(item.color) === color &&
        optionKey(item.size) === size
    )

    if (!variant) {
      throw new Error(
        `Selected color or size is unavailable for ${product.name}.`
      )
    }
  }

  const stock = getStock(
    variant
      ? variant.stock ?? variant.quantity
      : product.stock ?? product.quantity
  )

  if (
    productType === "physical" &&
    (stock === null || stock < qty)
  ) {
    throw new Error(
      `Not enough stock for ${product.name}.`
    )
  }

  const basePrice = variant
    ? variant.price ??
      variant.basePrice ??
      variant.listPrice
    : product.price ??
      product.basePrice ??
      product.listPrice

  const baseCents = requirePrice(
    basePrice,
    text(product.name) || "Product"
  )

  let unitCents = baseCents
  let appliedDiscount = ""

  // Administrator-created sales:
  // Apply the discount to the selected variant's
  // actual database price, not a browser price.
  if (product.discountActive === true) {
    const type = text(
      product.discountType
    ).toLowerCase()

    const value = Number(product.discountValue)

    if (type === "percent") {
      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 100
      ) {
        throw new Error(
          `Invalid percentage discount for ${product.name}.`
        )
      }

      unitCents = applyPercent(baseCents, value)
      appliedDiscount = `${value}% off`
    } else if (type === "fixed") {
      const discountCents = toCents(
        product.discountValue
      )

      if (
        discountCents === null ||
        discountCents <= 0
      ) {
        throw new Error(
          `Invalid fixed discount for ${product.name}.`
        )
      }

      unitCents = Math.max(
        0,
        baseCents - discountCents
      )

      appliedDiscount =
        `$${(discountCents / 100).toFixed(2)} off`
    } else if (
      toCents(product.salePrice) > 0 &&
      variants.length === 0
    ) {
      // Compatibility with older non-variant sales.
      // Never apply a flat legacy price to every size.
      unitCents = Math.min(
        baseCents,
        toCents(product.salePrice)
      )

      appliedDiscount = "Sale"
    } else {
      throw new Error(
        `Update the discount settings for ${product.name} before checkout.`
      )
    }
  } else {
    // Existing automatic quantity discounts.
    const category = text(
      product.category
    ).toLowerCase()

    const name = text(
      product.name
    ).toLowerCase()

    if (
      category.includes("screen") ||
      name.includes("screen")
    ) {
      const percent =
        qty >= 100 ? 25 :
        qty >= 48 ? 15 :
        qty >= 24 ? 8 :
        0

      if (percent > 0) {
        unitCents = applyPercent(
          baseCents,
          percent
        )

        appliedDiscount =
          `${percent}% bulk discount`
      }
    } else if (
      (
        category.includes("dtf") ||
        name.includes("dtf")
      ) &&
      qty >= 10
    ) {
      unitCents = applyPercent(
        baseCents,
        10
      )

      appliedDiscount = "10% bulk discount"
    }
  }

  if (unitCents <= 0) {
    throw new Error(
      `The price for ${product.name} is zero. Contact the store.`
    )
  }

  const originalPrice = baseCents / 100
  const price = unitCents / 100

  const selectedVariant = variant
    ? {
        color: text(variant.color),
        size: text(variant.size),
        price
      }
    : null

  return {
    productId,
    name: text(product.name),

    image: text(
      variant?.images?.[0] ||
      product.image ||
      product.images?.[0]
    ),

    productType,
    quantity: qty,

    price,
    unitPrice: price,
    salePrice: price,
    finalPrice: price,

    originalPrice,
    regularPrice: originalPrice,

    selectedVariant,
    variant: selectedVariant || {},

    discountActive: Boolean(appliedDiscount),
    discountType: product.discountActive
      ? text(product.discountType)
      : "",
    discountValue: product.discountActive
      ? Number(product.discountValue) || 0
      : 0,
    discountLabel: appliedDiscount || "",

    stock,
    lineTotal: (unitCents * qty) / 100
  }
}

export function calculateCatalogCart(
  products,
  cartItems
) {
  if (
    !Array.isArray(products) ||
    !Array.isArray(cartItems) ||
    cartItems.length === 0 ||
    cartItems.length > 100
  ) {
    throw new Error(
      "Cart must contain between 1 and 100 items."
    )
  }

  const byId = new Map(
    products.map((product) => [
      text(product._id ?? product.id),
      product
    ])
  )

  const requested = new Map()

  const items = cartItems.map((cartItem) => {
    const id = text(
      cartItem.productId ??
      cartItem._id ??
      cartItem.id
    )

    const product = byId.get(id)

    if (!product) {
      throw new Error(
        "A cart product is no longer available."
      )
    }

    const priced = calculateCatalogItem(
      product,
      cartItem
    )

    // Check combined quantities across duplicate
    // cart entries for the same color and size.
    if (priced.productType === "physical") {
      const key = [
        id,
        optionKey(priced.selectedVariant?.color),
        optionKey(priced.selectedVariant?.size)
      ].join("::")

      const count =
        (requested.get(key) || 0) +
        priced.quantity

      if (count > priced.stock) {
        throw new Error(
          `Not enough stock for ${priced.name}.`
        )
      }

      requested.set(key, count)
    }

    return priced
  })

  const subtotalCents = items.reduce(
    (sum, item) =>
      sum +
      Math.round(item.price * 100) *
      item.quantity,
    0
  )

  return {
    items,
    subtotal: subtotalCents / 100,
    subtotalCents
  }
}
