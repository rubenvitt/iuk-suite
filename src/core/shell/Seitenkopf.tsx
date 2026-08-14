import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * OHNE ZIFFERNSTELLUNG, UND DAS IST HIER DIE ALLGEMEINE REGEL, NICHT NUR
 * LAGERBUCHS AUSNAHME. `core/theme/schrift.ts` setzt `fontVariantNumeric:
 * "tabular-nums lining-nums"` auf JEDER Rolle, weil dieselben Rollen auch
 * Tabellenzellen und KPI-Werte bedienen — dort MUESSEN Ziffern
 * untereinanderstehen, damit Spalten vergleichbar bleiben. Eine Ueberschrift
 * vergleicht nichts: `titel` und `neben` tragen hier deshalb ihre Rolle ohne
 * diese Eigenschaft. `lagerbuch/_lib/schrift.ts` hatte dieselbe Begruendung
 * bereits fuer sich allein aufgeschrieben (Funktion `ohneZiffernstellung`);
 * sie gilt fuer den Seitenkopf gleichermaszen und jetzt fuer alle vier
 * Module, nicht nur fuer Lagerbuch. Eigene, kleine Kopie statt Import aus
 * `lagerbuch/_lib/`: das waere die falsche Richtung, Modul-Interna sind kein
 * API von `core` aus.
 */
function ohneZiffernstellung(rolle: CSSProperties): CSSProperties {
  const rest = { ...rolle };
  delete rest.fontVariantNumeric;
  return rest;
}

/**
 * DER KOPF JEDER ARBEITSSEITE DER SUITE.
 *
 * Er lag bis 2026-08-13 als `lagerbuch/_ui/SeitenKopf.tsx` bei einem Modul,
 * während `feedback`, `files` und `portal` ihre Überschriften jeweils selbst
 * bauten. Drei belegbare Nutznießer erfüllen den Maßstab aus
 * `docs/design/README.md`; `lagerbuch` behält seinen Namen als Adapter
 * darüber, genau wie `SCHRIFT` es vorgemacht hat.
 *
 * KEINE CLIENT-DIREKTIVE, und das ist der Punkt: die Überschrift ist NACKTES
 * `<h1>` mit einer Typografie-Rolle, nicht `Typography.Title`. Ein
 * Compound-Zugriff auf antd ergibt in einer Server Component HTTP 500
 * (Falle 1) — und die Alternative „macht die Überschrift halt zu einer
 * Client-Insel" kostete über vierzig Client-Grenzen für eine Zeile Text.
 *
 * `zurueck` ist der einzige Zuwachs gegenüber der Lagerbuch-Fassung. „Führt
 * jede Seite zurück, oder ist sie eine Sackgasse?" ist eine Prüf­frage aus
 * `docs/design/README.md` und hatte bisher keinen gemeinsamen Träger.
 * `next/link` und nicht `<a>`: der Weg bleibt im selben Modul, ein `<a>` warf
 * die ganze Anwendung weg und lud sie neu.
 *
 * KEIN ZEICHEN AM RÜCKWEG. `@ant-design/icons` in einer Server Component
 * ergibt HTTP 500 schon beim Import, und `"use client"` behebt das nicht, es
 * macht es still (Falle 7). Das Pfeilzeichen steht deshalb als Textliteral da.
 *
 * `<nav aria-label="Zurück">` UM DEN LINK (Nachtrag, Review Aufgabe 9): die
 * Vorlage `lagerbuch/_ui/Brotkrume.tsx` — seit dem 13.08.2026 gelöscht, dieser
 * Baustein hat sie abgelöst — fasste denselben Link in ein benanntes Landmark
 * (`aria-label="Brotkrume"`); ohne eigenes Landmark hier verlieren alle
 * Seiten, die auf `zurueck` umstellen, das Sprungziel — per Screenreader
 * springt man zwischen Landmarks, statt den Kopfbereich zu durchlaufen. Der
 * Name ist bewusst NICHT „Brotkrume" abgeschrieben: beide Fassungen rendern
 * genau EINEN Link, keine mehrstufige Brotkrume (nachgemessen, nicht
 * angenommen) — „Brotkrume" wäre ein Modulname, der die Sache falsch
 * beschreibt. „Zurück" trifft die Funktion.
 *
 * DAS PFEILZEICHEN TRÄGT `aria-hidden` (Nachtrag, Review Aufgabe 9): anders
 * als `Brotkrume`, die ein SVG-Icon benutzte (in `ikonen.tsx` bereits
 * `aria-hidden`+`focusable="false"`, weil „alle Zeichen dekorativ" sind), ist
 * `‹` hier ein bloßes Textzeichen und würde ohne `aria-hidden` mitgelesen —
 * als Wortlaut ("kleiner als", Zeichenname o. ä.) unpassend vor dem eigentlich
 * gemeinten Linktext. Der zugängliche Name bleibt dadurch schlicht der Titel
 * des Rückwegs.
 *
 * `minHeight: 44` AM RÜCKWEG-LINK (zweiter Nachtrag, Review Aufgabe 9): Aufgabe
 * 8 hat die 44px-Tapfläche (WCAG 2.5.5) verbindlich gemacht und die
 * `size="small"`-Ausnahme aus `docs/design/README.md` gestrichen — elf
 * Fundstellen in den Aufgaben 8/9 sind seither dafür zurückgenommen worden.
 * `Brotkrume.tsx` hatte diese Fläche für denselben Link schon
 * (`.backlink { min-height: 44px }`); der Rückweg hier unterbot sie, bis
 * dieser Nachtrag es behob. Übernommen ist NICHT die CSS-Klasse selbst —
 * `Brotkrume` war Modul-CSS, dieser Baustein liegt in `core` und bekommt einen
 * Inline-Stil, wie der Rest der Komponente. Übernommen ist das MUSTER:
 * `display: "inline-flex"` + `alignItems: "center"` statt weiterhin
 * `"inline-block"`, denn `min-height` allein zentriert eine Zeile nicht — ohne
 * die beiden zusätzlichen Eigenschaften stünde der Text am oberen Rand einer
 * jetzt deutlich höheren Box. Die `44` steht als Literal da: `ARBEITSDICHTE`
 * (`core/theme/theme.ts`) setzt zwar `controlHeight: 44`, aber das ist ein
 * antd-Token für antd-Komponenten — dieser Rückweg ist ein rohes `<Link>`
 * außerhalb jeder antd-Steuerung und erbt den Wert nicht.
 *
 * DER ABSTAND ZUR ÜBERSCHRIFT BLEIBT `SPACE.xs`, UNVERÄNDERT — geprüft, nicht
 * übersehen. Die 44px-Box wächst symmetrisch um den Text (zentriert), das
 * verschiebt die Überschrift auf jeder Seite mit `zurueck` sichtbar nach
 * unten (grob abgeschätzt anhand der Zeilenhöhe von `neben`, 12px/normal, auf
 * gut 25–30px zusätzliche Boxhöhe — mit echten Schriftmetriken nicht
 * nachgemessen, dieser Aufgabe fehlt dafür ein Browser-Lauf). Diese
 * Verschiebung wird bewusst NICHT durch einen kleineren Randwert
 * kaschiert: sie ist die direkte, gewollte Folge der Tapflächen-Vorgabe,
 * kein Layoutfehler — dieselbe Kategorie wie die elf bereits akzeptierten
 * Vergrößerungen in den Aufgaben 8/9. Ein `marginBlockEnd` kleiner als
 * `SPACE.xs` würde nur den Abstand HINTER einer ohnehin schon großzügigen,
 * zentrierten Box weiter verkleinern, nicht die Boxhöhe selbst, und stünde
 * damit ohne eigenen Nutzen da.
 *
 * `gap: SPACE.xs` STATT EINES LEERZEICHENS IM `<span>` (dritter Nachtrag,
 * Review Aufgabe 9 — im Browser nachgemessen, nicht im Kopf gerechnet): das
 * `<span aria-hidden="true">‹ </span>` trug sein Leerzeichen bis hierher als
 * SICHTBARKEITSTRÄGER des Abstands zum Linktext. Unter `inline-block` (Stand
 * nach dem ersten Nachtrag) rendert ein Leerzeichen am Zeilenende eines
 * Inline-Kindelements normal; unter `inline-flex` (seit dem zweiten Nachtrag,
 * s. o.) bildet das `<span>` sein EIGENES Flex-Zeilenkastenende, und ein
 * NACHGESTELLTES Leerzeichen wird dort abgeschnitten — nachgemessen mit einer
 * isolierten HTML-Seite im echten Browser: `A` (heutiger Stand: `inline-flex`,
 * Leerzeichen im `span`) rendert exakt so breit wie `E` (Kontrolle ohne jedes
 * Leerzeichen) — das Leerzeichen trug NULL Pixel bei. `D` (Referenz:
 * `inline-block`, dasselbe Leerzeichen) war dagegen ~2,7px breiter als seine
 * Kontrolle — dort trug es sichtbar bei. Ergebnis: `‹Artikel` statt
 * `‹ Artikel` auf jeder Seite mit `zurueck`, seit dem zweiten Nachtrag. Kein
 * Test kann das sehen: `textContent` enthält das Leerzeichen im DOM-String
 * weiterhin, `jsdom` rendert kein Flex-Layout — die Kollabierung ist rein
 * visuell und damit eine Grenze des Testwerkzeugs, nicht der Zusicherungen.
 *
 * `Brotkrume.tsx` hatte die Antwort für dieselbe Bauform (Zeichen-Element plus
 * Text im Flex-Container) bereits: `.backlink { gap: 6px }`. NICHT
 * abgeschrieben — `Brotkrume` war Modul-CSS mit eigener Skala, `core` zieht
 * Abstände aus `SPACE` (`core/theme/tokens.ts`). Gewählt: `SPACE.xs` (4px),
 * nicht `SPACE.sm` (8px) — nachgemessen ist der ORIGINALE Leerzeichen-Abstand
 * unter `inline-block` rund 2,7px; `SPACE.xs` liegt dem am nächsten und hält
 * die Anmutung nah am Stand vor dem zweiten Nachtrag, `SPACE.sm` hätte den
 * Abstand optisch fast verdreifacht. `gap` und nicht mehr das Leerzeichen im
 * `<span>`: mit beiden Quellen nebeneinander würde eine spätere Änderung an
 * einer davon das Bild still verschieben — `gap` ist jetzt die EINE Quelle.
 */
export function Seitenkopf({
  titel,
  beschreibung,
  aktionen,
  zurueck,
}: {
  titel: string;
  beschreibung?: ReactNode;
  aktionen?: ReactNode;
  zurueck?: { titel: string; href: string };
}) {
  return (
    <div style={{ marginBlockEnd: SPACE.lg }}>
      {zurueck ? (
        <nav aria-label="Zurück">
          <Link
            data-testid="seitenkopf-zurueck"
            href={zurueck.href}
            style={{
              ...ohneZiffernstellung(SCHRIFT.neben),
              display: "inline-flex",
              alignItems: "center",
              gap: SPACE.xs,
              minHeight: 44,
              marginBlockEnd: SPACE.xs,
              color: "inherit",
            }}
          >
            <span aria-hidden="true">‹</span>
            {zurueck.titel}
          </Link>
        </nav>
      ) : null}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: SPACE.md,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...ohneZiffernstellung(SCHRIFT.titel), margin: 0 }}>{titel}</h1>
          {beschreibung ? (
            <p
              data-testid="seitenkopf-beschreibung"
              style={{
                ...ohneZiffernstellung(SCHRIFT.neben),
                margin: `${SPACE.xs}px 0 0`,
                maxWidth: "72ch",
              }}
            >
              {beschreibung}
            </p>
          ) : null}
        </div>
        {aktionen ? (
          <div
            data-testid="seitenkopf-aktionen"
            style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}
          >
            {aktionen}
          </div>
        ) : null}
      </div>
    </div>
  );
}
