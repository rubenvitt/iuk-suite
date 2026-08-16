import type { ReactNode } from "react";
import type { AufgabeRow } from "../_db/schema";
import { AufgabenZeile } from "./AufgabenZeile";
import s from "./aufgaben.module.css";

/*
 * AUFGABEN ALS ZEILENLISTE — der Posteingang-Streifen (§8.1), die eigenen
 * Auftraege (§8.3), das Archiv und (seit der Oberflaechen-Spec) jede Zone der
 * drei Einstiege teilen sich diese eine Liste. KEIN "use client", kein
 * Compound-Zugriff, kein Icon-Import.
 *
 * SEIT DER OBERFLAECHEN-SPEC (§3.6) IST DIESE DATEI NUR NOCH DIE HUELLE: das
 * `<ul class="zeilenListe">`, der Leertext und die Reihenfolge. Der Zeilenrumpf
 * steht in `_ui/AufgabenZeile.tsx` — die feste Reihenfolge aus §10 Prueffrage 7
 * gehoert dorthin, weil sie fuer das ganze Modul gilt und nicht nur fuer die
 * Aufrufer dieser Liste. DIE FUENF HEUTIGEN AUFRUFER WANDERN NICHT: sie rufen
 * weiterhin `AufgabenListe`, das intern die neue Zeile benutzt. Damit aendert
 * sich fuer `/archiv` die Anordnung nicht, nur die Zeilenkomponente (§3.1), und
 * `AufgabenListe.test.tsx` bleibt unveraendert gruen — sie IST die Gegenprobe,
 * dass die Extraktion nichts verloren hat.
 *
 * `zeilen: { aufgabe, aktionen }[]`, NICHT `aufgaben: AufgabeRow[]` PLUS EINE
 * GEMEINSAME `aktionen`-PROP: die Aktionszeile unterscheidet sich je Zustand
 * und Rolle ("Bearbeitung starten" hier, "Freigeben" dort), und WER WAS DARF
 * entscheiden die Praedikate aus `_lib/zugang.ts` an der aufrufenden Seite —
 * diese Komponente entscheidet es ausdruecklich NICHT selbst (Brief). Eine
 * einzelne `aktionen: ReactNode`-Prop fuer die ganze Liste koennte das gar
 * nicht ausdruecken (dieselben Knoepfe fuer jede Zeile waeren falsch); ein
 * Callback `(a: AufgabeRow) => ReactNode`, den diese Komponente AUFRUFT, waere
 * wieder ein Stueck Entscheidung, das hier nicht hingehoert — und aus einer
 * Server Component heraus zusaetzlich Falle 9. Das Paar `{ aufgabe, aktionen }`
 * legt die Entscheidung vollstaendig VOR dem Aufruf hin: fertig gerenderte
 * Knoepfe, oder gar keine. `rollenZusatz` folgt derselben Regel und ist aus
 * demselben Grund ein STRING, keine Funktion.
 *
 * DIE KLASSE `.zeilenListe` GEHOERT AN DAS `<ul>`, NICHT AN DIE ZEILE: die
 * Regel lautet `.zeilenListe > li`, und die Kartenform unter 768px (§5.3) ist
 * genau ein `flex-direction: column` in der einen bestehenden Medienabfrage.
 */

export interface AufgabenListeZeile {
  aufgabe: AufgabeRow;
  /** Fertig gerenderte Aktionen dieser Zeile — die Komponente entscheidet nicht, wer was darf. */
  aktionen?: ReactNode;
  /** GENAU EINE vorformatierte Angabe (§3.6) — nie eine Funktion (Falle 9). */
  rollenZusatz?: string | null;
}

/**
 * DIE ZWEI SETZUNGEN EINER LISTE (Nachtrag „mehr Diversitaet im UI/UX", 2026-08-16).
 *
 * `raster` ist die Vorgabe und die Form, in der man VERGLEICHT: ausgerichtete Spalten plus
 * Aktionsspalte. `knapp` ist die Form fuer Zonen, in denen man nur wissen will, DASS es sie gibt —
 * eine fliessende Zeile ohne reservierte Spuren.
 *
 * ES IST EINE SETZUNG, KEINE INHALTSFRAGE: beide zeigen DIESELBEN Angaben in DERSELBEN Reihenfolge
 * (§10 Prueffrage 7). Wer hier je Felder weglaesst, aendert die Informationsarchitektur und braucht
 * dafuer eine eigene Begruendung, nicht diesen Schalter.
 */
export type ListenForm = "raster" | "knapp";

export function AufgabenListe({
  zeilen,
  heute,
  leerText,
  form = "raster",
}: {
  zeilen: AufgabenListeZeile[];
  /** s. `ListenForm` — die Wahl trifft der Aufrufer, weil nur er den Zweck der Zone kennt. */
  form?: ListenForm;
  /** ISO-Tagesstring — fuer `istUeberfaellig`. Kommt als Argument, nie aus `new Date()` hier. */
  heute: string;
  /**
   * PFLICHT, KEIN `?`: Spec §9.8 verlangt fuer jede Liste einen AUSGESCHRIEBENEN
   * eigenen Satz — eine leere Flaeche ohne Text sieht aus wie ein Ladefehler.
   * Der Satz kommt von aussen, damit Posteingang, Freigabe-Warteschlange und
   * jede Zone je ihren eigenen tragen, statt einen dritten generischen zu
   * erfinden.
   */
  leerText: string;
}) {
  if (zeilen.length === 0) {
    return <p>{leerText}</p>;
  }

  return (
    /*
     * KEIN `style`-PROP MEHR AM `<ul>` — UND DAS IST DIE VORAUSSETZUNG DES RASTERS, NICHT
     * KOSMETIK (Oberflaechen-Runde 2026-08-16). Hier standen `display: flex`,
     * `flexDirection: "column"`, `gap`, `listStyle`, `margin` und `padding` inline. Ein
     * Inline-`style` schlaegt JEDE Stylesheet-Regel; `.zeilenListe { display: grid }` waere
     * richtig dagestanden und still wirkungslos geblieben — dieselbe Klasse wie Falle 5, nur mit
     * dem staerksten aller Gegenspieler. UND KEIN TOR HAETTE ES GESEHEN: `AufgabenZeile.test.tsx`
     * prueft die Inline-Freiheit des `<li>`, nicht die des `<ul>`, und jsdom rechnet keine
     * Rasterspuren. Alle sechs Deklarationen stehen jetzt in `aufgaben.module.css`.
     */
    <ul className={form === "knapp" ? `${s.zeilenListe} ${s.zeilenListeKnapp}` : s.zeilenListe}>
      {zeilen.map(({ aufgabe, aktionen, rollenZusatz }) => (
        <AufgabenZeile
          key={aufgabe.id}
          aufgabe={aufgabe}
          heute={heute}
          rollenZusatz={rollenZusatz ?? null}
          aktionen={aktionen}
        />
      ))}
    </ul>
  );
}
