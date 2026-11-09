const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

const boundedText = (value, name, limit) => {
  if (typeof value !== "string" || value.length > limit) {
    throw new Error("Invalid customization " + name)
  }
  return value.trim()
}

const coordinate = (value, name) => {
  const n = Number(value)
  if (
    value === null ||
    value === "" ||
    typeof value === "boolean" ||
    !Number.isFinite(n) ||
    n < -10000 ||
    n > 10000
  ) {
    throw new Error("Invalid customization design " + name)
  }
  return n
}

export function normalizeOrderItemCustomization(value) {
  if (value == null) return undefined

  if (!isPlainObject(value)) {
    throw new Error("Invalid customization payload")
  }

  const allowed = new Set([
    "artwork", "productionType", "printLocation", "design"
  ])

  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error("Unsupported customization field")
  }

  const artwork = boundedText(value.artwork ?? "", "artwork", 2048)
  const productionType = boundedText(
    value.productionType, "productionType", 80
  )
  const printLocation = boundedText(
    value.printLocation, "printLocation", 80
  )

  if (!productionType || !printLocation) {
    throw new Error("Incomplete customization options")
  }

  if (artwork) {
    let url
    try {
      url = new URL(artwork)
    } catch {
      throw new Error("Invalid artwork URL")
    }

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      throw new Error("Artwork requires an HTTPS URL")
    }
  }

  if (!isPlainObject(value.design)) {
    throw new Error("Invalid customization design")
  }

  const keys = new Set(["x", "y", "size"])

  if (Object.keys(value.design).some((key) => !keys.has(key))) {
    throw new Error("Unsupported customization design field")
  }

  const design = {
    x: coordinate(value.design.x, "x"),
    y: coordinate(value.design.y, "y"),
    size: coordinate(value.design.size, "size")
  }

  if (design.size <= 0) {
    throw new Error("Invalid customization design size")
  }

  return {
    artwork,
    productionType,
    printLocation,
    design
  }
}
