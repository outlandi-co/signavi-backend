export const getPrice = (item) => {
  return Number(
    item?.selectedVariant?.price ??
    item?.variant?.price ??
    item?.price ??
    0
  )
}