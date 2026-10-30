// @ts-check
/** @param {string | undefined} value @returns {string} Require an explicit API origin reachable from a phone. */
export const phoneApiOrigin = (value) => {
  if (!value) {
    throw new Error("API URL is required. Pass --api-base-url http://YOUR_COMPUTER_LAN_IP:3000 or your HTTPS API domain.");
  }
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== "/" ||
    ["localhost", "[::1]", "0.0.0.0"].includes(url.hostname) ||
    url.hostname.startsWith("127.")
  ) {
    throw new Error("Use an HTTP(S) API origin reachable by your phone, without credentials, a path, query or fragment. A localhost address cannot reach your computer from a phone.");
  }
  return url.origin;
};
