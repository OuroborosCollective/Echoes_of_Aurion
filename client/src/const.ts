export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// The deployed Aurion VPS opens its own account panel instead of passing a
// third-party OAuth redirect through arelogic.space.
export const startLogin = () => {
  window.dispatchEvent(new Event("aurion:open-local-auth"));
};
