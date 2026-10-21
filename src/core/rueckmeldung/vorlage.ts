import { findModule } from "@/core/registry";
import { zeitFormat } from "@/core/zeit";
import type { RueckmeldungArt, RueckmeldungEingabe } from "@/core/rueckmeldung/eingabe";

/**
 * WIE EINE RÜCKMELDUNG IN ZUNDER AUSSIEHT (IDA-214, Konzept Abschnitt 5.4).
 *
 * Reine Funktion: alles, was nicht aus der Eingabe kommt (Name, Version, Zeit),
 * reicht der Aufrufer herein. So prüft `vorlage.test.ts` die Aufgabe, ohne
 * Sitzung, Umgebung oder Uhr nachzubauen.
 *
 * ⚠️ NUR DER ANZEIGENAME, NIE DIE E-MAIL-ADRESSE (Entscheidung vom 12.10.2026).
 * Die Aufgabe liegt in einer privaten Zunder-Instanz; was dort nicht gebraucht
 * wird, kommt nicht hin. Rückfragen laufen persönlich über die Bereitschaft.
 */

/**
 * ⚠️ KEIN `type` IM EINWURF. Zunder kennt `bug` und `feature` nur in
 * Dev-Projekten und lehnt sie sonst mit `400` ab; der Eingang „IDA Eingang"
 * (`IDAE`) ist ein Standardprojekt. So scheiterte jede Rückmeldung außer
 * „Sonstiges" — gemessen am 21.10.2026: in `IDAE` lagen nur Aufgaben vom Typ
 * `aufgabe`. Die Art steht deshalb im Kontextblock; den Typ setzt die Triage
 * beim Verschieben nach „IDA".
 */
export interface ZunderAufgabe {
  external_id: string;
  title: string;
  description: string;
  links: { url: string; title: string }[];
}

export interface VorlagenKontext {
  /** Anzeigename aus der Sitzung; `null`, wenn Pocket ID keinen liefert. */
  name: string | null;
  version: string;
  revision: string;
  jetzt: Date;
}

/** Die Wörter vom Formular („Worum geht es?"), damit die Triage dieselbe Sprache liest. */
const ART: Record<RueckmeldungArt, string> = {
  fehler: "Etwas klappt nicht",
  idee: "Idee oder Wunsch",
  sonstiges: "Sonstiges",
};

const ZEIT = zeitFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/**
 * Die Seite ohne Query und Fragment. ⚠️ Parameter können Kennungen oder
 * Freigabe-Schlüssel tragen; in Zunder hilft nur der Pfad.
 */
export function seiteOhneQuery(seite: string): string {
  const url = new URL(seite);
  return `${url.origin}${url.pathname}`;
}

const BROWSER: [RegExp, string][] = [
  [/Edg\/(\d+)/, "Edge"],
  [/Firefox\/(\d+)/, "Firefox"],
  [/Chrome\/(\d+)/, "Chrome"],
  [/Version\/(\d+)[\d.]* .*Safari\//, "Safari"],
];

const SYSTEM: [RegExp, string][] = [
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

/**
 * „Firefox 141 · Linux" statt eines 150 Zeichen langen User-Agents. Erkennt
 * nur die verbreiteten Browser; alles andere bleibt gekürzt stehen, statt
 * verloren zu gehen.
 */
export function kurzerBrowser(ua: string): string {
  const browser = BROWSER.map(([muster, name]) => {
    const version = muster.exec(ua)?.[1];
    return version ? `${name} ${version}` : null;
  }).find(Boolean);
  if (!browser) return ua.slice(0, 120) || "unbekannt";
  const system = SYSTEM.find(([muster]) => muster.test(ua))?.[1];
  return system ? `${browser} · ${system}` : browser;
}

const code = (wert: string) => `\`${wert.replaceAll("`", "")}\``;

export function baueAufgabe(eingabe: RueckmeldungEingabe, kontext: VorlagenKontext): ZunderAufgabe {
  const modul = findModule(eingabe.modulKey);
  const seite = seiteOhneQuery(eingabe.seite);
  const pfad = new URL(seite).pathname;
  const version =
    kontext.revision === "unbekannt"
      ? kontext.version
      : `${kontext.version} (${code(kontext.revision.slice(0, 7))})`;
  const browser = [
    kurzerBrowser(eingabe.browser),
    eingabe.fenster,
    eingabe.thema === "dark" ? "Dunkel" : eingabe.thema === "light" ? "Hell" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const kopf = [
    `**Gemeldet von:** ${kontext.name?.trim() || "unbekannt"} · **Art:** ${ART[eingabe.art]}`,
    `**Modul:** ${modul ? `${modul.title} (${code(modul.key)})` : "unbekannt"} · **Seite:** ${code(pfad)}`,
    `**Version:** ${version} · **Zeit:** ${ZEIT.format(kontext.jetzt)}`,
    `**Browser:** ${browser}`,
    `**Eingang:** iuk-suite, Rückmeldung ${code(eingabe.id)}`,
  ].join("  \n");

  return {
    external_id: eingabe.id,
    title: eingabe.titel,
    description: eingabe.text ? `${eingabe.text}\n\n---\n\n${kopf}` : kopf,
    links: [{ url: seite, title: "Gemeldet auf" }],
  };
}
