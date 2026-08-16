import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Barlow, Barlow_Condensed, Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Providers } from "@/components/providers";
import { reauthProviderId } from "@/core/auth/pocketId";
import { AntdProvider } from "@/core/theme/AntdProvider";
import {
  THEME_PREF_COOKIE,
  THEME_SYSTEM_COOKIE,
  parseThemeMode,
  parseThemePreference,
  resolveThemeMode,
  themeInitScript,
} from "@/core/theme/mode";
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
 * DIE DREI SCHRIFTEN DES LAGERBUCH. `--lb-display`, `--lb-body` und `--lb-mono`
 * in `_ui/helfer.module.css` standen schon immer als `var(--font-…)` — nur
 * geladen hat sie niemand: bei der Portierung aus der Alt-Anwendung sind die
 * drei next/font-Aufrufe nicht mitgekommen. Gemessen am 12.08.2026 rendete der
 * ganze Helfer-Zweig deshalb im Fallback, und `font: 700 24px var(--lb-display)`
 * fiel VOLLSTAENDIG aus (Falle 2).
 *
 * ⚠️ DIE VARIABLEN HEISZEN NACH DER SCHRIFT, NICHT NACH DER ROLLE — und das ist
 * der Unterschied, an dem alles haengt.
 *
 * Sie hieszen einmal `--font-body`, `--font-display`, `--font-mono`. Solange nur
 * `helfer.module.css` sie las, war das folgenlos. Seither sind genau diese drei
 * Namen die ROLLEN DER SUITE (aufgeloest in `app/globals.css`, gelesen von
 * `core/theme/theme.ts`, `core/theme/schrift.ts` und einem Dutzend Modulstellen).
 * Beides zugleich geht nicht: `--font-body` waere dann hier Barlow und dort
 * Geist, und welche Deklaration gewinnt, entschiede die Stylesheet-Reihenfolge
 * — Falle 5, und still.
 *
 * Deshalb tragen die drei Schriften hier IHRE EIGENEN NAMEN. Der Helfer-Weg
 * bildet seine `--lb-*` direkt darauf ab und behaelt sein Originaltrio; die
 * Suite behaelt Rollen, die halten, was sie sagen. Nur
 * `--font-barlow-condensed` lesen beide — die Display-Rolle loest darauf auf,
 * und das ist gewollt: es ist dieselbe Schrift.
 *
 * ⚠️ SIE AENDERN DIE SUITE-TYPOGRAFIE NICHT. `next/font` mit `variable:` deklariert
 * eine CSS-Variable und sonst nichts; wirksam wird sie erst, wo jemand sie liest.
 * Fliesztext und Formulare der Suite bleiben Geist — `--font-body` in
 * `globals.css` loest auf `--font-geist-sans` auf, nicht auf Barlow.
 *
 * Die GEWICHTE sind aus `lagerbuch/src/app/layout.tsx` uebernommen und keine freie
 * Wahl: ein fehlendes Gewicht laesst der Browser still synthetisch fett rendern.
 * Fuer `Barlow_Condensed` decken 600 und 700 beide Leser: den Helfer-Weg UND die
 * Rollenleiter der Suite (`core/theme/schrift.ts`), die keine anderen Schnitte
 * anfragt. Jedes weitere Gewicht waere ein Ladevorgang ohne Anwender.
 *
 * ⚠️ AUSNAHME: `IBM_Plex_Mono` traegt zusaetzlich `"700"`, das die Alt-Anwendung
 * NICHT lud (dort `font: 600 21px var(--mono)` fuer `.tokeninput`). Der Port
 * setzt `.codefeld` bewusst auf `font: 700 24px/1 var(--lb-mono)` — eine
 * Erhoehung ueber die Alt-Anwendung hinaus, weil das Feld den sechsstelligen
 * Zugangscode traegt, der in einer Fahrzeughalle abgelesen und getippt wird.
 * Ohne das Gewicht in dieser Liste faellt genau dieselbe Falle wie oben: der
 * Browser rendert 700 still synthetisch fett statt mit dem echten Schnitt.
 */
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sammelhaus",
  description: "Interne Dienste unter einem Dach",
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
  // ZWEI Cookies, weil der Server `prefers-color-scheme` nicht sieht: die
  // Wahl (auch `auto`) und der zuletzt vom Client beobachtete OS-Wert.
  const keks = await cookies();
  const preference = parseThemePreference(keks.get(THEME_PREF_COOKIE)?.value);
  const system = parseThemeMode(keks.get(THEME_SYSTEM_COOKIE)?.value);
  const mode = resolveThemeMode(preference, system);
  const cookieDomain = process.env.AUTH_COOKIE_DOMAIN || undefined;

  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable}`}
      // BEIDES, nicht das eine statt des anderen: `colorScheme` zieht
      // Scrollbalken und native Bedienelemente mit, aber CSS kann darauf nicht
      // selektieren. `data-theme` ist der verbindliche Selektor fuer eigene
      // CSS-Variablen jedes Moduls — bewusst NICHT `prefers-color-scheme`:
      // die Suite hat einen Umschalter mit drei Zustaenden (`iuk-theme-pref`,
      // oben serverseitig gelesen), sonst bricht der Fall "System dunkel,
      // Umschalter hell".
      //
      // HIER STEHT IMMER DER AUFGELOESTE WERT, nie `auto`. Ein gestempeltes
      // `auto` besteht typecheck, build und Vitest und kippt trotzdem jede
      // Modulflaeche still auf helle Darstellung, waehrend antd dunkel rendert.
      // Den Wechsel ohne Reload schreibt `AntdProvider` mit.
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
            <AntdProvider
              initialMode={mode}
              initialPreference={preference}
              cookieDomain={cookieDomain}
            >
              {children}
            </AntdProvider>
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
