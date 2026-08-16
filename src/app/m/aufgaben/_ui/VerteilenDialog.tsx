"use client";

import { useActionState, useState } from "react";
import { Button, Input, Modal, Table } from "antd";
import { umverteilenAction, verteilenAction } from "../actions";
import type { AuslastungZeile } from "../_db/queries";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import { fmtDauer, fmtStunden } from "../_lib/anzeige";
import { fmtTagKurz } from "../_lib/datum";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";
import { PrioritaetChip } from "./Chip";
import { Frist } from "./Frist";
import s from "./aufgaben.module.css";

/*
 * DER POSTEINGANG ALS TABELLE, PLUS DER VERTEIL-DIALOG (Aufgabe 14, Spec §8.2) — EINE
 * Client-Insel für BEIDE Aufrufer (`_ui/EinstiegKoordination.tsx` UND `verteilen/page.tsx`):
 * Spec §8.2 beschreibt den Posteingang als Teil des Einstiegs ("Verteilung" IST für die
 * Koordination der Einstieg selbst), die Routentabelle in Spec §8 führt `/verteilen` daneben als
 * eigene, adressierbare Route. Statt der Tabelle+dem Dialog ein zweites Mal zu bauen (die
 * Verdopplung, gegen die die `core`-Regel steht), bekommen BEIDE Seiten diese eine Komponente —
 * `/verteilen` bleibt trotzdem die Route, auf die Spec §8's Tabelle und der 404-Riegel (Spec §8.3)
 * zeigen, s. Bericht.
 *
 * `<Table columns={[{render: fn}]}>` GEHT NICHT AUS EINER SERVER COMPONENT (Brief, Falle 3) —
 * Vorbild `_ui/RoutinenTabelle.tsx`: eigene `"use client"`-Komponente, nur serialisierbare Daten als
 * Prop, Server Actions direkt importiert (`verteilenAction`).
 *
 * DIE ZIELLISTE (`bufdis`-Prop) KOMMT VOM AUFRUFER AUS `_db/queries.ts`s `bufdis()`, NICHT AUS
 * `aktivePersonen()` — diese Komponente nimmt nur entgegen, was die Server Component ihr reicht,
 * und baut die Liste nicht selbst nach (Brief: „die dritte Linie eines Riegels, nicht die erste").
 *
 * MODAL-SICHTBARKEIT IST ABGELEITET, KEIN ZWEITER ZUSTAND: `gewaehlteId` haelt nur, WELCHE Zeile
 * geklickt wurde; ob der Dialog offen ist, folgt daraus, ob diese Aufgabe noch im `posteingang`-Prop
 * steht. Verteilt `verteilenAction` erfolgreich, revalidiert die Seite, die Aufgabe verlaesst
 * `status = "eingegangen"` und damit den `posteingang`-Prop — der Dialog schliesst sich damit von
 * selbst, ohne einen `useEffect`, der zwischen „frisch gemountet" und „gerade erfolgreich
 * abgeschickt" unterscheiden muesste (beide Zustaende sind `{ ok: true }`, ununterscheidbar ueber
 * den Wert allein). Ein Feldfehler aendert `posteingang` nicht — die Zeile bleibt, der Dialog auch.
 */

export interface VerteilenTabelleProps {
  /** `status === "eingegangen"` — der Posteingang. */
  posteingang: AufgabeRow[];
  /** `person.id -> person.name`, fuer die Spalte „Auftraggeber" (`_lib/anzeige.ts`s `namenMap`). */
  erstellerNamen: Record<string, string>;
  /** Die Zielliste — aus `bufdis()`, s. Kopfkommentar. */
  bufdis: PersonRow[];
  /** Wochenauslastung je BuFDi (`_db/queries.ts`s `wochenAuslastungFuerBufdis`). */
  auslastung: AuslastungZeile[];
  /** Die fuenf Tage der aktuellen Woche — fuer die Ueberschrift des Auslastungs-Panels. */
  tage: readonly string[];
  heute: string;
  /**
   * OB DIE „VERTEILEN"-AKTION UEBERHAUPT ERSCHEINT — dasselbe Praedikat, das `verteilenAction`
   * ohnehin durchsetzt (`darfVerteilen`, ueber `uebergang()`), hier zusaetzlich an der Oberflaeche:
   * eine ausgeschiedene Koordinationsperson (theoretisch moeglich, s. Bericht) sieht sonst einen
   * Knopf, der serverseitig ohnehin ablehnt.
   */
  darfVerteilen: boolean;
}

export function VerteilenTabelle({
  posteingang,
  erstellerNamen,
  bufdis,
  auslastung,
  tage,
  heute,
  darfVerteilen,
}: VerteilenTabelleProps) {
  const [gewaehlteId, setGewaehlteId] = useState<string | null>(null);
  const gewaehlteAufgabe = posteingang.find((a) => a.id === gewaehlteId) ?? null;

  // LEERZUSTAND AUSGESCHRIEBEN (Spec §9.8), WORTGLEICH aus dem Brief — eine leere Tabelle sonst
  // sieht aus wie ein Ladefehler.
  if (posteingang.length === 0) {
    return <p data-testid="posteingang-leer">Posteingang leer — alles verteilt</p>;
  }

  return (
    <>
      <Table<AufgabeRow>
        rowKey="id"
        dataSource={posteingang}
        pagination={false}
        // OHNE `scroll`, BRICHT DIE TABELLE AUF 390PX (Brief, Spec §9.5).
        scroll={{ x: "max-content" }}
        columns={[
          {
            title: "Titel",
            key: "titel",
            render: (_: unknown, a: AufgabeRow) => a.titel,
          },
          {
            title: "Auftraggeber",
            key: "auftraggeber",
            render: (_: unknown, a: AufgabeRow) => erstellerNamen[a.erstellerId] ?? "—",
          },
          {
            title: "Priorität",
            key: "prioritaet",
            render: (_: unknown, a: AufgabeRow) => <PrioritaetChip prioritaet={a.prioritaet} />,
          },
          {
            title: "Frist",
            key: "frist",
            // DIE EINE FORM (Oberflaechen-Spec §6.2) — vorher klebte hier ein kleingeschriebenes
            // „ · überfällig" hinter dem Datum, waehrend `AufgabenListe`/`FreigabeZone` ein
            // grossgeschriebenes Wort in einer eigenen Spanne zeigten. Dieselbe Bedingung, zwei
            // Bilder; `Frist` traegt jetzt Datum UND Ueberfaelligkeit in einem Ausdruck.
            render: (_: unknown, a: AufgabeRow) => <Frist aufgabe={a} heute={heute} />,
          },
          {
            title: "Dauerschätzung",
            key: "dauer",
            render: (_: unknown, a: AufgabeRow) => fmtDauer(a.dauerMinuten),
          },
          {
            title: "Nachweispflicht",
            key: "nachweispflicht",
            render: (_: unknown, a: AufgabeRow) => (a.nachweisPflicht ? "Ja" : "Nein"),
          },
          {
            title: "Aktionen",
            key: "aktionen",
            render: (_: unknown, a: AufgabeRow) =>
              darfVerteilen ? (
                <Button
                  onClick={() => setGewaehlteId(a.id)}
                  data-testid={`verteilen-${a.id}`}
                >
                  Verteilen
                </Button>
              ) : null,
          },
        ]}
      />
      {gewaehlteAufgabe ? (
        <VerteilenModal
          // NEUER `key` JE AUFGABE (Vorbild `routinenInhalt`s `key={bearbeiten?.id ?? "neu"}"): ein
          // Wechsel der Zielaufgabe (zwei Klicks auf „Verteilen" hintereinander, ohne den Dialog
          // dazwischen zu schliessen) soll `useActionState` mit einem frischen Startwert beginnen,
          // nicht den Fehlerzustand der vorherigen Aufgabe stehen lassen.
          key={gewaehlteAufgabe.id}
          aufgabe={gewaehlteAufgabe}
          bufdis={bufdis}
          auslastung={auslastung}
          tage={tage}
          onClose={() => setGewaehlteId(null)}
        />
      ) : null}
    </>
  );
}

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
 * DER KNOPFTEXT NENNT DIE FOLGE, UND DAS IST KEINE HOEFLICHKEIT: `_lib/lebenszyklus.ts` fuehrt die
 * Zeile mit `planLoeschen: true` — wer „anders zuweisen" drueckt, verliert die bestehende
 * Tagesplanung der Aufgabe. Ein Knopf, der nur „Umverteilen" hiesse, verschwiege genau die
 * Wirkung, die man hinterher nicht zurueckholen kann.
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
  },
  umverteilen: {
    aktion: umverteilenAction,
    knopf: "Anders zuweisen (der Zeitplan wird dabei geleert)",
    absenden: "Anders zuweisen",
    titel: (titel: string): string => `„${titel}“ anders zuweisen`,
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

        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ padding: 0, marginBlockEnd: SPACE.xs }}>Zuweisen an</legend>
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
            {bufdis.map((b) => (
              <label
                key={b.id}
                htmlFor={`vd-ziel-${b.id}`}
                style={{ display: "flex", alignItems: "center", gap: SPACE.xs }}
              >
                <input
                  id={`vd-ziel-${b.id}`}
                  type="radio"
                  name="zielId"
                  value={b.id}
                  required
                  defaultChecked={gewaehltesZiel === b.id}
                  aria-describedby={zielFehler ? "vd-ziel-err" : undefined}
                />
                {b.name}
              </label>
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
          <Input
            id="vd-vorschlag-datum"
            name="vorschlagDatum"
            type="date"
            defaultValue={feldWert(state, "vorschlagDatum", "")}
            status={vorschlagDatumFehler ? "error" : undefined}
            aria-invalid={vorschlagDatumFehler ? true : undefined}
            aria-describedby={vorschlagDatumFehler ? "vd-vorschlag-datum-err" : undefined}
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
          <Input
            id="vd-vorschlag-uhrzeit"
            name="vorschlagUhrzeit"
            type="time"
            defaultValue={feldWert(state, "vorschlagUhrzeit", "")}
            status={vorschlagUhrzeitFehler ? "error" : undefined}
            aria-invalid={vorschlagUhrzeitFehler ? true : undefined}
            aria-describedby={vorschlagUhrzeitFehler ? "vd-vorschlag-uhrzeit-err" : undefined}
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
