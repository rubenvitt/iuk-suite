import type { ReactNode } from "react";
import Link from "next/link";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { beenden } from "../_actions/sitzung";
import { uhrzeit } from "../_lib/anzeige";
import type { AusleihZugang } from "../_lib/ausleihZugang";
import { Ikone, type IkonName } from "./ikonen";
import { Restzeit } from "./Restzeit";
import s from "./ausleihe.module.css";

/**
 * DER RAHMEN DES AUSLEIH-ZWEIGS — Spec 1 §4.2 (`:3374-3392`).
 *
 * ⬜ L10 — DIE ZEICHENKETTE FUER DEN CUTOVER-PRUEFSATZ.
 * Der Generalprobe-Pruefsatz (§P.9, `docs/superpowers/plans/2026-08-18-plan3-radio-generalprobe.md:91`,
 * abgelesen in `docs/superpowers/plans/2026-08-18-radio-cutover-leitplan.md:266,277,906`)
 * faehrt `curl` gegen den
 * PORTAL-Host und prueft per `grep -c`, dass eine Zeichenkette aus DIESEM Rahmen dort
 * NICHT vorkommt — der Beweis, dass der Host-Riegel auf Login faellt statt auf die
 * Ausleihflaeche.
 * Der Wert ist: "radio-ausleih-rahmen"
 * ⛔ Wer ihn aendert, aendert einen Cutover-Schritt mit. Dann HIER und im Runbook.
 * ⛔ Er ist ausdruecklich NICHT die Wortmarke: `src/core/registry.ts:197` fuehrt fuer
 * dieses Modul `title: "Funkgeräte"`, und der App-Umschalter des Portals rendert genau
 * diesen Titel — die Wortmarke stuende im Portal-HTML und machte den Schritt wertlos.
 * ⛔ Und er traegt keinen Umlaut, weil er zum Grep-Anker eines Runbooks wird.
 * `AusleihRahmen.test.tsx` haelt drei Haelften fest: dass er im GERENDERTEN Ergebnis
 * steht, dass diese Belegzeile denselben Wert nennt, und dass keine Portal- oder
 * Huellen-Quelle ihn fuehrt. ⬜ Die vierte — das ausgelieferte Portal-HTML — kann nur der
 * `curl` des Cutover-Abends.
 *
 * ⛔ SERVER COMPONENT, KEIN "use client". Die einzige Insel darin ist `_ui/Restzeit.tsx`
 * (Spec:3380: „alles Server, keine Ausnahme ausser der Restzeit"). Ein "use client" hier
 * liesse `AusleihZugang` als Client-Referenz ankommen — Falle 6, HTTP 500, und Vitest kann
 * es strukturell nicht sehen.
 *
 * ⛔ KEINE `<Shell>` UND KEIN ANTD — Entscheidung E9 (`briefs/KOPF.md`, A16). `MinimalShell`
 * setzte einer Besucherin ohne Sitzung eine Suite-Kopfzeile mit Kachelliste vor,
 * `KioskShell` verboete das Scrollen einer Geraeteliste (Spec:3362-3376). Die Flaeche erbt
 * dadurch `controlHeight: TAP = 56` vom Wurzelprovider (`src/core/theme/theme.ts:50-51`),
 * weil `AntdProvider` in der Wurzel-Huelle sitzt (`src/app/layout.tsx:165`) und `radio`
 * keine `FullShell` faehrt, die `ARBEITSDICHTE: 44` darueberlegte (`theme.ts:207-209`).
 * ⛔ `size` wird deshalb auf keinem Element gesetzt (Falle 4: `size="large"` ist 72), und
 * die 44er- und 64er-Masze sind CSS-Klassen — ⛔ KEIN zweiter `ConfigProvider`, der waere
 * eine Client-Komponente und machte den Server-Rahmen zur Client-Grenze (E8).
 *
 * ⛔ DIE AKTIVMARKIERUNG IST EIN SERVER-PROP, KEIN `usePathname()`
 * (Bauform-Zulaessigkeitstafel Zeile 16). Zwei Gruende, jeder fuer sich hinreichend: der
 * Hook machte den Rahmen zur Client-Grenze, und er liefert den AEUSSEREN Pfad — auf dem
 * zweiten Weg (`/m/radio/geraete`, `src/core/routing.ts:54-67`) markierte die Leiste
 * dauerhaft den falschen Eintrag, wie in `lagerbuch/_ui/HelferRahmen.tsx:14-26` gemessen.
 * Der Server kennt das Segment ohnehin.
 *
 * ⛔ DER ABMELDEWEG IST EIN FORMULAR, KEIN LINK (Zulaessigkeitstafel Zeile 15, NS-Z3).
 * Nexts Prefetch fordert ein Linkziel beim blossen Darueberfahren an und beendete die
 * Sitzung ungefragt; ein POST-Formular ist nicht prefetch-faehig. `beenden` ist die
 * Server Action aus `_actions/sitzung.ts` — ⛔ kein `signOut`, das raeumte die
 * Suite-Sitzung auf ALLEN Modul-Hosts (Spec:2610-2614).
 *
 * ⛔ KEIN `viewport`-Export UND KEIN `manifest.webmanifest` (§4.9.4, Spec:3392).
 *
 * ⚠️ DIE DREI ANGABEN SIND PFLICHT-PROPS. Ein Layout kann einer Seite keine Props reichen;
 * deshalb steht der Rahmen in den drei Seiten (A18-A20) und nicht im Layout, und jede
 * holt sich `requireAusleihZugang(getDb())` selbst — dasselbe gecachte Handle. Dieselbe
 * Bauform wie `lagerbuch/_ui/HelferRahmen.tsx:29-36`.
 */

/** Die drei Ziele der Fussnavigation — Uebersicht liegt auf `/geraete`, nicht auf `/`. */
const FUSSNAV: readonly { schluessel: AusleihAbschnitt; href: string; text: string; zeichen: IkonName }[] = [
  /*
   * ⛔ AEUSSERE PFADE, und das bleibt so. Innere (`/m/radio/geraete`) wuerden auf dem
   * Modul-Host doppelt praefixiert (`lagerbuch/_ui/HelferRahmen.tsx:37-40`).
   * ⛔ „Uebersicht" zeigt auf `/geraete` und NICHT auf `/`: dort liegt das Gate
   * (Entscheidung E1) — zwei Dateien auf demselben Pfad lehnt Next beim Build ab, und
   * `_lib/routen.test.ts` fuehrt beide Pfade nebeneinander.
   */
  { schluessel: "uebersicht", href: "/geraete", text: "Übersicht", zeichen: "kacheln" },
  { schluessel: "ausleihen", href: "/ausleihen", text: "Ausleihen", zeichen: "funk" },
  { schluessel: "rueckgabe", href: "/rueckgabe", text: "Zurückgeben", zeichen: "zuruecksetzen" },
];

/** Der Abschnitt, den die aufrufende Seite markiert haben will. */
export type AusleihAbschnitt = "uebersicht" | "ausleihen" | "rueckgabe";

export function AusleihRahmen({
  aktiv,
  zugang,
  children,
}: {
  aktiv: AusleihAbschnitt;
  zugang: AusleihZugang;
  children: ReactNode;
}) {
  /*
   * EINE Ablesung fuer die Ablaufgrenze. `new Date()` und NICHT `Date.now()`:
   * `react-hooks/purity` verbietet den Aufruf einer unreinen Funktion im Render und ist im
   * Projekt ein Lint-FEHLER (dieselbe Form wie `lagerbuch/_ui/HelferRahmen.tsx:61-69`).
   * Die Differenz zweier Zeitstempel ist reine ms-Arithmetik und zonenunabhaengig.
   */
  const jetzt = new Date();

  /*
   * DAS SITZUNGSETIKETT KOMMT VOM RIEGEL, NICHT AUS DEM COOKIE (Spec:3382-3384). Die
   * Cookie-Nutzlast traegt nur `codeId` (Spec:2504-2507); eine dort eingefrorene
   * Bezeichnung waere zwoelf Stunden alt, waehrend die DB-Zeile aktuell ist.
   *
   * ⚠️ DER RUECKFALL IST EINE ANZEIGEENTSCHEIDUNG, KEIN GERATENER WERT: `name` ist im
   * Suite-Zweig `string | null` (`_lib/ausleihZugang.ts`), und die einzige andere Angabe
   * jenes Zweigs ist `sub` — eine undurchsichtige Kennung, die auf keinen Bildschirm
   * gehoert.
   */
  const etikett =
    zugang.weg === "code" ? `Zugang: Code ${zugang.bezeichnung}` : (zugang.name ?? "Angemeldet über die Suite");

  /*
   * ⛔ DER RUECKWEG IN DIE SUITE NUR MIT SITZUNG (Spec:3387-3391, Gegenprobe
   * `docs/design/README.md:420`): wer ueber einen QR-Code kam, hat keine Suite-Sitzung —
   * der Link fuehrte sie in den Login. `moduleUrl` liefert `null`, solange das Portal
   * keinen Prod-Host hat; dann gibt es keinen Link statt eines toten
   * (`src/core/shell/moduleUrl.ts:4-13`).
   */
  const portal = zugang.weg === "suite" ? moduleUrl("portal") : null;

  return (
    <div className={s.rahmen} data-rolle="radio-ausleih-rahmen">
      <header className={s.kopf}>
        <div>
          <div className={s.marke}>Funkgeräte</div>
          <div className={s.etikett} data-rolle="radio-sitzungsetikett">
            {etikett}
          </div>
          {zugang.weg === "code" ? (
            /*
             * Uhrzeit UND Ablaufentscheidung rechnet der SERVER; die Insel zeigt und
             * wechselt nur. ⚠️ Die Grenze steht hier ausgeschrieben statt aus
             * `Restzeit.tsx` importiert — DAS IST FALLE 6, nicht Nachlaessigkeit: jene
             * Datei traegt "use client", ein WERT von dort kaeme hier als Client-Referenz
             * an. Wandert die Grenze, gehoert sie in ein Modul ohne "use client".
             */
            <Restzeit
              uhrzeit={uhrzeit(zugang.laeuftAb)}
              laeuftAb={zugang.laeuftAb}
              abgelaufenInitial={zugang.laeuftAb.getTime() <= jetzt.getTime()}
            />
          ) : null}
        </div>

        <div className={s.kopfEnde}>
          {portal !== null ? (
            <Link href={portal} className={s.portalLink} data-rolle="radio-portallink">
              Zur Suite
            </Link>
          ) : null}
          <form action={beenden}>
            <button className={s.beenden} type="submit" data-rolle="radio-beenden">
              <Ikone name="kreuz" groesse={14} />
              Beenden
            </button>
          </form>
        </div>
      </header>

      <main className={s.inhalt}>{children}</main>

      <nav className={s.fussnav} aria-label="Ausleihe-Bereiche" data-rolle="radio-fussnav">
        {FUSSNAV.map((eintrag) => (
          /*
           * `aria-current="page"` IST die Zusage, die CSS-Klasse folgt daraus
           * (`ausleihe.module.css`, `.navEintrag[aria-current="page"]`) — nicht umgekehrt.
           * Beide Eintraege tragen deshalb dieselbe Klassenliste; damit prueft ein
           * spaeterer e2e dieselbe Sache, die eine Bildschirmleserin hoert.
           */
          <Link
            key={eintrag.schluessel}
            href={eintrag.href}
            className={s.navEintrag}
            aria-current={aktiv === eintrag.schluessel ? "page" : undefined}
          >
            <Ikone name={eintrag.zeichen} groesse={22} />
            <span className={s.navText}>{eintrag.text}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
