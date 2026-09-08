/**
 * Whether the credentials-based dev-login (button on /login + the "dev-login"
 * provider) is active.
 *
 * This passwordless provider must be explicitly enabled. Keeping the default
 * OFF prevents an unset or non-standard NODE_ENV from exposing it on a
 * network-reachable deployment.
 *
 * AUTH_DEV_LOGIN=true enables it for local development and E2E tests.
 */
export function devLoginEnabled(): boolean {
  return process.env.AUTH_DEV_LOGIN === "true";
}
