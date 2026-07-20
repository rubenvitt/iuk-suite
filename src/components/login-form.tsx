"use client";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { absoluteCallbackUrl } from "@/core/auth/callbackUrl";
import { useState } from "react";

function PocketIdLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 13.5c-2.5 0-4.7-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.3 1.94-3.5 3.22-6 3.22Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LoginForm({ devLogin }: { devLogin: boolean }) {
  const callbackUrl = useSearchParams().get("callbackUrl") ?? "/";
  const [email, setEmail] = useState("dev@localtest.me");
  const [groups, setGroups] = useState("");
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* Hintergrund: generiertes Bild + weiches Overlay, damit die Karte trägt */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/login-bg.jpg)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-white/70 via-white/55 to-[#fbe9eb]/60 backdrop-blur-[2px]"
      />
      {/* Dekorative Farbakzente */}
      <div
        aria-hidden
        className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[var(--color-rot)]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-[var(--color-tinte)]/5 blur-3xl"
      />

      <div className="relative w-full max-w-md">
        <div className="rounded-3xl border border-white/60 bg-white/75 p-8 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-10">
          {/* Markenzeichen */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-rot)] shadow-lg shadow-[var(--color-rot)]/30">
              <span className="text-2xl font-black tracking-tight text-white">
                I&K
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-tinte)]">
              IuK-Suite
            </h1>
            <p className="mt-2 text-sm text-[var(--color-stahl)]">
              Internes Service-Dashboard für Information &amp; Kommunikation
            </p>
          </div>

          <button
            className="group flex min-h-[var(--tap)] w-full items-center justify-center gap-3 rounded-xl bg-[var(--color-rot)] px-4 py-3 text-base font-semibold text-white shadow-lg shadow-[var(--color-rot)]/25 transition-all hover:bg-[var(--color-rot-dk)] hover:shadow-xl hover:shadow-[var(--color-rot)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-rot)] active:translate-y-px"
            // Absolut gegen den Host, auf dem diese Seite läuft — NICHT relativ.
            // Warum, steht in core/auth/callbackUrl.ts; dass ein präparierter
            // callbackUrl damit nicht zum offenen Redirector wird, stellt die
            // Allowlist in core/auth/redirect.ts sicher.
            onClick={() =>
              signIn("pocket-id", {
                redirectTo: absoluteCallbackUrl(callbackUrl, window.location.origin),
              })
            }>
            <PocketIdLogo className="size-5 opacity-90 transition-transform group-hover:scale-110" />
            Mit Pocket ID anmelden
          </button>

          <p className="mt-4 text-center text-xs text-[var(--color-stahl)]">
            Du wirst zu Pocket ID weitergeleitet und nach der Anmeldung
            zurückgebracht.
          </p>

          {devLogin && (
            <form
              className="mt-8 flex flex-col gap-3 border-t border-[var(--color-linie)] pt-6"
              onSubmit={async (e) => {
                e.preventDefault();
                // Dev-login only: post the credentials WITHOUT letting next-auth perform the
                // redirect. Auth.js derives its redirect base URL from the server-side request
                // origin (localhost in dev, since Next's Request doesn't reflect the client Host
                // header), so its own redirect would bounce the browser off the requesting
                // *.localtest.me host. With redirect:false the session cookie is set by the fetch
                // response, and we navigate on the CURRENT origin instead — keeping the browser on
                // the host that initiated the login. Production-safe (this branch renders only when
                // dev-login is enabled — dev mode or explicit AUTH_DEV_LOGIN=true, never in production
                // builds; see core/auth/devLogin.ts) and it leaves the real Pocket-ID button intact.
                await signIn("dev-login", { email, groups, redirect: false });
                window.location.assign(callbackUrl.startsWith("/") ? callbackUrl : "/");
              }}>
              <p className="text-xs font-medium tracking-wide text-[var(--color-stahl)] uppercase">
                Entwicklungs-Login
              </p>
              <input
                aria-label="email"
                className="min-h-[var(--tap)] rounded-lg border border-[var(--color-linie)] bg-white/80 px-3 py-2 text-sm text-[var(--color-tinte)] outline-none transition focus:border-[var(--color-tinte)] focus:ring-2 focus:ring-[var(--color-tinte)]/15"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                aria-label="groups"
                placeholder="comma,separated,groups"
                className="min-h-[var(--tap)] rounded-lg border border-[var(--color-linie)] bg-white/80 px-3 py-2 text-sm text-[var(--color-tinte)] outline-none transition focus:border-[var(--color-tinte)] focus:ring-2 focus:ring-[var(--color-tinte)]/15"
                value={groups}
                onChange={(e) => setGroups(e.target.value)}
              />
              <button
                className="min-h-[var(--tap)] rounded-xl bg-[var(--color-tinte)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black/80 active:translate-y-px"
                type="submit">
                Dev-Login
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-stahl)]/80">
          IuK-Suite · Interner Bereich · Zugriff nur für Berechtigte
        </p>
      </div>
    </main>
  );
}
