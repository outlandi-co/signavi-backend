const isObjectId = value =>
  typeof value === "string" &&
  /^[a-f0-9]{24}$/i.test(value);

const positive = value =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0;

export function validatePackingProfileCreation(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return {
      valid: false,
      error: "Invalid packing profile request"
    };
  }

  if (
    !isObjectId(input.productId) ||
    !isObjectId(input.packageId)
  ) {
    return {
      valid: false,
      error: "Valid product and package IDs are required"
    };
  }

  if (
    !positive(input.unitWeightOz) ||
    input.unitWeightOz > 2400
  ) {
    return {
      valid: false,
      error: "Measured product weight is required"
    };
  }

  if (
    !Number.isSafeInteger(input.verifiedCapacity) ||
    input.verifiedCapacity < 1 ||
    input.verifiedCapacity > 200
  ) {
    return {
      valid: false,
      error: "Physically verified packing capacity is required"
    };
  }

  if (
    typeof input.verifiedBy !== "string" ||
    !input.verifiedBy.trim() ||
    typeof input.verificationNotes !== "string" ||
    input.verificationNotes.trim().length < 8 ||
    !input.verifiedAt ||
    !Number.isFinite(
      new Date(input.verifiedAt).getTime()
    )
  ) {
    return {
      valid: false,
      error: "Complete verification evidence is required"
    };
  }

  if (input.active !== undefined && input.active !== false) {
    return {
      valid: false,
      error: "New packing profiles must remain inactive"
    };
  }

  return {
    valid: true,
    data: {
      productId: input.productId,
      packageId: input.packageId,
      unitWeightOz: input.unitWeightOz,
      verifiedCapacity: input.verifiedCapacity,
      verifiedBy: input.verifiedBy.trim(),
      verifiedAt: new Date(input.verifiedAt),
      verificationNotes: input.verificationNotes.trim(),
      active: false
    }
  };
}
