"use client";

import { useActionState, useState } from "react";
import { Button, Modal, Radio } from "antd";
import { umverteilenAction, verteilenAction } from "../actions";
import type { AuslastungZeile } from "../_db/queries";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import { fmtStunden } from "../_lib/anzeige";
import { fmtTagKurz } from "../_lib/datum";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { DatumFeld, ZeitFeld } from "./Felder";
import { SPACE } from "@/core/theme/tokens";
import s from "./aufgaben.module.css";

/*
 * DER VERTEIL-DIALOG (Aufgabe 14, Spec §8.2) — DIE MODALFASSUNG VON „verteilen"/„umverteilen",
 * fuer die Faelle, in denen es um EINE benannte Aufgabe als Primaeraktion geht: die
 * Fuehrungskarte (`VerteilenKnopf`) und `/a/<id>` (`UmverteilenKnopf`).
 *
 * ══ DIESE DATEI HIESS EINMAL „DER POSTEINGANG ALS TABELLE, PLUS DER VERTEIL-DIALOG" und trug
 *    beides. Die Tabelle ist mit der zweiten Oberflaechen-Runde fort (2026-08-16) — die
 *    Begruendung steht gleich unten, wo sie stand. Was bleibt, ist der Dialog.
 *
 * ══ DIE ZWEITE FASSUNG DERSELBEN AKTION IST DER ZEILENWEG (`_ui/ZuweisenInline.tsx`), und dass es
 *    ZWEI Wege gibt, ist eine Abwaegung, keine Unentschlossenheit:
 *
 *      · DER ZEILENWEG ist die Antwort auf „zehn am Stueck" — eine Entscheidung aus EINER Angabe,
 *        der Klick auf den Namen IST das Absenden, und der Stapel bleibt dabei sichtbar. Er traegt
 *        `/verteilen` und die zwei „Überfällig"-Zonen der Koordinationsflaeche.
 *      · DER DIALOG ist die Antwort auf „diese eine Aufgabe, jetzt" — er hat eine eigene Ebene,
 *        weil er die Primaeraktion einer genannten Aufgabe ist, und er traegt zusaetzlich den
 *        Auslastungsblock ueber alle BuFDis.
 *
 *    BEIDE RUFEN DIESELBE ACTION MIT DENSELBEN FORMULARSCHLUESSELN (`aufgabeId`, `zielId`,
 *    `vorschlagDatum`, `vorschlagUhrzeit`) — `actions.ts`s `verteilenGemeinsam` bedient sie mit
 *    EINEM Rumpf. Es gibt keine zweite Fachlogik, nur eine zweite Setzung.
 *
 * ══ DIE ZIELLISTE (`bufdis`-Prop) KOMMT VOM AUFRUFER AUS `_db/queries.ts`s `bufdis()`, NICHT AUS
 *    `aktivePersonen()` — diese Komponente nimmt nur entgegen, was die Server Component ihr
 *    reicht, und baut die Liste nicht selbst nach (Brief: „die dritte Linie eines Riegels, nicht
 *    die erste").
 *
 * ══ `"use client"` STEHT ALS ALLERERSTE ZEILE, VOR JEDEM KOMMENTAR (von `VerteilenDialog.test.tsx`
 *    bewacht): die Direktive gilt nur dort, und ein davor gerutschter Kommentar macht sie still
 *    wirkungslos — Hooks und Funktions-Props in einer RSC-Datei, also Falle 9 bzw. HTTP 500.
 */

/*
 * ══ `VerteilenTabelle` IST FORT (Oberflaechen-Runde 2026-08-16, zweite Haelfte) — MIT IHREM
 *    EINZIGEN AUFRUFER, NICHT VOR IHM.
 *
 *    Was hier stand, war eine antd-`Table` mit sieben Spalten und `scroll={{ x: "max-content" }}`,
 *    gerendert ausschliesslich von `verteilen/page.tsx`. Der Kopfkommentar oben fuehrte sie als
 *    „EINE Client-Insel fuer BEIDE Aufrufer" — die zweite Haelfte dieser Begruendung ist mit der
 *    ersten Oberflaechen-Runde entfallen: `EinstiegKoordination.tsx` zeigt den Posteingang seit
 *    §3.2 als Karte bzw. als Zone, nicht mehr als Tabelle. Uebrig blieb eine geteilte Komponente
 *    mit einem Teilhaber.
 *
 *    DIE ROUTE BLEIBT, DIE LADEFUNKTION BLEIBT, DER RIEGEL BLEIBT — nur die Form wechselt auf die
 *    Zeilenliste des Moduls samt Zeilenweg (`_ui/ZuweisenInline.tsx`, art `verteilen`). Die
 *    ausfuehrliche Begruendung samt der einen benannten Abweichung (die Spalte „Nachweispflicht")
 *    steht im Kopfkommentar von `verteilen/page.tsx`, wo sie beim Lesen der Seite gefunden wird.
 *
 *    WAS IN DIESER DATEI BLEIBT UND WARUM: `VerteilenModal` und seine zwei Ausloeser
 *    `VerteilenKnopf`/`UmverteilenKnopf`. Sie sind der Weg der FUEHRUNGSKARTE und von `/a/<id>` —
 *    dort geht es um EINE benannte Aufgabe als Primaeraktion, mit Zeitvorschlag und
 *    Auslastungsblock. Das ist eine andere Frage als „zehn am Stueck verteilen", und sie bekommt
 *    weiterhin die Ebene, die zu ihr passt.
 */

/**
 * DER VERTEIL-KNOPF DER FUEHRUNGSKARTE (Oberflaechen-Spec 2026-08-16 §4.2 Koordination Rang 2/3,
 * §6.7) — DERSELBE `VerteilenModal` WIE AUF `/verteilen`, keine zweite Fassung.
 *
 * WARUM DIE INSEL HIER STEHT UND NICHT IN DER KARTE: `_ui/Fuehrungskarte.tsx` ist eine SERVER
 * COMPONENT (§6.7). Der Modal braucht `onCancel` und einen `useState`-Schalter, also Funktionen
 * als Props — aus einer Server Component heraus exakt Falle 9, und kein Tor ausser einem echten
 * Abruf saehe den HTTP 500. Die Insel definiert ihre Funktionen selbst; die Karte importiert sie
 * DIREKT und reicht ausschliesslich serialisierbare Daten hinein.
 *
 * MODAL-SICHTBARKEIT IST HIER EIN ECHTER ZUSTAND, ANDERS ALS IN `VerteilenTabelle` OBEN: dort
 * folgt „offen" daraus, ob die Zeile noch im `posteingang`-Prop steht (der Dialog schliesst sich
 * nach dem Verteilen von selbst, s. Kopfkommentar). Die Karte hat keine Liste, aus der eine Zeile
 * verschwinden koennte — nach dem Verteilen wechselt der fuehrende Anlass, und die Karte wird
 * ohnehin neu gerendert. `offen` faellt dabei auf `false` zurueck, weil der Baum neu entsteht.
 *
 * DER EINZIGE PRIMAERKNOPF DER FLAECHE (Regel P): `type="primary"` steht hier und NICHT im
 * Abbrechen-Knopf des Modals — der Modal ist eine eigene Ebene und liegt im Portal, also
 * ausserhalb von `data-testid="aufgaben-flaeche"`, wo der Zaehlriegel misst.
 */
export function VerteilenKnopf(props: ZuweisenKnopfProps) {
  return <ZuweisenKnopf {...props} art="verteilen" />;
}

/**
 * „ANDERS ZUWEISEN (DER ZEITPLAN WIRD DABEI GELEERT)" — DER BIS SCHRITT 6 FEHLENDE AUFRUFER VON
 * `umverteilenAction` (Oberflaechen-Spec 2026-08-16 §7 Nr. 3, §11.4 Schritt 6).
 *
 * DERSELBE MODAL WIE „VERTEILEN", UND ZWAR AUS EINEM NACHGELESENEN GRUND: `actions.ts`s
 * `verteilenGemeinsam` bedient beide Aktionen mit EINEM Rumpf, weil beide Formulare identisch sind
 * (Zielperson, optionaler Zeitvorschlag) — der einzige fachliche Unterschied (`nach`,
 * `planLoeschen`) kommt bereits aus `uebergang()`. Ein zweiter, fast gleicher Dialog waere hier
 * derselbe Fehler eine Ebene hoeher.
 *
 * DIE FOLGE WIRD GENANNT — ABER IM DIALOG, NICHT AUF DEM KNOPF (Abweichung von Spec §1.3/§7 Nr. 3,
 * s. Bericht). `_lib/lebenszyklus.ts` fuehrt die Zeile mit `planLoeschen: true`: wer „Anders
 * zuweisen" drueckt, verliert die bestehende Tagesplanung der Aufgabe, und das darf nicht
 * verschwiegen werden. Die Spec loeste das ueber den KNOPFTEXT („Anders zuweisen (der Zeitplan wird
 * dabei geleert)"); gemessen an der Bildstrecke ist das der falsche Ort:
 *
 *   - Die Zone „Überfällig, noch nicht begonnen" traegt den Knopf JE ZEILE. Vier Knoepfe mit
 *     44-Zeichen-Beschriftung brachen bei 1280px unterschiedlich um, einer rutschte in eine eigene
 *     Zeile — die Zone sah ungeordnet aus, obwohl ihr Inhalt geordnet ist.
 *   - Auf 360px brauchte es dafuer eine eigene CSS-Regel (`.knopfUmbruch`, jetzt fort), weil die
 *     Beschriftung mit 344px `min-content` breiter war als die Flaeche.
 *
 * DER DIALOG IST DIE BESTAETIGUNG, und er steht auf JEDEM der drei Wege davor (Karte, Zone,
 * `/a/<id>`) — die Aktion ist ohne ihn nicht ausloesbar. Der Satz steht deshalb dort, ueber der
 * Zielliste, wo er zwischen Absicht und Absenden gelesen wird; der Knopf davor benennt nur, wohin
 * er fuehrt. `VerteilenDialog.test.tsx` haelt beides fest (kurzer Knopf, Folge im Dialog), damit
 * die Zusage aus §7 Nr. 3 einen Riegel behaelt statt nur den Ort zu wechseln.
 *
 * `primaer` IST DER GRUND, WARUM DIESE INSEL EINEN SCHALTER HAT UND NICHT ZWEI KOMPONENTEN:
 * dieselbe Aktion steht an ZWEI Orten derselben Flaeche — in der Fuehrungskarte (Rang 1 und 5a,
 * dort die Zustandsaktion des genannten Anlasses, also PRIMAER) und als Zeilenaktion in den zwei
 * „Überfällig"-Zonen (dort einer von vielen, also STANDARD). Waere `type="primary"` fest verdrahtet
 * wie in `VerteilenKnopf`, stuenden bei einer fuehrenden Karte PLUS einer Ueberfaellig-Zone ZWEI
 * `.ant-btn-primary` in `data-testid="aufgaben-flaeche"` — und das saehe kein Tor ausser dem
 * Zaehlriegel in Playwright (`typecheck`, `lint`, `build` und Vitest blieben gruen).
 */
export function UmverteilenKnopf(props: ZuweisenKnopfProps) {
  return <ZuweisenKnopf {...props} art="umverteilen" />;
}

interface ZuweisenKnopfProps {
  aufgabe: AufgabeRow;
  bufdis: PersonRow[];
  auslastung: AuslastungZeile[];
  tage: readonly string[];
  /** Nur `UmverteilenKnopf` reicht das durch; „Verteilen" ist immer die Primaeraktion seiner Karte. */
  primaer?: boolean;
}

/**
 * DIE BESCHRIFTUNGEN JE ZUWEISUNGSART — EIN `Record`, DAMIT EINE DRITTE ART NICHT VERGESSEN WERDEN
 * KANN. Die Server-Action steht mit darin und wird VOR `useActionState` ausgewaehlt: ein bedingter
 * Hook-Aufruf waere ein Regelbruch von React, ein bedingt gewaehlter WERT ist keiner.
 */
const ZUWEISUNG = {
  verteilen: {
    aktion: verteilenAction,
    knopf: "Verteilen",
    absenden: "Verteilen",
    titel: (titel: string): string => `„${titel}“ verteilen`,
    folge: null,
  },
  umverteilen: {
    aktion: umverteilenAction,
    knopf: "Anders zuweisen",
    absenden: "Anders zuweisen",
    titel: (titel: string): string => `„${titel}“ anders zuweisen`,
    /*
     * DIE FOLGE, IM DIALOG STATT AUF DEM KNOPF (s. Kopfkommentar von `UmverteilenKnopf`). `null`
     * bei „verteilen": dort gibt es keine — die Aufgabe hat noch gar keinen Zeitplan.
     */
    folge: "Der bisher eingeplante Tag dieser Aufgabe wird dabei geleert.",
  },
} as const;

type Zuweisungsart = keyof typeof ZUWEISUNG;

function ZuweisenKnopf({
  aufgabe,
  bufdis,
  auslastung,
  tage,
  art,
  primaer = true,
}: ZuweisenKnopfProps & { art: Zuweisungsart }) {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <Button
        type={primaer ? "primary" : undefined}
        onClick={() => setOffen(true)}
        data-testid={`${art}-${aufgabe.id}`}
      >
        {ZUWEISUNG[art].knopf}
      </Button>
      {offen ? (
        <VerteilenModal
          aufgabe={aufgabe}
          bufdis={bufdis}
          auslastung={auslastung}
          tage={tage}
          art={art}
          onClose={() => setOffen(false)}
        />
      ) : null}
    </>
  );
}

function VerteilenModal({
  aufgabe,
  bufdis,
  auslastung,
  tage,
  art = "verteilen",
  onClose,
}: {
  aufgabe: AufgabeRow;
  bufdis: PersonRow[];
  auslastung: AuslastungZeile[];
  tage: readonly string[];
  art?: Zuweisungsart;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(ZUWEISUNG[art].aktion, FORM_START);

  const zielFehler = feldFehler(state, "zielId");
  const vorschlagDatumFehler = feldFehler(state, "vorschlagDatum");
  const vorschlagUhrzeitFehler = feldFehler(state, "vorschlagUhrzeit");
  const gewaehltesZiel = feldWert(state, "zielId", "");

  // ERSTER/LETZTER TAG DER ANGEZEIGTEN WOCHE — DIE UEBERSCHRIFT NENNT DIE WOCHE, DAMIT DIE
  // ZAHLEN NICHT ALS „AUSLASTUNG DES VORGESCHLAGENEN TAGS" MISSVERSTANDEN WERDEN: der Vorschlag
  // darf auf einen Tag ausserhalb dieser Woche fallen (kein Wochenwechsel in diesem Dialog, s.
  // Bericht), die Auslastungszahlen bleiben trotzdem immer die der AKTUELLEN Woche.
  const ersterTag = tage[0];
  const letzterTag = tage[tage.length - 1];

  return (
    <Modal open onCancel={onClose} footer={null} title={ZUWEISUNG[art].titel(aufgabe.titel)}>
      <form
        action={formAction}
        style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}
      >
        <input type="hidden" name="aufgabeId" value={feldWert(state, "aufgabeId", aufgabe.id)} />

        {/*
         * DIE FOLGE STEHT ALS ERSTES IM DIALOG — vor der Zielliste, weil sie die ENTSCHEIDUNG
         * betrifft und nicht die Eingabe. Kein `Alert type="error"` und keine rote Flaeche
         * (CLAUDE.md Falle 3: `colorError === colorPrimary === #c8000f`, ein roter Kasten hier
         * laese sich als Primaeraktion) — ein Satz reicht, weil der Dialog nur einen Zweck hat.
         * Kein `Typography.Text`: Compound-Zugriff waere hier zwar erlaubt (`"use client"`), aber
         * das Modul schreibt Prosa durchgehend als nacktes Markup.
         */}
        {ZUWEISUNG[art].folge !== null ? <p style={{ margin: 0 }}>{ZUWEISUNG[art].folge}</p> : null}

        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ padding: 0, marginBlockEnd: SPACE.xs }}>Zuweisen an</legend>
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
            {/*
             * antds `Radio` UND NICHT MEHR EIN NACKTES `<input type="radio">` — dieselbe Runde und
             * dieselbe Begruendung wie bei den zwei Auswahlfeldern darunter. GEPRUEFT, BEVOR DIESE
             * ENTSCHEIDUNG FIEL: antd rendert darunter ein ECHTES `<input type="radio">` und reicht
             * `id`, `name`, `value` und `required` daran durch (`@rc-component/checkbox` spreizt
             * seine restlichen Props auf das Element). Der Formularvertrag bleibt damit unberuehrt —
             * abgesendet wird weiterhin `zielId=<Personen-Id>`, und `VerteilenDialog.test.tsx`s
             * Zaehlung ueber `input[type='radio']` misst weiterhin dasselbe.
             *
             * KEIN `Radio.Group`: das waere ein Compound-Zugriff (in einer Client-Insel zwar
             * erlaubt) UND brauchte `value`/`onChange`, also einen kontrollierten Zustand fuer eine
             * Auswahl, die das Formular selbst schon traegt. Einzelne `Radio` mit gemeinsamem
             * `name` bleiben unkontrolliert und werden von React nach der Action mit zurueckgesetzt.
             */}
            {bufdis.map((b) => (
              <Radio
                key={b.id}
                id={`vd-ziel-${b.id}`}
                name="zielId"
                value={b.id}
                required
                defaultChecked={gewaehltesZiel === b.id}
                aria-describedby={zielFehler ? "vd-ziel-err" : undefined}
              >
                {b.name}
              </Radio>
            ))}
          </div>
          {zielFehler ? (
            <p id="vd-ziel-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
              {zielFehler}
            </p>
          ) : null}
        </fieldset>

        <div>
          <label htmlFor="vd-vorschlag-datum" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
            Zeitvorschlag: Tag (optional)
          </label>
          <DatumFeld
            id="vd-vorschlag-datum"
            name="vorschlagDatum"
            wert={feldWert(state, "vorschlagDatum", "")}
            fehler={vorschlagDatumFehler}
            beschriebenVon={vorschlagDatumFehler ? "vd-vorschlag-datum-err" : undefined}
          />
          {vorschlagDatumFehler ? (
            <p id="vd-vorschlag-datum-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
              {vorschlagDatumFehler}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="vd-vorschlag-uhrzeit"
            style={{ display: "block", marginBlockEnd: SPACE.xs }}
          >
            Zeitvorschlag: Uhrzeit (optional)
          </label>
          <ZeitFeld
            id="vd-vorschlag-uhrzeit"
            name="vorschlagUhrzeit"
            wert={feldWert(state, "vorschlagUhrzeit", "")}
            fehler={vorschlagUhrzeitFehler}
            beschriebenVon={vorschlagUhrzeitFehler ? "vd-vorschlag-uhrzeit-err" : undefined}
          />
          {vorschlagUhrzeitFehler ? (
            <p id="vd-vorschlag-uhrzeit-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
              {vorschlagUhrzeitFehler}
            </p>
          ) : null}
        </div>

        {/*
         * DIE WOCHENAUSLASTUNG ALLER BUFDIS (Spec §8.2), „DAMIT DER VORSCHLAG NICHT INS LEERE
         * GEHT" — NEUTRAL, NIE ALS FARBIGER BALKEN (Spec §9.3: Menge ist keine Statusfarbe). Ein
         * ueberbuchter Tag bekommt Kante plus Text, s. `.budgetUeberbucht` in `aufgaben.module.css`.
         */}
        <div>
          <h3 style={{ margin: `0 0 ${SPACE.xs}px`, fontSize: 14, fontWeight: 600 }}>
            Wochenauslastung {ersterTag ? fmtTagKurz(ersterTag) : ""}
            {letzterTag ? `–${fmtTagKurz(letzterTag)}` : ""}
          </h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {auslastung.map((zeile) => (
              <li
                key={zeile.person.id}
                className={zeile.ueberbucht ? s.budgetUeberbucht : s.budget}
              >
                {zeile.person.name}: {fmtStunden(zeile.verplantMinuten)} von{" "}
                {fmtStunden(zeile.sollMinuten)} Std.
                {zeile.ueberbucht ? " — überbucht" : ""}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ display: "flex", gap: SPACE.sm }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={isPending}
            disabled={isPending}
            style={{ alignSelf: "flex-start" }}
          >
            {ZUWEISUNG[art].absenden}
          </Button>
          <Button
            onClick={onClose}
            disabled={isPending}
            style={{ alignSelf: "flex-start" }}
            data-testid="verteilen-abbrechen"
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
