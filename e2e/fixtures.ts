import { Page, expect } from "@playwright/test";

export async function devLogin(page: Page, opts: { host: string; email?: string; groups?: string; callbackPath?: string }) {
  const cb = encodeURIComponent(opts.callbackPath ?? "/");
  await page.goto(`http://${opts.host}:3100/login?callbackUrl=${cb}`);
  // The login form is a client component; on a cold cross-host load (dev mode,
  // no shared cache across *.localtest.me origins) React can still be
  // hydrating when the click lands, so the browser falls through to a native
  // form GET instead of the JS submit handler. Wait for the network to settle
  // (scripts fetched + executed) before interacting so the click always hits
  // the hydrated handler.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("email").fill(opts.email ?? "dev@localtest.me");
  await page.getByLabel("groups").fill(opts.groups ?? "");
  await page.getByRole("button", { name: "Dev-Login" }).click();
  // next-auth's client signIn() posts the credentials, then assigns
  // window.location.href to the final redirect target — a real navigation,
  // not just a fetch. Waiting for networkidle right after click() is racy:
  // the POST can still be in flight (nothing navigating yet) when idle is
  // sampled, so the wait resolves before the redirect starts and callers
  // that immediately navigate elsewhere (e.g. page.goto to another host)
  // can cancel the pending login redirect (net::ERR_ABORTED). Wait for the
  // URL to actually leave /login first, then let the network settle.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
}
