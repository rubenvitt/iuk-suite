import type { Metadata } from "next";
import { FORMEN } from "@/core/favicon/zeichen";
import { pruefsumme } from "@/core/favicon";
import { lokalUeberHttp } from "@/core/lokalHttp";
import { MODULES, einstiegFuerHost, moduleForHost } from "@/core/registry";

/**
 * SEITENTITEL UND LINKVORSCHAU JE HOST — gelesen vom Root-Layout (`app/layout.tsx`, `generateMetadata`).
 *
 * Der Titel einer Seite ist „<Seite> · <App>“: das Root-Layout setzt die Vorlage `%s · <App>`, jede Seite nur
 * ihren kurzen Namen (`export const metadata = { title: "Artikel" }`). Ohne eigenen Titel steht dort nur die
 * App. Die App folgt dem HOST, wie das Favicon: jedes Modul hat seinen eigenen, das Portal ist „IDA“, ein
 * Einstiegshost (`EINSTIEGSHOSTS`) trägt seinen eigenen Namen.
 *
 * Seiten mit Daten im Pfad (Gerät, Plan, Token) tragen einen festen Namen, nie den Datensatz: ein
 * `generateMetadata` liefe parallel zum Riegel des Layouts und fasste die Datenbank vor der Zugriffsprüfung
 * an (Vorbild `kommplan/_lib/tokenMetadaten.ts`).
 *
 * Die Vorschau in Messengern (Open Graph, Twitter-Karte) nimmt denselben Titel, die Beschreibung der Suite und
 * ein Bild je App unter `/favicon/vorschau-<name>.png` (`app/favicon/[datei]/route.ts`, gezeichnet in
 * `bild.tsx`). `/favicon/` steht in der Durchlassliste von `core/routing.ts` und gilt auf jedem Host.
 */

export const SUITE_NAME = "IDA";
export const SUITE_BESCHREIBUNG = "Interne Dienste und Anwendungen";

/** Titel des Einstiegshosts je Modul und Pfadraum (`EINSTIEGSHOSTS` in `core/registry.ts`). */
const EINSTIEGSTITEL: Readonly<Record<string, { name: string; titel: string }>> = {
  "feedback/k": { name: "ehrlich", titel: "Ehrlich gesagt" },
};

export interface Marke {
  /** Dateiname des Vorschaubilds: `vorschau-<name>.png`. */
  name: string;
  titel: string;
  /** Schlüssel in `FORMEN` (`core/favicon/zeichen.ts`); `ida` für Module ohne eigenes Zeichen. */
  zeichen: string;
}

const IDA: Marke = { name: "ida", titel: SUITE_NAME, zeichen: "ida" };

function zeichenVon(key: string): string {
  return Object.hasOwn(FORMEN, key) ? key : "ida";
}

/** Alle Marken, die es als Vorschaubild gibt: IDA, jedes Modul außer dem Portal, jeder Einstiegshost. */
export const MARKEN: readonly Marke[] = [
  IDA,
  ...MODULES.filter((m) => m.key !== "portal").map((m) => ({ name: m.key, titel: m.title, zeichen: zeichenVon(m.key) })),
  ...Object.values(EINSTIEGSTITEL).map((e) => ({ ...e, zeichen: "ida" })),
];

export function markeZuName(name: string): Marke | null {
  return MARKEN.find((m) => m.name === name) ?? null;
}

/** Die Marke eines Hosts; `IDA` für das Portal und jeden unbekannten Host. */
export function markeFuerHost(host: string): Marke {
  const einstieg = einstiegFuerHost(host);
  if (einstieg) {
    const e = EINSTIEGSTITEL[`${einstieg.modul}${einstieg.praefix}`];
    return e ? markeZuName(e.name)! : IDA;
  }
  const modul = moduleForHost(host);
  if (!modul || modul.key === "portal") return IDA;
  return markeZuName(modul.key) ?? IDA;
}

/** Version des Vorschaubilds im `?v=`: ändert sich Titel, Zeichen oder Gestaltung, ändert sich die URL. */
export const BILD_STAND = "1";

export function vorschauBildUrl(marke: Marke): string {
  const v = pruefsumme(`${BILD_STAND}|${marke.titel}|${marke.zeichen}`);
  return `/favicon/vorschau-${marke.name}.png?v=${v}`;
}

/**
 * Absolute Basis für die Bild-URL der Vorschau: Messenger laden `og:image` nur absolut. Das Schema ist `https`,
 * lokal `http` (`core/lokalHttp`) — nicht `x-forwarded-proto`: hinter dem Tunnel meldet Traefik dort das
 * Schema seines eigenen Eingangs. Ein unbrauchbarer Host ergibt keine Basis.
 */
export function basisFuer(host: string): URL | undefined {
  if (!host) return undefined;
  try {
    const basis = new URL(`${lokalUeberHttp() ? "http" : "https"}://${host}`);
    return basis.hostname === host.split(":")[0].toLowerCase() ? basis : undefined;
  } catch {
    return undefined;
  }
}

/** Titelvorlage, Beschreibung und Linkvorschau für einen Host. */
export function metadatenFuerHost(host: string): Metadata {
  const marke = markeFuerHost(host);
  const bild = { url: vorschauBildUrl(marke), width: 1200, height: 630, alt: marke.titel };
  return {
    metadataBase: basisFuer(host),
    title: { default: marke.titel, template: `%s · ${marke.titel}` },
    description: SUITE_BESCHREIBUNG,
    applicationName: marke.titel,
    openGraph: {
      type: "website",
      locale: "de_DE",
      siteName: marke.titel === SUITE_NAME ? SUITE_NAME : `${marke.titel} · ${SUITE_NAME}`,
      images: [bild],
    },
    twitter: { card: "summary_large_image", images: [bild] },
  };
}
