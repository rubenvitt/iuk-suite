/**
 * Whether the credentials-based dev-login (button on /login + the "dev-login"
 * provider) is active.
 *
 * Default: ON outside production, so a plain `pnpm dev` gives a working login
 * without configuring Pocket ID. OFF in production builds (Next's standalone
 * server / `next start` set NODE_ENV=production).
 *
 * Explicit override via env — used by E2E and staging:
 *   AUTH_DEV_LOGIN=true   → force on  (even in production)
 *   AUTH_DEV_LOGIN=false  → force off (even in dev)
 */
export function devLoginEnabled(): boolean {
  const flag = process.env.AUTH_DEV_LOGIN;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}
