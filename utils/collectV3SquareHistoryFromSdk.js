import {
  collectV3SquarePaymentLinkHistory
} from "./collectV3SquarePaymentLinkHistory.js";

const blocked = reason => Object.freeze({
  complete: false,
  reason,
  links: Object.freeze([]),
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Read-only Square SDK adapter.
 *
 * Caller must supply a server-owned Square paymentLinks client.
 * Never expose this function as an HTTP endpoint.
 *
 * No payment creation, state mutation, or authorization.
 */
export async function collectV3SquareHistoryFromSdk({
  paymentLinksClient,
  maxPages = 10
} = {}) {
  if (
    typeof paymentLinksClient?.list !== "function"
  ) {
    return blocked("SQUARE_LIST_CLIENT_REQUIRED");
  }

  return collectV3SquarePaymentLinkHistory({
    maxPages,

    listPage: async ({ cursor } = {}) => {
      const request = {
        limit: 1000,
        ...(cursor ? { cursor } : {})
      };

      // Installed Square SDK: list() resolves to a Page.
      // Payment links and cursor are in page.response.
      const pending = paymentLinksClient.list(
        request,
        { maxRetries: 0 }
      );

      let data;

      if (
        pending &&
        typeof pending.withRawResponse === "function"
      ) {
        // Compatibility with existing SDK test doubles.
        const result = await pending.withRawResponse();
        data = result?.data;
      } else {
        const page = await pending;

        if (
          !page ||
          !page.response ||
          typeof page.response !== "object"
        ) {
          throw new Error("SQUARE_PAGE_INTERFACE_INVALID");
        }

        data = page.response;
      }

      if (
        !data ||
        !Array.isArray(data.paymentLinks)
      ) {
        throw new Error("SQUARE_PAGE_DATA_INVALID");
      }

      return {
        paymentLinks: data.paymentLinks,
        cursor: data.cursor,
        errors: data.errors
      };
    }
  });
}