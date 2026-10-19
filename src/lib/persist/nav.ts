/**
 * Full page navigation. Used after sign-in / sign-out on purpose: a fresh page load guarantees no data or
 * state from the previous session survives in memory.
 */
export function hardNavigate(url: string, mode: "assign" | "replace" = "assign") {
  if (mode === "replace") window.location.replace(url);
  else window.location.assign(url);
}
