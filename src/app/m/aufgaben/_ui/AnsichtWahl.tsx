import Link from "next/link";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import s from "./aufgaben.module.css";

/*
 * DIE ANSICHTSWAHL (Nachtrag „mehr Diversitaet im UI/UX", vierte Oberflaechen-Runde 2026-08-16) —
 * ZWEI SICHTEN AUF DIESELBEN DATEN, UMSCHALTBAR UEBER DIE ADRESSE.
 *
 * ══ DER AUFTRAG, WOERTLICH: „Notions eigentliches Merkmal sind umschaltbare Ansichten auf
 *    denselben Daten — Liste, Board, Kalender." Das Modul hatte davon keine einzige: jede Flaeche
 *    zeigte GENAU EINE Form, und welche das war, entschied die Datei.
 *
 * ══ KEIN `"use client"`, KEIN ZUSTAND, KEIN ROUTER-HOOK. Diese Datei ist eine Server Component und
 *    rendert zwei `<Link>`. Der gewaehlte Wert lebt ausschliesslich in `?ansicht=`; die Seite liest
 *    ihn serverseitig und rendert in EINEM Zug die passende Sicht. Drei Folgen, alle drei verlangt:
 *
 *      1. DIE WAHL UEBERLEBT DEN NEULADEN, ohne dass jemand sie speichern muesste — sie STEHT in
 *         der Adresse. Ein `useState` waere beim ersten `F5` fort, ein `localStorage` waere auf
 *         einem zweiten Geraet ein anderer Zustand, und beide waeren beim ersten Rendern noch
 *         nicht da (der bekannte Aufblitzer der falschen Sicht).
 *      2. DIE ADRESSE IST TEILBAR. „Sieh dir das Brett an" ist ein Link, kein Klickpfad.
 *      3. ES GIBT KEIN `Grid.useBreakpoint` UND KEINE ANSICHTSWAHL PER JS-BREAKPOINT (Spec §9.6,
 *         Auftrag ausdruecklich): die Breite entscheidet die Medienabfrage im Stylesheet, die WAHL
 *         entscheidet die Person. Zwei verschiedene Fragen, zwei verschiedene Mittel.
 *
 * ══ ZWEI VERWEISE UND KEIN AUSWAHLFELD: `_ui/ArchivFilter.tsx` (der andere URL-Zustand des Moduls)
 *    ist ein Auswahlfeld in einem GET-Formular und braucht dafuer `"use client"` samt `onChange`.
 *    (Seit der fuenften Oberflaechen-Runde am 2026-08-16 ist es antds `Select` statt eines nativen
 *    `<select>` — am Punkt hier aendert das nichts, es bleibt eine Client-Insel mit `onChange`.)
 *    Das ist dort richtig — die Prioritaetsliste waechst mit `PRIORITAETEN`. Hier gibt es GENAU
 *    ZWEI Werte, und zwei Verweise brauchen kein JavaScript, kein Formular und keine Insel: sie
 *    funktionieren auch dann, wenn nichts geladen hat. `_ui/WochenWaehler.tsx`/`_ui/TagesWaehler.tsx`
 *    aendern den URL-Zustand aus demselben Grund ueber `href`, nie ueber einen Router-Hook — kein
 *    zweites Navigations-Vokabular im Modul.
 *
 * ══ `ANSICHTEN`/`alsAnsicht` STEHEN HIER UND NICHT IN `_lib/`, und das ist erlaubt, WEIL DIESE
 *    DATEI KEIN `"use client"` TRAEGT (Falle 6): ein WERT aus einem Client-Modul kaeme in einer
 *    Server Component nicht an — `verteilen/page.tsx` bekaeme eine Client-Referenz statt des
 *    Arrays, HTTP 500 fuer die ganze Seite, und weder `build` noch Vitest saehen es. Sie stehen
 *    hier, weil die Weissliste und die Beschriftungen DIESELBE Aufzaehlung sind: wer eine dritte
 *    Sicht ergaenzt, soll sie an genau einer Stelle ergaenzen und dabei zwangslaeufig auch ihren
 *    Namen setzen.
 */

/**
 * DIE BESCHRIFTUNGEN JE SICHT — ein `Record`, damit eine dritte Sicht nicht ohne Namen bleiben
 * kann (dieselbe Bauart wie `ZUWEISUNG`/`INLINE_ART`, absichtlich).
 *
 * „BRETT" UND NICHT „TAFEL": „Die Tafel" ist in dieser Spec (§1.3) der NAME EINES VERWORFENEN
 * ENTWURFS — dreimal `Wochenplan` untereinander auf `/verteilen`. Dieselbe Vokabel fuer etwas
 * anderes zu benutzen waere die teuerste Art, Verwirrung zu sparen.
 */
export const ANSICHT_TEXT = {
  liste: "Liste",
  brett: "Brett",
} as const;

export const ANSICHTEN = ["liste", "brett"] as const;

export type Ansicht = (typeof ANSICHTEN)[number];

/**
 * DIE WEISSLISTE FUER `?ansicht=` — ein unbekannter oder fehlender Wert faellt STILL auf `liste`
 * zurueck, ohne Wurf und ohne Meldung.
 *
 * DAS IST DIESELBE LEHRE WIE BEI `/archiv`s `alsPrioritaetsFilter` und `_lib/datum.ts`s
 * `montagAusParam`, und sie steht dort ausgeschrieben: „ein URL-Parameter ist kein Formularfeld,
 * das eine Ablehnung verdient". Eine 404 oder eine Fehlermeldung fuer `?ansicht=kalender` machte
 * aus einem Tippfehler in der Adresszeile eine kaputte Seite.
 *
 * `liste` IST DIE VORGABE, UND DAS IST EINE FACHLICHE SETZUNG, KEINE ALPHABETISCHE: `/verteilen`
 * ohne Parameter ist WOERTLICH die Seite, die sie vorher war (Spec §4.4: der Stapelplatz „muss die
 * leichteste Seite des Moduls bleiben"). Das Brett ist ein ZUSATZ, den man waehlt — es draengt
 * sich niemandem auf, der nur den Posteingang abarbeiten will.
 */
export function alsAnsicht(wert: string | undefined): Ansicht {
  if (wert !== undefined && (ANSICHTEN as readonly string[]).includes(wert)) return wert as Ansicht;
  return "liste";
}

/**
 * DIE LEISTE.
 *
 * `basis` IST DER PFAD OHNE PARAMETER und kommt vom Aufrufer — dieselbe Linie wie `ArchivFilter`s
 * festes `action="/archiv"`: die AEUSSERE Pfadform (`/verteilen`), nicht `/m/aufgaben/verteilen`.
 *
 * `aria-current="page"` STATT `aria-selected` ODER `role="tab"`: das hier ist keine Registerkarte
 * (der Inhalt wechselt nicht im selben Dokument, es wird NAVIGIERT), sondern eine Navigation mit
 * einem aktuellen Eintrag. `role="tablist"` verspraeche einer Hilfstechnik Pfeiltasten-Bedienung
 * und ein `tabpanel`, das es hier nicht gibt — eine Auszeichnung, die mehr behauptet als sie
 * einloest, ist schlechter als gar keine.
 *
 * DIE GEWAEHLTE SICHT BLEIBT EIN VERWEIS (kein `<span>`): sie zeigt auf die Adresse, auf der man
 * steht, und ist damit die Stelle, an der man die Sicht in einem Lesezeichen ablegt. Ein
 * ausgetauschtes Element haette ausserdem bei jedem Wechsel eine andere Tabreihenfolge.
 */
export function AnsichtWahl({ ansicht, basis }: { ansicht: Ansicht; basis: string }) {
  return (
    <nav
      aria-label="Ansicht"
      data-rolle="ansichtwahl"
      style={{ display: "flex", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap" }}
    >
      <span style={{ ...SCHRIFT.kicker, color: "var(--auf-stahl)" }}>Ansicht</span>
      <span className={s.ansichtWahl}>
        {ANSICHTEN.map((wert) => (
          <Link
            key={wert}
            href={`${basis}?ansicht=${wert}`}
            className={s.ansichtWahlOption}
            aria-current={wert === ansicht ? "page" : undefined}
            data-ansicht={wert}
          >
            {ANSICHT_TEXT[wert]}
          </Link>
        ))}
      </span>
    </nav>
  );
}
