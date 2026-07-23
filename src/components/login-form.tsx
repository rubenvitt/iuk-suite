"use client";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { absoluteCallbackUrl } from "@/core/auth/callbackUrl";
import { useState } from "react";
import { Button, Input } from "antd";
import { DRK, SPACE } from "@/core/theme/tokens";

// Kleiner, lokaler Helfer: übersetzt einen DRK-Hex-Wert mit Deckkraft in eine
// CSS-Farbe — Ersatz für Tailwinds Opacity-Modifier (`bg-[..]/NN`), den es
// für `style`-Objekte nicht gibt.
function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function PocketIdLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={20} height={20} aria-hidden>
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
    <main
      style={{
        position: "relative",
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: SPACE.xl,
      }}
    >
      {/* Hintergrund: generiertes Bild + weiches Overlay, damit die Karte trägt */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url(/login-bg.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to bottom right, rgba(255, 255, 255, 0.70), rgba(255, 255, 255, 0.55), ${rgba(DRK.rotBg, 0.6)})`,
          backdropFilter: "blur(2px)",
        }}
      />
      {/* Dekorative Farbakzente */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -128,
          right: -128,
          height: 384,
          width: 384,
          borderRadius: 9999,
          backgroundColor: rgba(DRK.rot, 0.1),
          filter: "blur(64px)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -160,
          left: -160,
          height: 448,
          width: 448,
          borderRadius: 9999,
          backgroundColor: rgba(DRK.tinte, 0.05),
          filter: "blur(64px)",
        }}
      />

      <div style={{ position: "relative", width: "100%", maxWidth: 448 }}>
        <div
          style={{
            borderRadius: 24,
            border: "1px solid rgba(255, 255, 255, 0.6)",
            backgroundColor: "rgba(255, 255, 255, 0.75)",
            padding: SPACE.xxl,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.10)",
            backdropFilter: "blur(24px)",
          }}
        >
          {/* Markenzeichen */}
          <div
            style={{
              marginBottom: SPACE.xxl,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                marginBottom: 20,
                display: "flex",
                height: 64,
                width: 64,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 16,
                backgroundColor: DRK.rot,
                boxShadow: `0 10px 15px -3px ${rgba(DRK.rot, 0.3)}, 0 4px 6px -4px ${rgba(DRK.rot, 0.3)}`,
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  letterSpacing: "-0.025em",
                  color: "#ffffff",
                }}
              >
                I&K
              </span>
            </div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.025em",
                color: DRK.tinte,
              }}
            >
              IuK-Suite
            </h1>
            <p style={{ marginTop: SPACE.sm, fontSize: 14, color: DRK.stahl }}>
              Internes Service-Dashboard für Information &amp; Kommunikation
            </p>
          </div>

          <Button
            type="primary"
            size="large"
            block
            icon={<PocketIdLogo />}
            // Absolut gegen den Host, auf dem diese Seite läuft — NICHT relativ.
            // Warum, steht in core/auth/callbackUrl.ts; dass ein präparierter
            // callbackUrl damit nicht zum offenen Redirector wird, stellt die
            // Allowlist in core/auth/redirect.ts sicher.
            onClick={() =>
              signIn("pocket-id", {
                redirectTo: absoluteCallbackUrl(callbackUrl, window.location.origin),
              })
            }
          >
            Mit Pocket ID anmelden
          </Button>

          <p style={{ marginTop: SPACE.lg, textAlign: "center", fontSize: 12, color: DRK.stahl }}>
            Du wirst zu Pocket ID weitergeleitet und nach der Anmeldung
            zurückgebracht.
          </p>

          {devLogin && (
            <form
              style={{
                marginTop: SPACE.xxl,
                display: "flex",
                flexDirection: "column",
                gap: SPACE.md,
                borderTop: `1px solid ${DRK.linie}`,
                paddingTop: SPACE.xl,
              }}
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
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.025em",
                  color: DRK.stahl,
                  textTransform: "uppercase",
                }}
              >
                Entwicklungs-Login
              </p>
              <Input aria-label="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input
                aria-label="groups"
                placeholder="comma,separated,groups"
                value={groups}
                onChange={(e) => setGroups(e.target.value)}
              />
              <Button htmlType="submit" size="large" block>
                Dev-Login
              </Button>
            </form>
          )}
        </div>

        <p
          style={{
            marginTop: SPACE.xl,
            textAlign: "center",
            fontSize: 12,
            color: rgba(DRK.stahl, 0.8),
          }}
        >
          IuK-Suite · Interner Bereich · Zugriff nur für Berechtigte
        </p>
      </div>
    </main>
  );
}
