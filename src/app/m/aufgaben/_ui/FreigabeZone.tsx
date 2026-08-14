"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button, Input, Modal } from "antd";
import { freigebenAction, zurueckweisenAction } from "../actions";
import type { FreigabeZeile } from "../_db/queries";
import { NACHWEIS_ART_TEXT, fmtDauer, istUeberfaellig } from "../_lib/anzeige";
import { fmtTagKurz } from "../_lib/datum";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";
import { PrioritaetChip, StatusChip } from "./Chip";
import { Ikone } from "./ikonen";
import { NachweisBild } from "./NachweisBild";
import s from "./aufgaben.module.css";

/*
 * DIE FREIGABEZONE — GETEILT ZWISCHEN `/freigaben` UND `EinstiegAuftrag.tsx`s EIGENER
 * WARTESCHLANGE (Aufgabe 15, Spec §8.3, §8.4), DIESELBE FORM WIE `VerteilenDialog.tsx`s
 * `VerteilenTabelle` (dort begruendet: EINE Client-Insel fuer die adressierbare Route UND den
 * Einstieg, statt sie zweimal zu bauen). `_db/queries.ts`s `freigabeDaten(db, person, heute)` ist
 * die EINE Ladefunktion fuer beide Aufrufer — dieselbe Lehre wie `verteilDaten` (Aufgabe 14,
 * Fix-Runde 1: zwei separate Ladebloecke liefen bei der naechsten Aenderung auseinander, ohne dass
 * ein Test es sah).
 *
 * KEINE `<Table>` HIER, ANDERS ALS `VerteilenDialog.tsx`/`PersonenTabelle.tsx`/`RoutinenTabelle.tsx`
 * — eine Tabellenzeile ist fuer Spaltenwerte gebaut, nicht fuer einen mehrzeiligen Nachweistext.
 * Diese Datei rendert deshalb eine eigene Kartenliste; `<Table columns={[{render: fn}]}>` waere
 * ohnehin nur AUSSERHALB einer Server Component erlaubt (Falle 3), und diese Datei traegt bereits
 * `"use client"`.
 *
 * DER NACHWEIS GEHOERT SICHTBAR DAZU (Brief, Spec §8.4: „wer freigibt, muss sehen, was er
 * freigibt"). DIE NAHT FUER AUFGABE 19: `NachweisEintrag` unten unterscheidet `art === "text"`
 * (heute anzeigbar) von `art === "bild"` (heute strukturell erreichbar, aber ohne Auslieferung —
 * Aufgabe 17-19 bauen `core/av/scanner.ts`, die Ablage-Warteschlange und die Auslieferung erst
 * noch). Aufgabe 19 haengt dort NUR den Bildteil ein, sie tauscht keine Struktur aus.
 *
 * „ZURUECKWEISEN" IST BESTAETIGUNGSPFLICHTIG UND VERLANGT TEXT (Spec §8.4, §9.9) — ANDERS ALS
 * `PersonenTabelle.tsx`s „Beenden" (Popconfirm reicht dort, weil kein Feld noetig ist) TRAEGT DIESE
 * AKTION EIN PFLICHTFELD: ein `Popconfirm` kann keine Begruendung entgegennehmen. Der Klick auf
 * „Zurueckweisen" oeffnet deshalb — Vorbild `VerteilenDialog.tsx`s `VerteilenModal` — einen `Modal`
 * mit der Begruendung als `Input.TextArea` UND den beiden Knoepfen „Zurueckweisen“/„Abbrechen": der
 * zweite, deliberate Klick TRAEGT die Bestaetigung, der Text ist Pflicht (die Action lehnt seit
 * Aufgabe 10 ohne ihn ab — Feldfehler, kein Wurf, s. `zurueckweisenAction`s Kopfkommentar).
 *
 * „FREIGEBEN" BRAUCHT KEINE BESTAETIGUNG (Spec §9.9 nennt nur Zurueckziehen/Zurueckweisen/Person
 * deaktivieren) UND KEIN `useActionState` — dieselbe Form wie `RoutinenTabelle.tsx`s
 * `routineRuhenAction`: ein natives `<form action={freigebenAction}>` mit einem einzigen versteckten
 * Feld.
 *
 * `FreigabeAktionen` IST EXPORTIERT (Aufgabe 16) — die Knopfzeile (Freigeben/Zurückweisen) samt
 * Bestaetigungsdialog, OHNE Titel/Chips/Meta/Nachweis drumherum. `a/[id]/page.tsx`s
 * `_ui/AktionsZone.tsx` haengt sie dort ein, WEIL die Detailseite Titel, Chips, Metablock und
 * Nachweisbereich bereits selbst als eigene Abschnitte zeigt (Spec §8.4) — eine eingebettete volle
 * `FreigabeKarte` verlinkte dort auf sich selbst und wiederholte, was schon auf derselben Seite
 * steht. `FreigabeKarte` unten ruft `FreigabeAktionen` fuer genau dieselbe Logik — KEINE zweite
 * Fassung von „Freigeben"/„Zurückweisen bestaetigungspflichtig", nur ein zweiter Aufrufer.
 */
export function FreigabeAktionen({ aufgabe }: { aufgabe: FreigabeZeile["aufgabe"] }) {
  const [zurueckweisenOffen, setZurueckweisenOffen] = useState(false);

  return (
    <>
      <div className={s.knopfzeile}>
        <form action={freigebenAction}>
          <input type="hidden" name="aufgabeId" value={aufgabe.id} />
          <Button type="primary" size="small" htmlType="submit" data-testid={`freigeben-${aufgabe.id}`}>
            Freigeben
          </Button>
        </form>
        <Button
          size="small"
          onClick={() => setZurueckweisenOffen(true)}
          data-testid={`zurueckweisen-${aufgabe.id}`}
        >
          Zurückweisen
        </Button>
      </div>

      {zurueckweisenOffen ? (
        <ZurueckweisenModal aufgabe={aufgabe} onClose={() => setZurueckweisenOffen(false)} />
      ) : null}
    </>
  );
}

export interface FreigabeZoneProps {
  meine: FreigabeZeile[];
  vertretung: FreigabeZeile[];
  heute: string;
}

export function FreigabeZone({ meine, vertretung, heute }: FreigabeZoneProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
      <div>
        <h3 style={{ margin: `0 0 ${SPACE.xs}px`, fontSize: 14, fontWeight: 600 }}>Meine</h3>
        {meine.length === 0 ? (
          <p>Keine Freigabe offen</p>
        ) : (
          <FreigabeListe zeilen={meine} heute={heute} />
        )}
      </div>
      <div>
        <h3 style={{ margin: `0 0 ${SPACE.xs}px`, fontSize: 14, fontWeight: 600 }}>
          In Vertretung
        </h3>
        {vertretung.length === 0 ? (
          <p>Keine Freigabe in Vertretung offen</p>
        ) : (
          <FreigabeListe zeilen={vertretung} heute={heute} />
        )}
      </div>
    </div>
  );
}

function FreigabeListe({ zeilen, heute }: { zeilen: FreigabeZeile[]; heute: string }) {
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: SPACE.md,
      }}
    >
      {zeilen.map((zeile) => (
        <li
          key={zeile.aufgabe.id}
          style={{ borderBlockStart: "1px solid var(--auf-linie)", paddingBlockStart: SPACE.sm }}
        >
          <FreigabeKarte zeile={zeile} heute={heute} />
        </li>
      ))}
    </ul>
  );
}

function FreigabeKarte({ zeile, heute }: { zeile: FreigabeZeile; heute: string }) {
  const { aufgabe } = zeile;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: SPACE.sm }}>
        <Link href={`/a/${aufgabe.id}`}>{aufgabe.titel}</Link>
        <StatusChip status={aufgabe.status} />
        <PrioritaetChip prioritaet={aufgabe.prioritaet} />
        {istUeberfaellig(aufgabe, heute) ? (
          <span>
            <Ikone name="warnung" /> Überfällig
          </span>
        ) : null}
      </div>

      <p style={{ margin: 0, fontSize: 12 }}>
        Erstellt von {zeile.erstellerName} · Erledigt von {zeile.zugewiesenName} · Frist:{" "}
        {fmtTagKurz(aufgabe.faelligAm)} · {fmtDauer(aufgabe.dauerMinuten)} · Nachweispflicht:{" "}
        {aufgabe.nachweisPflicht ? `Ja (${NACHWEIS_ART_TEXT[aufgabe.nachweisArt]})` : "Nein"}
      </p>

      <NachweisBlock aufgabeId={aufgabe.id} nachweise={zeile.nachweise} />

      <FreigabeAktionen aufgabe={aufgabe} />
    </div>
  );
}

/**
 * `art === "bild"` HAENGT SEIT AUFGABE 19 AN `NachweisBild` (`./NachweisBild.tsx`) — derselben
 * Komponente wie `a/[id]/page.tsx`s Nachweisbereich, „keine zweite Fassung" der Bedingung „nur
 * sauber zeigt". Diese Funktion trifft selbst KEINE Entscheidung ueber Sichtbarkeit: `freigegeben`
 * kommt bereits fertig berechnet aus `_db/queries.ts`s `mitDatei`.
 */
function NachweisBlock({
  aufgabeId,
  nachweise,
}: {
  aufgabeId: string;
  nachweise: FreigabeZeile["nachweise"];
}) {
  return (
    <div>
      <p style={{ margin: `0 0 ${SPACE.xs}px`, fontSize: 12, fontWeight: 600 }}>Nachweis</p>
      {nachweise.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12 }}>Kein Nachweis hinterlegt.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          {nachweise.map(({ nachweis: n, datei, freigegeben }) => (
            <li key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: SPACE.xs }}>
              {n.art === "text" ? (
                <>
                  <Ikone name="nachweis-text" />
                  <span style={{ fontSize: 12 }}>{n.text}</span>
                </>
              ) : (
                <NachweisBild
                  aufgabeId={aufgabeId}
                  nachweisId={n.id}
                  datei={datei}
                  freigegeben={freigegeben}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ZurueckweisenModal({
  aufgabe,
  onClose,
}: {
  aufgabe: FreigabeZeile["aufgabe"];
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState(zurueckweisenAction, FORM_START);
  const begruendungFehler = feldFehler(state, "begruendung");

  return (
    <Modal open onCancel={onClose} footer={null} title={`„${aufgabe.titel}“ zurückweisen`}>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
        <input type="hidden" name="aufgabeId" value={feldWert(state, "aufgabeId", aufgabe.id)} />

        <div>
          <label htmlFor="fz-begruendung" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
            Begründung
          </label>
          <Input.TextArea
            id="fz-begruendung"
            name="begruendung"
            autoSize={{ minRows: 3, maxRows: 8 }}
            defaultValue={feldWert(state, "begruendung", "")}
            status={begruendungFehler ? "error" : undefined}
            aria-invalid={begruendungFehler ? true : undefined}
            aria-describedby={begruendungFehler ? "fz-begruendung-err" : undefined}
          />
          {begruendungFehler ? (
            <p id="fz-begruendung-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
              {begruendungFehler}
            </p>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: SPACE.sm }}>
          <Button
            danger
            htmlType="submit"
            loading={isPending}
            disabled={isPending}
            style={{ alignSelf: "flex-start" }}
          >
            Zurückweisen
          </Button>
          <Button
            onClick={onClose}
            disabled={isPending}
            style={{ alignSelf: "flex-start" }}
            data-testid="zurueckweisen-abbrechen"
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
