"use client";

import { useRef, useTransition, type DragEvent, type ReactNode } from "react";
import { einplanenAction, rangVerschiebenAction } from "../actions";
import { FORM_START } from "../_lib/formState";
import s from "./aufgaben.module.css";

/*
 * ZIEHEN ZWISCHEN TAGEN UND INNERHALB EINES TAGES (Aufgabe 20, Spec §8.1, §8.5, §9.4, §9.6) — eine
 * ZUSAETZLICHE Bedienart ab 768px, KEIN Ersatz. Die Knopfstrecke aus Aufgabe 12 (`RangKnoepfe.tsx`,
 * `EinplanenFormular.tsx`) BLEIBT: sie ist der Weg, der auf dem Handy, mit der Tastatur und mit
 * einem Screenreader funktioniert, und Ziehen ist keines davon (Brief, Spec §8.5).
 *
 * `"use client"` STEHT IN ZEILE 1, VOR JEDEM KOMMENTAR. KEIN `@ant-design/icons` — diese Datei
 * braucht ohnehin keines (der Ziehgriff ist ein reines Textzeichen, s. `Wochenplan.tsx`).
 *
 * NUR EIN WRAPPER, KEINE ZWEITE RENDERKOPIE: `Wochenplan.tsx`/`TagSpalte`/`EintragZeile` bleiben
 * Server Components und rendern die Tagesspalten UNVERAENDERT serverseitig, inklusive der
 * `data-tag`/`data-aufgabe-id`/`data-plan-index`-Attribute, ueber die dieser Wrapper Ziel und
 * Quelle eines Zugs identifiziert. Diese Datei rechnet NICHTS ueber Aufgaben oder Reihenfolge neu —
 * sie liest nur, was serverseitig schon berechnet und als Attribut ins DOM geschrieben wurde
 * (`_db/queries.ts`s `rangGrenzen`, jetzt mit `index`). Das ist genau die Zusage aus dem Brief:
 * „keine zweite Rangberechnung im Browser“.
 *
 * DIESER `<div>` IST `.wochenGitter` SELBST, KEIN ZUSAETZLICHER WRAPPER DARIN: die CSS-Grid-Spalten
 * (`grid-template-columns: repeat(5, ...)`, `aufgaben.module.css`) verlangen die fuenf `TagSpalte`-
 * Divs als DIREKTE Kinder. Ein eigenes Huellenelement INNERHALB von `.wochenGitter` haette das
 * Rastermass gebrochen — deshalb traegt genau dieses Element die Klasse/`data-rolle`, die vorher in
 * `Wochenplan.tsx` stand (s. `git log` fuer den Vorher-Zustand), und `Wochenplan.tsx` haengt nur noch
 * `<ZiehBereich>` um dieselben `TagSpalte`-Kinder.
 *
 * DIESELBE ACTION, DASSELBE PRAEDIKAT (Brief): dieser Wrapper ruft AUSSCHLIESSLICH
 * `einplanenAction`/`rangVerschiebenAction` aus `../actions.ts` — dieselben Funktionen, die
 * `RangKnoepfe.tsx`/`EinplanenFormular.tsx` aufrufen. Die Berechtigung (`darfPlanAendern`) liegt
 * darin bereits vollstaendig; `interaktiv` unten ist NUR die Affordanz (kein `draggable`, keine
 * Ereignisverarbeitung), nicht die Pruefung — ein manipuliertes `drop`-Ereignis waere serverseitig
 * ohnehin abgelehnt, dieselbe Zusicherung wie bei `RangKnoepfe`s `disabled`.
 *
 * `in_arbeit` IST OHNE SONDERFALL ZIEHBAR (Spec-Nachtrag `72ef235`): diese Datei fragt `status`
 * nirgends ab, genau wie `einplanenAction` selbst — die Pruefung liegt vollstaendig in `uebergang()`.
 *
 * ROUTINEN SIND STRUKTURELL NIE ZIEHBAR: nur `EintragZeile`s AUFGABEN-Zweig traegt
 * `data-aufgabe-id`/`draggable` (`Wochenplan.tsx`), eine Routine hat beides nie. Dieser Wrapper baut
 * dafuer keine eigene Fallunterscheidung — `onDragStart`/`onDrop` finden per `closest()` schlicht
 * kein Attribut und tun nichts.
 *
 * SICHTBARKEIT VOR DEM LOSLASSEN (Brief: „Ziel und Wirkung muessen sichtbar sein, bevor losgelassen
 * wird“): `markiere()` setzt beim Ueberfahren eines gueltigen Ziels (Tagesspalte oder einzelne Zeile)
 * einen `outline` PER INLINE-STYLE — keine neue CSS-Klasse, keine `transition`. Das ist bewusst kein
 * Bewegungseffekt (Spec §9.4, Merkposten aus Aufgabe 5): ein `outline`-Wechsel ist ein diskreter
 * Zustandswechsel wie `.kpiLink:hover` es fuer Hintergrund schon ist, keine Animation. `aufgaben.
 * module.css` bekommt dafuer KEINE neue Regel und KEINE zweite Medienabfrage — siehe Bericht.
 *
 * EIN ABGEBROCHENER ZUG AENDERT NICHTS (Brief): `onDrop` ist die EINZIGE Stelle, die eine Action
 * ruft. Escape oder ein Loslassen ausserhalb jeder `[data-tag]`-Flaeche fuehrt beim Browser nie zu
 * einem `drop`-Ereignis (nur zu `dragend`) bzw. `onDrop` bricht selbst fruehzeitig ab (kein Ziel,
 * Ziel = Quelle) — in beiden Faellen wird keine Action gerufen.
 *
 * DIE RANGBERECHNUNG BEIM ABLEGEN INNERHALB EINES TAGES (Brief: „ueberleg, wie du sie auf planRang
 * abbildest, und benutz die Rang-Action aus Aufgabe 12“): `zielAusAblage` (unten, eine REINE
 * Funktion ohne DOM) bildet Quell-/Zielposition auf eine Anzahl `hoch`/`runter`-Schritte ab.
 * `onDrop` ruft `rangVerschiebenAction` dafuer SO OFT WIE NOETIG, hintereinander — jeder einzelne
 * Aufruf tauscht nur mit dem unmittelbaren Nachbarn (server-seitig, `_db/queries.ts`s
 * `planEintraegeFuerTag`), das Endergebnis ist eine Verschiebung um genau die berechnete Distanz.
 * KEINE zweite, eigene `planRang`-Zuweisung hier — genau das verbietet der Brief.
 *
 * CROSS-TAG-ZUEGE LANDEN AM TAGESENDE (Spec §8.5-Nachtrag, `einplanenAction`s Kopfkommentar): die
 * Zielposition INNERHALB eines fremden Tages ist beim Ziehen zwischen Tagen nicht frei waehlbar
 * (Brief nennt das Schema aus Aufgabe 10 als geltend: „neuer Eintrag ans Ende des Zieltags“), deshalb
 * ruft dieser Zweig `einplanenAction` mit dem Zieltag und laesst `planRangFuerEinplanen`
 * (`_db/queries.ts`) die Position bestimmen. `planUhrzeit` wird dabei UNVERAENDERT mitgegeben
 * (`data-plan-uhrzeit`, aus `eintrag.aufgabe.planUhrzeit`) — `einplanenAction` ueberschreibt das Feld
 * IMMER (anders als `dauerMinuten`, wo Leerstring „unveraendert“ heisst), ein leer gesendetes Feld
 * loeschte hier also eine bestehende Uhrzeit still. `dauerMinuten` bleibt leer (unveraendert) —
 * Ziehen setzt nie eine neue Dauer.
 */

export interface ZielTag {
  art: "tag";
  planDatum: string;
}
export interface ZielRang {
  art: "rang";
  richtung: "hoch" | "runter";
  schritte: number;
}
export type Ziel = ZielTag | ZielRang | null;

/**
 * REINE ABBILDUNG ABLAGEORT → WIRKUNG, OHNE DOM UND OHNE NETZWERK — deshalb ohne jedes
 * Zeigergeraet in `ZiehBereich.test.tsx` vollstaendig pruefbar, waehrend der eigentliche Zug (das
 * Zeigergeraet, die echte Ereigniskette) ausschliesslich der Playwright-Fall beweisen kann (Brief:
 * „Ziehen ist die eine Bedienart, die ein jsdom-Test strukturell nicht beweisen kann“).
 *
 * `zielIndex: null` BEDEUTET „kein bestimmter Nachbar getroffen“ (leere Flaeche unterhalb der
 * letzten Zeile) und wird auf „ans Ende dieses Tages“ abgebildet — NICHT auf „kein Zug“: ein
 * Loslassen auf sich selbst (`zielIndex === quellIndex`) ist der einzige echte No-Op-Fall, und den
 * schliesst `ZiehBereich.tsx`s `onDrop` bereits VOR dem Aufruf hier aus (getroffene Zeile === Quelle).
 */
export function zielAusAblage(params: {
  quellTag: string;
  zielTag: string;
  quellIndex: number;
  zielIndex: number | null;
  anzahlZielTag: number;
}): Ziel {
  const { quellTag, zielTag, quellIndex, zielIndex, anzahlZielTag } = params;
  if (quellTag !== zielTag) {
    return { art: "tag", planDatum: zielTag };
  }
  if (anzahlZielTag <= 0) return null;
  const ziel = zielIndex ?? anzahlZielTag - 1;
  if (ziel === quellIndex) return null;
  return ziel > quellIndex
    ? { art: "rang", richtung: "runter", schritte: ziel - quellIndex }
    : { art: "rang", richtung: "hoch", schritte: quellIndex - ziel };
}

interface GezogeneAufgabe {
  id: string;
  tag: string;
  index: number;
  planUhrzeit: string;
}

/** Eine Zeichenkette als nicht-negative Ganzzahl, oder `null` — `data-*`-Attribute sind immer Strings. */
function alsIndex(wert: string | undefined): number | null {
  if (wert === undefined) return null;
  const n = Number(wert);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function ZiehBereich({
  interaktiv,
  children,
}: {
  /** `darfPlanAendern` fuer die angezeigte Person — vom Aufrufer (`Wochenplan.tsx`) durchgereicht,
   * NICHT hier neu geprueft (Kopfkommentar: dasselbe Praedikat, keine zweite Fassung). */
  interaktiv: boolean;
  children: ReactNode;
}) {
  const [, startTransition] = useTransition();
  const gezogenRef = useRef<GezogeneAufgabe | null>(null);
  const markiertRef = useRef<HTMLElement | null>(null);

  function markiere(el: HTMLElement | null): void {
    if (markiertRef.current === el) return;
    if (markiertRef.current) {
      markiertRef.current.style.outline = "";
      markiertRef.current.style.outlineOffset = "";
    }
    if (el) {
      el.style.outline = "2px dashed var(--auf-stahl-text)";
      el.style.outlineOffset = "-2px";
    }
    markiertRef.current = el;
  }

  function aufraeumen(): void {
    markiere(null);
    gezogenRef.current = null;
  }

  function onDragStart(ereignis: DragEvent<HTMLDivElement>): void {
    if (!interaktiv) return;
    const ziel = ereignis.target as HTMLElement;
    const griff = ziel.closest<HTMLElement>("[data-aufgabe-id]");
    const spalte = griff?.closest<HTMLElement>("[data-tag]");
    const index = alsIndex(griff?.dataset.planIndex);
    if (!griff || !spalte || index === null) return;
    gezogenRef.current = {
      id: griff.dataset.aufgabeId!,
      tag: spalte.dataset.tag!,
      index,
      planUhrzeit: griff.dataset.planUhrzeit ?? "",
    };
    // Firefox verlangt gesetzte Nutzdaten, sonst startet der Zug gar nicht erst — der Wert selbst
    // wird nirgends gelesen, die Quelle steht in `gezogenRef` (React-State, nicht `dataTransfer`).
    ereignis.dataTransfer.setData("text/plain", griff.dataset.aufgabeId ?? "");
    ereignis.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(ereignis: DragEvent<HTMLDivElement>): void {
    if (!interaktiv || !gezogenRef.current) return;
    const ziel = ereignis.target as HTMLElement;
    const spalte = ziel.closest<HTMLElement>("[data-tag]");
    if (!spalte) {
      markiere(null);
      return;
    }
    // NUR bei gueltigem Ziel `preventDefault()` — sonst erlaubt der Browser den Drop nirgends
    // (Standardverhalten: kein Element ist ein Drop-Ziel, solange `dragover` es nicht zulaesst).
    ereignis.preventDefault();
    const zeile = ziel.closest<HTMLElement>("[data-aufgabe-id]");
    markiere(zeile ?? spalte);
  }

  function onDrop(ereignis: DragEvent<HTMLDivElement>): void {
    const gezogen = gezogenRef.current;
    aufraeumen();
    if (!interaktiv || !gezogen) return;
    const ziel = ereignis.target as HTMLElement;
    const spalte = ziel.closest<HTMLElement>("[data-tag]");
    if (!spalte) return; // Loslassen ausserhalb jeder Tagesspalte — aendert nichts (Brief).
    ereignis.preventDefault();
    const zielTag = spalte.dataset.tag!;

    const zielZeile = ziel.closest<HTMLElement>("[data-aufgabe-id]");
    if (zielZeile?.dataset.aufgabeId === gezogen.id) return; // auf sich selbst fallengelassen.
    const zielIndex = alsIndex(zielZeile?.dataset.planIndex);
    const anzahlZielTag = spalte.querySelectorAll("[data-aufgabe-id]").length;

    const wirkung = zielAusAblage({
      quellTag: gezogen.tag,
      zielTag,
      quellIndex: gezogen.index,
      zielIndex,
      anzahlZielTag,
    });
    if (!wirkung) return;

    startTransition(async () => {
      if (wirkung.art === "tag") {
        const formData = new FormData();
        formData.set("aufgabeId", gezogen.id);
        formData.set("planDatum", wirkung.planDatum);
        formData.set("planUhrzeit", gezogen.planUhrzeit);
        formData.set("dauerMinuten", "");
        const ergebnis = await einplanenAction(FORM_START, formData);
        // WIRFT STATT STILL ZU VERWERFEN (Vorbild `einplanenAnnehmenAction`, `actions.ts`): unter
        // den heute gueltigen Regeln unerreichbar (Zieltag kommt aus `wochenTage()`, die Uhrzeit war
        // beim Setzen schon gueltig), aber laut ist besser als still, falls doch.
        if (!ergebnis.ok) {
          throw new Error(
            `Verschieben fehlgeschlagen: ${Object.values(ergebnis.fieldErrors).join(" ")}`,
          );
        }
      } else {
        for (let i = 0; i < wirkung.schritte; i++) {
          const formData = new FormData();
          formData.set("aufgabeId", gezogen.id);
          formData.set("richtung", wirkung.richtung);
          // FEHLERBEHANDLUNG SYMMETRISCH ZUM TAG-ZWEIG (Review-Fund): `rangVerschiebenAction`
          // liefert kein `FormState` (kein `.ok` zum Pruefen) — sie WIRFT bei jeder Ablehnung
          // (Berechtigung, kein Nachbar in dieser Richtung). Ohne dieses `try`/`catch` waere das
          // trotzdem laut (der Wurf propagiert durch `startTransition` hinaus), aber INKONSISTENT
          // zum Tag-Zweig formuliert — dieselbe Nachricht/dasselbe Praefix wie dort, statt einer
          // rohen, unformatierten Server-Fehlermeldung. Laut statt still war in diesem Modul
          // wiederholt die richtige Antwort; ein fehlgeschlagener Rangwechsel, der nichts sagt,
          // waere derselbe stille No-Op wie „Klick, nichts passiert“ (Aufgabe 13).
          try {
            await rangVerschiebenAction(formData);
          } catch (fehler) {
            throw new Error(
              `Verschieben fehlgeschlagen: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
            );
          }
        }
      }
    });
  }

  return (
    <div
      className={s.wochenGitter}
      data-rolle="wochengitter"
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={aufraeumen}
    >
      {children}
    </div>
  );
}
