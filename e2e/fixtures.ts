import { Page, expect } from "@playwright/test";

export async function devLogin(
  page: Page,
  opts: { host: string; email?: string; groups?: string; callbackPath?: string; port?: number },
) {
  const cb = encodeURIComponent(opts.callbackPath ?? "/");
  // Port ist überschreibbar, weil der PWA-Spike auf einem eigenen Server läuft.
  await page.goto(`http://${opts.host}:${opts.port ?? 3100}/login?callbackUrl=${cb}`);
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
  //
  // 45s, NOT 10s — and that is not a wager, it is a measurement. The budget
  // used to be 10s, which holds on every developer machine and failed in CI
  // every time, because CI runs `next dev` on a cold `.next` (fresh checkout,
  // no build cache) on a small runner. This one click makes the dev server
  // compile the next-auth route handlers AND the authenticated module root
  // before the browser can leave /login. Measured on a deleted `.next` with the
  // machine put under artificial CPU load, to stand in for a CI runner: 13.7s.
  // The same login a second time, warm: 0.3s. So 10s was never reachable in CI
  // and the first logging-in test of the run always died right here. The login
  // page itself is compiled before the suite starts — see `webServer.url` in
  // playwright.config.ts, where the numbers are written out in full.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
  await page.waitForLoadState("networkidle");
}
