"use client";

import { useActionState, useState } from "react";
import { Input, Popover } from "antd";
import { umverteilenAction, verteilenAction } from "../actions";
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
 *    ist es die PRIMAERAKTION einer einzelnen, benannten Aufgabe. Beide Wege rufen dieselbe Action
 *    mit demselben Formularschluessel `zielId`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ══ ZWEI ARTEN SEIT DER ZWEITEN OBERFLAECHEN-RUNDE (2026-08-16): `umverteilen` (wie bisher, die
 *    Zeilenaktion der zwei „Überfällig"-Zonen) UND `verteilen` (neu, der Stapelplatz
 *    `/verteilen`, wo „zehn am Stueck verteilen" zaehlt).
 *
 *    DASS ES EIN SCHALTER IST UND NICHT EINE ZWEITE KOMPONENTE, hat denselben Grund wie bei
 *    `VerteilenDialog.tsx`s `ZUWEISUNG`: `actions.ts`s `verteilenGemeinsam` bedient beide Aktionen
 *    mit EINEM Rumpf, weil beide Formulare identisch sind (Zielperson, optionaler Zeitvorschlag) —
 *    der einzige fachliche Unterschied (`nach`, `planLoeschen`) kommt bereits aus `uebergang()`.
 *    Eine zweite, fast gleiche Insel waere derselbe Fehler eine Ebene hoeher.
 *
 * ══ DER ZEITVORSCHLAG STEHT NUR BEI `verteilen` IM FELD, UND DAS IST BEGRUENDET, NICHT BELIEBIG.
 *    Der Kopfkommentar von `UmverteilenKnopf` fuehrt die zwei Felder bis hierhin als „Felder, die
 *    in ein Zeilenfeld nicht gehoeren" — das galt fuer `umverteilen` und gilt dort weiter:
 *
 *      - Bei `umverteilen` wird ein BESTEHENDER Plan geleert, und die Frage der Zeile ist „wer
 *        traegt das jetzt". Der volle Weg mit Zeitvorschlag bleibt ueber `UmverteilenKnopf` auf der
 *        Fuehrungskarte und auf `/a/<id>` erreichbar — er ist nicht fort, nur nicht in der Zeile.
 *      - Bei `verteilen` hat die Aufgabe NOCH KEINEN Plan. Der Vorschlag ist die einzige
 *        Moeglichkeit, „wann" mitzugeben — und er ist die Voraussetzung dafuer, dass die BuFDi auf
 *        ihrer Flaeche ueberhaupt einen „Annehmen: <Tag>, <Uhrzeit>"-Weg bekommt
 *        (`EinstiegBufdi.tsx`s `posteingangAktionen`, Bedingung `vorschlagOffen`). Ohne die zwei
 *        Felder verloere der Stapelplatz eine FACHLICHE ZUSAGE, nicht eine Bequemlichkeit — genau
 *        die, die der volle Rundlauf in `e2e/aufgaben.spec.ts` in seinen Schritten 2 und 3
 *        durchspielt.
 *
 *    DIE FELDER SIND OPTIONAL UND STEHEN IM SELBEN `<form>` WIE DIE NAMENSKNOEPFE. Damit bleibt
 *    der Klick auf einen Namen DAS ABSENDEN: ein abgesendetes Formular traegt alle seine Felder,
 *    also Ziel UND Vorschlag, in EINEM Schritt. Wer keinen Vorschlag braucht, klickt nur den
 *    Namen — aus vier Schritten wird einer, aus fuenf mit Vorschlag werden drei.
 *
 * ══ antds `Input` UND NICHT EIN NACKTES `<input>` FUER DIE ZWEI FELDER: der Feldinhalt liegt im
 *    PORTAL, also ausserhalb von `.modul` (s. den Kommentar an `.zuweisenFeld` im Stylesheet) —
 *    dort sind die `--auf-*`-Variablen nicht aufgeloest, und eine unaufgeloeste Variable meldet
 *    sich nie. antds `Input` bringt seine Farben aus seinen EIGENEN Tokens mit und kennt damit
 *    beide Themen; ein selbstgefaerbtes Feld waere im Dunkeln still schwarz auf dunkel. KEIN
 *    `size` (Falle 4) — `ARBEITSDICHTE` gibt die 44px, und `inputFontSize` aus `core/theme.ts`
 *    haelt die 16px-Zusage fuer Eingabefelder.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * DIE BESCHRIFTUNGEN UND DIE ACTION JE ZUWEISUNGSART — ein `Record`, damit eine dritte Art nicht
 * vergessen werden kann. Die Server-Action steht mit darin und wird VOR `useActionState`
 * ausgewaehlt: ein bedingter Hook-AUFRUF waere ein Regelbruch von React, ein bedingt gewaehlter
 * WERT ist keiner. Dieselbe Bauart wie `VerteilenDialog.tsx`s `ZUWEISUNG`, absichtlich — die
 * beiden Dateien sind die Zeilen- und die Dialogfassung derselben Sache.
 */
const INLINE_ART = {
  umverteilen: {
    aktion: umverteilenAction,
    knopf: "Zuweisen",
    /*
     * DIE FOLGE — `_lib/lebenszyklus.ts` fuehrt `umverteilen` mit `planLoeschen: true`. Sie MUSS
     * zwischen Absicht und Absenden gelesen werden und steht deshalb als erste Zeile im
     * aufgeklappten Feld. `null` bei „verteilen": dort gibt es keine — eine Aufgabe im Posteingang
     * hat noch gar keinen Zeitplan, der geleert werden koennte.
     */
    folge: "Der bisher eingeplante Tag dieser Aufgabe wird dabei geleert.",
    zeitvorschlag: false,
  },
  verteilen: {
    aktion: verteilenAction,
    knopf: "Verteilen",
    folge: null,
    zeitvorschlag: true,
  },
} as const;

/** Die zwei Zuweisungsarten, die als ZEILENWEG existieren (s. Kopfkommentar). */
export type ZuweisenArt = keyof typeof INLINE_ART;

export function ZuweisenInline({
  aufgabe,
  bufdis,
  auslastung,
  art = "umverteilen",
}: {
  aufgabe: AufgabeRow;
  /** Aus `bufdis()` — eine ausgeschiedene Person ist kein Verteilziel (§11.3). */
  bufdis: PersonRow[];
  /** Wochenauslastung je BuFDi, aus `wochenAuslastungFuerBufdis` — nie hier gerechnet. */
  auslastung: AuslastungZeile[];
  /**
   * `umverteilen` ist die Vorgabe, und das ist die tragende Haelfte: die zwei „Überfällig"-Zonen
   * der Koordinationsflaeche behalten damit ihre heutige Form, ohne den Schalter zu kennen. Nur
   * `/verteilen` setzt ihn auf `verteilen` (s. Kopfkommentar).
   */
  art?: ZuweisenArt;
}) {
  const setzung = INLINE_ART[art];
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
  const [state, formAction, isPending] = useActionState(setzung.aktion, FORM_START);
  const zielFehler = feldFehler(state, "zielId");
  const vorschlagDatumFehler = feldFehler(state, "vorschlagDatum");
  const vorschlagUhrzeitFehler = feldFehler(state, "vorschlagUhrzeit");

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
      {setzung.folge !== null ? <p className={s.zuweisenFolge}>{setzung.folge}</p> : null}
      {/*
       * DER OPTIONALE ZEITVORSCHLAG — NUR BEI `verteilen`, UND ER STEHT VOR DER NAMENSLISTE.
       *
       * DIE REIHENFOLGE IST DIE GANZE MECHANIK: der Klick auf einen Namen IST das Absenden, also
       * muss alles, was mitgeschickt werden soll, VORHER ausgefuellt sein. Stuenden die Felder
       * unter der Liste, waeren sie hinter dem Klick, den sie beeinflussen — dieselbe Ueberlegung,
       * die die Folge-Zeile oben ueber die Liste stellt.
       *
       * DIE ZWEI FELDER SIND EXAKT DIE DES MODALS (`VerteilenDialog.tsx`s `VerteilenModal`):
       * dieselben Namen `vorschlagDatum`/`vorschlagUhrzeit`, dieselben Typen, dieselbe
       * Optionalitaet, dieselbe Fehlerbehandlung ueber `feldFehler`. Keine zweite Fassung — nur
       * ein zweiter Ort.
       */}
      {setzung.zeitvorschlag ? (
        <div className={s.zuweisenVorschlag}>
          <label htmlFor={`zi-${aufgabe.id}-datum`}>Zeitvorschlag: Tag (optional)</label>
          <Input
            id={`zi-${aufgabe.id}-datum`}
            name="vorschlagDatum"
            type="date"
            status={vorschlagDatumFehler ? "error" : undefined}
            aria-invalid={vorschlagDatumFehler ? true : undefined}
            aria-describedby={vorschlagDatumFehler ? `zi-${aufgabe.id}-datum-err` : undefined}
          />
          {vorschlagDatumFehler ? (
            <p id={`zi-${aufgabe.id}-datum-err`} className={s.zuweisenFehler}>
              {vorschlagDatumFehler}
            </p>
          ) : null}
          <label htmlFor={`zi-${aufgabe.id}-zeit`}>Zeitvorschlag: Uhrzeit (optional)</label>
          <Input
            id={`zi-${aufgabe.id}-zeit`}
            name="vorschlagUhrzeit"
            type="time"
            status={vorschlagUhrzeitFehler ? "error" : undefined}
            aria-invalid={vorschlagUhrzeitFehler ? true : undefined}
            aria-describedby={vorschlagUhrzeitFehler ? `zi-${aufgabe.id}-zeit-err` : undefined}
          />
          {vorschlagUhrzeitFehler ? (
            <p id={`zi-${aufgabe.id}-zeit-err`} className={s.zuweisenFehler}>
              {vorschlagUhrzeitFehler}
            </p>
          ) : null}
        </div>
      ) : null}
      {/*
       * DIE UEBERSCHRIFT DER LISTE, seit der zweiten Runde ausgeschrieben: mit den zwei Feldern
       * darueber stuenden sonst drei Eingabemoeglichkeiten untereinander, von denen nur die
       * letzte absendet — ohne ein Wort dazwischen ist nicht zu sehen, wo die Entscheidung liegt.
       */}
      <p className={s.zuweisenListenKopf}>Zuweisen an</p>
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
        {/*
         * DIE TESTMARKE HEISST NACH DER ART, NICHT NACH DER KOMPONENTE — `verteilen-<id>` auf dem
         * Stapelplatz, `zuweisen-<id>` in der Zeile der Koordinationsflaeche. Damit behaelt der
         * volle Rundlauf in `e2e/aufgaben.spec.ts` seinen Griff auf den Verteil-Weg, obwohl die
         * Bauform darunter vom Modal auf das Zeilenfeld gewechselt ist.
         */}
        <button
          type="button"
          className={s.zuweisenAusloeser}
          data-testid={`${art === "verteilen" ? "verteilen" : "zuweisen"}-${aufgabe.id}`}
        >
          <Ikone name="person" /> {setzung.knopf}
        </button>
      </Popover>
    </span>
  );
}
