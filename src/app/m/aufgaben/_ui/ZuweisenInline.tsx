"use client";

import { useActionState, useState } from "react";
import { Popover } from "antd";
import { umverteilenAction } from "../actions";
import type { AuslastungZeile } from "../_db/queries";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import { fmtStunden } from "../_lib/anzeige";
import { FORM_START, feldFehler } from "../_lib/formState";
import { Ikone } from "./ikonen";
import s from "./aufgaben.module.css";

/*
 * „ANDERS ZUWEISEN" DIREKT IN DER ZEILE (Oberflaechen-Runde 2026-08-16) — DIE ZEILENFASSUNG VON
 * `umverteilenAction`, an die Stelle von Knopf → Modal → Formular → Absenden.
 *
 * DAS URTEIL, GEGEN DAS DIESE DATEI GESCHRIEBEN IST: „Jede Aenderung laeuft ueber Knopf → Modal →
 * Formular → Absenden … so wirkt es eher wie eine alte Formularanwendung." Fuer eine Zuweisung
 * stimmt das doppelt: die Entscheidung besteht aus GENAU EINER Angabe (an wen), und dafuer eine
 * eigene Ebene mit eigenem Absendeknopf aufzuziehen ist drei Schritte fuer einen. Hier ist die
 * Personenwahl SELBST das Absenden — ein Klick auf den Namen ist die Aktion.
 *
 * ══ DIE BESTAETIGUNG BLEIBT, SIE WECHSELT NUR DEN TRAEGER. `_lib/lebenszyklus.ts` fuehrt
 *    `umverteilen` mit `planLoeschen: true`: wer anders zuweist, verliert die bestehende
 *    Tagesplanung. Diese Folge MUSS zwischen Absicht und Absenden gelesen werden, und sie steht
 *    deshalb als erste Zeile im aufgeklappten Feld — ueber der Namensliste, nicht darunter und
 *    nicht auf dem Ausloeser. Der Ausloeser oeffnet nur; ausgeloest wird erst mit dem Namen.
 *    `ZuweisenInline.test.tsx` haelt genau das fest — `VerteilenDialog.test.tsx` kann es nicht,
 *    denn es prueft den Modalweg und bliebe gruen, waehrend der Zeilenweg den Satz verloere.
 *
 * ══ DIE AUSLASTUNG STEHT AN JEDEM NAMEN. Sie ist der Grund, warum diese Entscheidung ueberhaupt
 *    eine ist — „damit der Vorschlag nicht ins Leere geht" (Modulspec §8.2). Im Modal stand sie in
 *    einem eigenen Block unter dem Formular; an der Person steht sie dort, wo sie gebraucht wird.
 *    Es entsteht KEINE zweite Rechnung: `auslastung` kommt als Prop aus `verteilDaten` und damit
 *    aus `wochenAuslastungFuerBufdis`, wie im Modal auch.
 *
 * ══ WARUM EINE CLIENT-INSEL UND KEIN `<form>` AUS DER SERVER COMPONENT (Falle 9): `Popover`
 *    braucht `onOpenChange`, also einen Funktions-Prop, und `useActionState` braucht einen Hook.
 *    Beides ginge aus `EinstiegKoordination.tsx` (Server Component) nicht ueber die RSC-Grenze —
 *    „Functions cannot be passed directly to Client Components", ein Fehler, den weder
 *    `typecheck` noch `build` noch Vitest sieht. Die Insel definiert ihre Funktionen selbst und
 *    importiert `umverteilenAction` DIREKT; hinein gehen nur serialisierbare Daten.
 *
 * ══ KEIN `type="primary"` AM AUSLOESER. Der Zaehlriegel in `e2e/aufgaben.spec.ts` misst
 *    `.ant-btn-primary` innerhalb von `data-testid="aufgaben-flaeche"` und laesst hoechstens einen
 *    zu; der gehoert der Fuehrungskarte (Regel P). Der Inhalt des `Popover` liegt im Portal, also
 *    ausserhalb dieser Flaeche — die Namensknoepfe darin sind ausserdem gar keine antd-Knoepfe.
 *
 * ══ DIE ZIELLISTE WIRD NICHT NACHGEBAUT: `bufdis` kommt vom Aufrufer aus `bufdis()`, nie aus
 *    `aktivePersonen()` (§11.3). Diese Insel nimmt nur entgegen. Und WER DARF entscheidet weiterhin
 *    `aktionsOptionen`/`uebergang()` an der Aufrufstelle — steht hier kein Knopf, gibt es keinen.
 *
 * ══ DER MODALWEG BLEIBT BESTEHEN, UND DAS IST EINE ABWAEGUNG, KEINE UNENTSCHLOSSENHEIT: die
 *    Fuehrungskarte und `/a/<id>` fuehren „Anders zuweisen" weiter ueber `UmverteilenKnopf`. Dort
 *    ist es die PRIMAERAKTION einer einzelnen, benannten Aufgabe und traegt zusaetzlich den
 *    optionalen Zeitvorschlag (zwei Felder, die in ein Zeilenfeld nicht gehoeren). Beide Wege
 *    rufen dieselbe Action mit demselben Formularschluessel `zielId`.
 */

export function ZuweisenInline({
  aufgabe,
  bufdis,
  auslastung,
}: {
  aufgabe: AufgabeRow;
  /** Aus `bufdis()` — eine ausgeschiedene Person ist kein Verteilziel (§11.3). */
  bufdis: PersonRow[];
  /** Wochenauslastung je BuFDi, aus `wochenAuslastungFuerBufdis` — nie hier gerechnet. */
  auslastung: AuslastungZeile[];
}) {
  /*
   * SICHTBARKEIT IST ABGELEITET, KEIN ZWEITER ZUSTAND — dasselbe Muster, das `VerteilenTabelle`
   * schon fuehrt, nur an einem anderen Merkmal. Dort folgt „offen" daraus, ob die Zeile noch im
   * `posteingang`-Prop steht: die verteilte Aufgabe verlaesst `eingegangen`, der Prop schrumpft,
   * der Dialog schliesst sich von selbst.
   *
   * HIER GEHT DAS NICHT, UND DAS IST DER FEHLER, DEN EIN NAIVES `useState(false)` MACHT: eine
   * umverteilte Aufgabe bleibt `verteilt` und bleibt ueberfaellig — sie steht nach der
   * Revalidierung WEITER in derselben Zone, mit demselben `key={a.id}`. Der lokale Schalter
   * ueberlebt also, das Feld bliebe offen stehen, und der einzige sichtbare Unterschied waere,
   * dass die gesperrte Zeile still auf die neue Person springt. Nur ein vollstaendig
   * durchgefuehrter Klick zeigt das — kein Bildschirmabzug des offenen Feldes und kein Vitest,
   * der `useActionState` mockt.
   *
   * GEMERKT WIRD DESHALB NICHT „offen", SONDERN „offen, SOLANGE X SIE TRAEGT". Wechselt der
   * Traeger, stimmt die Bedingung nicht mehr und das Feld schliesst — ohne `useEffect`, der
   * zwischen „frisch gemountet" und „gerade erfolgreich abgeschickt" unterscheiden muesste.
   */
  const [offenFuer, setOffenFuer] = useState<string | null>(null);
  const traeger = aufgabe.zugewiesenAn ?? "";
  const offen = offenFuer !== null && offenFuer === traeger;
  const [state, formAction, isPending] = useActionState(umverteilenAction, FORM_START);
  const zielFehler = feldFehler(state, "zielId");

  const lastFuer = (personId: string): string => {
    const zeile = auslastung.find((z) => z.person.id === personId);
    if (zeile === undefined) return "";
    return `${fmtStunden(zeile.verplantMinuten)} / ${fmtStunden(zeile.sollMinuten)} Std.`;
  };

  const inhalt = (
    /*
     * DIE PERSONENWAHL IST DAS ABSENDEN: jeder Namensknopf ist ein `type="submit"` mit
     * `name="zielId"` und seiner Personen-Id als `value`. Ein abgesendetes Formular traegt Name und
     * Wert SEINES AUSLOESERS — es braucht also weder ein Radiofeld noch einen zweiten Knopf. Genau
     * das macht aus vier Schritten einen.
     */
    <form action={formAction} className={s.zuweisenFeld}>
      <input type="hidden" name="aufgabeId" value={aufgabe.id} />
      {/*
       * DIE FOLGE ZUERST, UEBER DER LISTE — sie betrifft die ENTSCHEIDUNG, nicht die Eingabe, und
       * unter der Liste stuende sie hinter dem Klick, den sie beeinflussen soll. Kein `Alert` und
       * keine rote Flaeche: `colorError === colorPrimary === #c8000f`, ein roter Kasten hier laese
       * sich als Primaeraktion (Falle 3).
       */}
      <p className={s.zuweisenFolge}>Der bisher eingeplante Tag dieser Aufgabe wird dabei geleert.</p>
      {bufdis.map((b) => (
        <button
          key={b.id}
          type="submit"
          name="zielId"
          value={b.id}
          disabled={isPending || b.id === aufgabe.zugewiesenAn}
          className={s.zuweisenZiel}
          aria-describedby={zielFehler ? `zi-${aufgabe.id}-err` : undefined}
        >
          <span className={s.zuweisenName}>{b.name}</span>
          {/*
           * DIE HEUTIGE TRAEGERIN IST NICHT WAEHLBAR (`disabled`) UND SAGT AUCH WARUM: ein Klick
           * auf sie waere ein Uebergang auf sich selbst — `umverteilenAction` liesse ihn zwar zu,
           * aber er leerte den Zeitplan, ohne etwas zu aendern. Das ist der eine Fall, in dem die
           * Zeile mehr weiss als die Action.
           */}
          <span className={s.zuweisenLast}>
            {b.id === aufgabe.zugewiesenAn ? "trägt sie heute" : lastFuer(b.id)}
          </span>
        </button>
      ))}
      {zielFehler ? (
        <p id={`zi-${aufgabe.id}-err`} className={s.zuweisenFehler}>
          {zielFehler}
        </p>
      ) : null}
    </form>
  );

  return (
    /*
     * `data-offen` UND DIE `:has()`-REGEL IN `aufgaben.module.css`: die Aktionsspalte ist ohne
     * Zuwendung durchsichtig (`.zeilenAktion { opacity: 0 }`), und Deckkraft eines Elternteils
     * kann ein Kind nicht zuruecknehmen. Der Inhalt des `Popover` liegt ausserdem im Portal, also
     * greift `:focus-within` an der Zeile nicht mehr, sobald er offen ist. Ohne diese Marke
     * verschwaende der Ausloeser unter dem geoeffneten Feld, sobald die Maus die Zeile verlaesst.
     */
    <span className={s.zuweisenHuelle} data-offen={offen ? "true" : undefined}>
      <Popover
        open={offen}
        onOpenChange={(auf) => setOffenFuer(auf ? traeger : null)}
        trigger="click"
        placement="bottomRight"
        content={inhalt}
      >
        <button type="button" className={s.zuweisenAusloeser} data-testid={`zuweisen-${aufgabe.id}`}>
          <Ikone name="person" /> Zuweisen
        </button>
      </Popover>
    </span>
  );
}
