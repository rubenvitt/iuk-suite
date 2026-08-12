import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Providers } from "@/components/providers";
import { reauthProviderId } from "@/core/auth/pocketId";
import { AntdProvider } from "@/core/theme/AntdProvider";
import { LEGACY_THEME_COOKIE, parseThemeMode, themeInitScript } from "@/core/theme/mode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IuK-Suite",
  description: "Internes Service-Dashboard für I&K",
};

/**
 * ZOOM GESPERRT, SUITEWEIT. Bewusste Betreiberentscheidung, keine
 * Nachlaessigkeit — sie verletzt WCAG 1.4.4 und wird dadurch aufgefangen, dass
 * Eingabefelder nirgends unter 16px fallen (`globals.css`, dort begruendet).
 * Die beiden Regeln gehoeren zusammen: ohne Zoom kann niemand mehr heranholen,
 * was zu klein ist.
 *
 * Hier und nur hier — das Root-Layout liegt ueber allem, also gilt die Sperre
 * auch fuer den Kiosk und die login-freien Ansichten.
 *
 * KEIN `viewportFit: "cover"`. Das waere randlose Darstellung, eine andere
 * Anforderung, und verpflichtete Kopfzeile, jedes Modul-Padding und die
 * Kiosk-Shell auf `env(safe-area-inset-*)`. Wer sie will, hebt sie als eigene
 * Entscheidung — und stellt dann `Layout.headerHeight` von fest 64 auf
 * `min-height` um, sonst klemmt die Kopfzeile unter der Notch.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Serverseitig gelesen, damit der ERSTE Render schon den richtigen
  // Algorithmus trägt: kein Hydration-Mismatch, kein FOUC. Kostet nichts —
  // alle Routen sind durch Proxy-Rewrite und auth() ohnehin dynamisch.
  //
  // UEBERGANG: liest noch den Altschluessel — Task 3 stellt das auf die
  // getrennten Cookies (Praeferenz + Systemwert) um.
  const mode = parseThemeMode((await cookies()).get(LEGACY_THEME_COOKIE)?.value);
  const cookieDomain = process.env.AUTH_COOKIE_DOMAIN || undefined;

  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable}`}
      // BEIDES, nicht das eine statt des anderen: `colorScheme` zieht
      // Scrollbalken und native Bedienelemente mit, aber CSS kann darauf nicht
      // selektieren. `data-theme` ist der verbindliche Selektor fuer eigene
      // CSS-Variablen jedes Moduls — bewusst NICHT `prefers-color-scheme`:
      // die Suite hat einen Umschalter (Cookie `iuk-theme`, oben serverseitig
      // gelesen), sonst bricht der Fall "System dunkel, Umschalter hell".
      // Den Wechsel ohne Reload schreibt `AntdProvider.setMode` mit.
      data-theme={mode}
      style={{ colorScheme: mode }}
      suppressHydrationWarning
    >
      <head>
        {/* Primt beim ersten Besuch die OS-Präferenz ins Cookie — siehe mode.ts. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(cookieDomain) }} />
      </head>
      <body>
        <AntdRegistry>
          {/* Serverseitig aufgeloest: die Client-Komponente kann POCKET_ID_ISSUER
              nicht lesen. Ohne Pocket ID bleibt es beim harten Logout. */}
          <Providers reauthProvider={reauthProviderId()}>
            <AntdProvider initialMode={mode} cookieDomain={cookieDomain}>
              {children}
            </AntdProvider>
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
