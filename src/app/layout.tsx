import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Barlow, Barlow_Condensed, Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Providers } from "@/components/providers";
import { reauthProviderId } from "@/core/auth/pocketId";
import { AntdProvider } from "@/core/theme/AntdProvider";
import { THEME_COOKIE, parseThemeMode, themeInitScript } from "@/core/theme/mode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
 * DIE DREI SCHRIFTEN DES LAGERBUCH. Sie standen in `_ui/helfer.module.css:64-66`
 * schon immer als `var(--font-display|body|mono)` — nur geladen hat sie niemand:
 * bei der Portierung aus der Alt-Anwendung sind die drei next/font-Aufrufe nicht
 * mitgekommen. Gemessen am 12.08.2026 rendert der ganze Helfer-Zweig deshalb in
 * Geist, und `font: 700 24px var(--lb-display)` faellt VOLLSTAENDIG aus (Falle 2).
 *
 * ⚠️ SIE AENDERN DIE SUITE-TYPOGRAFIE NICHT. `next/font` mit `variable:` deklariert
 * eine CSS-Variable und sonst nichts; wirksam wird sie erst, wo jemand sie liest —
 * und das tut ausschliesslich `m/lagerbuch/_ui/helfer.module.css`. Die uebrigen
 * Module bleiben auf Geist.
 *
 * Die GEWICHTE sind aus `lagerbuch/src/app/layout.tsx` uebernommen und keine freie
 * Wahl: ein fehlendes Gewicht laesst der Browser still synthetisch fett rendern.
 */
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
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
  const mode = parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
  const cookieDomain = process.env.AUTH_COOKIE_DOMAIN || undefined;

  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable}`}
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
