// Crisp live-chat integration. The website id is a public client id (it ships
// in the embed snippet), so it lives here rather than in a secret. Loaded
// lazily and driven from <CrispChat/>, which also identifies the signed-in user.

const CRISP_WEBSITE_ID = "cfa0bcf4-60a8-474b-99f4-539c96752645";

declare global {
  interface Window {
    $crisp?: unknown[];
    CRISP_WEBSITE_ID?: string;
  }
}

let started = false;

/** Inject the Crisp script once. Commands pushed before it loads are queued. */
export function loadCrisp() {
  if (started || typeof document === "undefined") return;
  started = true;
  window.$crisp = window.$crisp ?? [];
  window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
  const s = document.createElement("script");
  s.src = "https://client.crisp.chat/l.js";
  s.async = true;
  document.head.appendChild(s);
}

/** Attach the signed-in user's identity so a conversation isn't anonymous. */
export function identifyCrisp(user: { email?: string | null; name?: string | null }) {
  const q = window.$crisp;
  if (!q) return;
  if (user.email) q.push(["set", "user:email", user.email]);
  if (user.name) q.push(["set", "user:nickname", user.name]);
}
