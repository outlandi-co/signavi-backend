const allowedHosts = new Set([
  "square.link",
  "checkout.square.site",
  "sandbox.square.link"
]);

const failure = reason => Object.freeze({
  httpStatus: 423,
  body: {
    success: false,
    reason,
    retryAuthorized: false
  }
});

function isApprovedSquareUrl(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim()
  ) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      allowedHosts.has(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}

export function mapV3TrustedCheckoutHttpResult(result) {
  if (!result || typeof result !== "object") {
    return failure("TRUSTED_CHECKOUT_RESULT_MISSING");
  }

  const recorded =
    result.status === "link_recorded" &&
    result.reason === "PAYMENT_LINK_DURABLY_RECORDED" &&
    result.retryAuthorized === false;

  if (recorded) {
    if (!isApprovedSquareUrl(result.paymentUrl)) {
      return failure("UNAPPROVED_PAYMENT_URL");
    }

    return Object.freeze({
      httpStatus: 200,
      body: {
        success: true,
        paymentUrl: result.paymentUrl
      }
    });
  }

  return failure(
    typeof result.reason === "string"
      ? result.reason
      : "TRUSTED_CHECKOUT_NOT_COMPLETED"
  );
}