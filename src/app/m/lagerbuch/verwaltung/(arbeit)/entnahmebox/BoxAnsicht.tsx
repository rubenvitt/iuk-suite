"use client";

/**
 * DIE VERWALTUNGSANSICHT DER ENTNAHMEBOX — DRK-314.
 *
 * ⚠️ DIE SPALTEN LEBEN HIER UND NICHT IN DER SERVER COMPONENT (Falle 9): ein
 * `columns[].render`, das in `page.tsx` entstuende, waere eine gewoehnliche
 * Funktion und liesse sich nicht ueber die RSC-Grenze reichen. `page.tsx` reicht
 * ausschliesslich serialisierbare Zeilen herein — und keinen einzigen `Date`
 * (dieselbe Zusage wie in `verwaltung/fahrzeuge` seit DRK-298: ein `Date`
 * ueberquert die Grenze klaglos und formatiert danach in der Zone des GERAETS).
 *
 * `size` steht an KEINEM Bedienelement (Falle 4) — die Bediendichte 44px kommt
 * aus dem Theme.
 *
 * ── WARUM DIE EINHEIT IN DER URL STEHT ─────────────────────────────────────
 *
 * ⚠️ ERST WAEHLEN, DANN LADEN — dieselbe Struktur wie auf dem Helferschirm und
 * aus demselben Grund: der Bestand JEDER Einheit im Payload waere bei zehn
 * Einheiten das Zehnfache dessen, was die Seite zeigt. Die Wahl schreibt
 * deshalb `?von=` und laedt neu, statt eine Matrix aller Einheiten vorzuhalten.
 * Nebenbei ist die Wahl damit adressierbar: „hier ist der Stand von RTW 1".
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Flex, InputNumber, Select, type TableProps } from "antd";
import { Datentabelle, nachText, nachZahl } from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { bucheInEntnahmebox } from "../../../_actions/entnahmebox";
import { ampelTon, fmtVerfall } from "../../../_lib/format";
import { BUCHUNG_MENGE_MAX } from "../../../_lib/grenzen";
import { einheitMeta, type Einheitenart } from "../../../_lib/konstanten";
import type { BoxPosten } from "../../../_lib/lesepfade/entnahmebox";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { fahrzeugFilter, type FahrzeugOption } from "../checks/ChecksFilter";
import { useUrlFilter } from "../../../_ui/useUrlFilter";

export type EinheitOption = {
  id: string;
  name: string;
  kennung: string | null;
  einheitenart: Einheitenart | null;
  aktiv: boolean;
};

/**
 * Ein Zugang, fertig fuer die Anzeige: `zeit` ist eine ZEICHENKETTE, die der
 * Server zonenexplizit gebaut hat (`fmtDatumZeit`).
 */
export type ZugangZeile = {
  buchungId: string;
  zeit: string;
  artikelName: string;
  menge: number;
  einheit: string;
  herkunft: string | null;
  wer: string;
};

const CHARGE_FEFO = "";

function inhaltSpalten(): NonNullable<TableProps<BoxPosten>["columns"]> {
  return [
    {
      title: "Artikel",
      dataIndex: "artikelName",
      sorter: nachText<BoxPosten>((z) => z.artikelName),
      defaultSortOrder: "ascend",
    },
    {
      title: "Menge",
      dataIndex: "menge",
      align: "right",
      sorter: nachZahl<BoxPosten>((z) => z.menge),
      render: (wert: number, zeile) => (
        <span>{wert} <span style={SCHRIFT.neben}>{zeile.einheit}</span></span>
      ),
    },
    {
      title: "Chargen",
      key: "chargen",
      render: (zeile: BoxPosten) => (
        <Flex gap={SPACE.sm} wrap>
          {zeile.chargen.map((c) => (
            /*
              ⚠️ DER CHIP TRAEGT DEN STATUS ALS TEXT, nicht allein ueber die
              Farbe — dieselbe Regel wie ueberall im Modul. Und er traegt ihn
              HIER besonders: wer die Kiste einraeumt, entscheidet an genau
              dieser Stelle, ob das Teil zurueck ins Regal geht oder in den
              Muell.

              ⚠️ DESHALB `c.text` UND NICHT `fmtVerfall(c.verfall)`
              (Codex-Review zu PR #175): das blosse Datum ist eine ZAHL, keine
              Aussage — „01/27" laesst offen, ob das gut oder schlecht ist, und
              die Antwort steckte allein in der Farbe. `chargeText` schreibt sie
              hin („abgelaufen", „laeuft 09/26 ab", „faellig 09/26",
              „bis 01/30") und nennt das Datum weiterhin mit; doppelt steht
              damit nichts. Dieselbe Form wie `Entnahme.tsx` und der
              `ArtikelDrawer`.
            */
            <Chip key={c.id} ton={ampelTon(c.ampel)}>
              {c.chargenNr} · {c.text} · {c.rest}
            </Chip>
          ))}
        </Flex>
      ),
    },
    {
      /*
       * ⚠️ EINE EIGENE SPALTE, NICHT EIN CHIP MEHR IN „Chargen" — DRK-377.
       * Die beiden Zahlen kommen aus verschiedenen Quellen und koennen sich
       * widersprechen: die Chargen tragen, was im BUCH steht, diese Spalte
       * traegt, was ein Mensch auf der PACKUNG gelesen und beim Check gemeldet
       * hat. Nebeneinander in einer Zelle stuenden „bis 12/99" und „läuft 10/26
       * ab" als gleichrangige Angaben zu derselben Sache da — und wer die
       * Kiste einraeumt, entscheidet an genau dieser Stelle zwischen Regal und
       * Muell.
       *
       * ⚠️ UND SIE IST GENAU DER FALL, DER DIE SPALTE NOETIG MACHT: kann ein
       * Check den gezaehlten Bestand keiner echten Charge zuordnen, legt er ihn
       * auf eine Pseudo-Charge ohne Verfall. Die Chargenspalte sagt dann „bis
       * 12/99" — kein Hinweis —, obwohl fuer dieses Material ein Datum gemeldet
       * wurde.
       */
      title: "Gemeldet",
      key: "gemeldet",
      render: (zeile: BoxPosten) => (
        zeile.gemeldet
          ? (
            <Chip
              ton={ampelTon(zeile.gemeldet.ampel)}
              zeichen={zeile.gemeldet.abgelaufen ? "warnung" : "verfall"}
            >
              {zeile.gemeldet.text}
            </Chip>
          )
          // Ein Strich und kein leeres Feld: „dazu liegt keine Meldung vor" ist
          // eine Auskunft, eine leere Zelle neben gefuellten liest sich als
          // vergessene Angabe.
          : <span style={SCHRIFT.neben}>—</span>
      ),
    },
  ];
}

function zugangSpalten(): NonNullable<TableProps<ZugangZeile>["columns"]> {
  return [
    { title: "Zeitpunkt", dataIndex: "zeit", render: (w: string) => <span style={SCHRIFT.mono}>{w}</span> },
    { title: "Artikel", dataIndex: "artikelName" },
    {
      title: "Menge",
      dataIndex: "menge",
      align: "right",
      render: (wert: number, zeile) => (
        <span>{wert} <span style={SCHRIFT.neben}>{zeile.einheit}</span></span>
      ),
    },
    {
      title: "Aus",
      dataIndex: "herkunft",
      /*
        ⚠️ „—" UND NICHT DER ROHE SCHLUESSEL. Die Herkunft steht als ID in der
        Referenz, ohne Fremdschluessel; eine geloeschte Einheit hinterlaesst sie
        als Waise. Den Rohwert zu zeigen hiesse, eine Zeichenkette anzubieten,
        die wie ein Name aussieht und keiner ist.
      */
      render: (wert: string | null) => wert ?? <span style={SCHRIFT.neben}>—</span>,
    },
    { title: "Wer", dataIndex: "wer", render: (w: string) => <span style={SCHRIFT.neben}>{w}</span> },
  ];
}

/**
 * Das Formular „aus einer Einheit in die Box".
 *
 * ⚠️ DER ARTIKEL WIRD AUS DEM BESTAND DER EINHEIT GEWAEHLT, nicht aus der
 * Artikelliste. Das ist keine Bequemlichkeit: ein Artikel, den die Einheit gar
 * nicht fuehrt, ergaebe eine Buchung, die der Server mit „Es liegen hier nur 0"
 * ablehnt — also eine Auswahl, deren Mehrzahl der Eintraege nicht funktioniert.
 */
function Abgabe({
  einheiten,
  gewaehlt,
  posten,
}: {
  einheiten: EinheitOption[];
  gewaehlt: EinheitOption | null;
  posten: BoxPosten[];
}) {
  const setzen = useUrlFilter();
  const router = useRouter();
  const [artikelId, setArtikelId] = useState<string>("");
  const [chargeId, setChargeId] = useState<string>(CHARGE_FEFO);
  const [menge, setMenge] = useState(1);
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);
  const [laeuft, start] = useTransition();

  const aktiverPosten = useMemo(
    () => posten.find((p) => p.artikelId === artikelId) ?? null,
    [posten, artikelId],
  );

  /*
   * ⚠️ DIE OBERGRENZE IST DIE CHARGE, SOBALD EINE GEWAEHLT IST — nicht die
   * Artikelmenge an der Einheit. Ohne diese Unterscheidung boete das Feld
   * eine Zahl an, die der Server danach ablehnt, und zwar erst nach dem Klick.
   *
   * ⚠️ UND `BUCHUNG_MENGE_MAX` DECKELT SIE (Codex-Review zu PR #175). Der
   * Bestand ist die FACHLICHE Grenze, der Deckel die TECHNISCHE: `BoxSchema`
   * weist alles darueber ab — mit „Die Eingabe war unvollständig", einem Satz,
   * der auf ein ausgefuelltes Formular nicht passt. Dieselbe Klasse wie das
   * fehlende `precision={0}`: nicht falsch gerechnet, sondern zwei Wahrheiten.
   * Deshalb kommt die Zahl aus `_lib/grenzen.ts` und nicht aus dieser Datei.
   */
  const grenze = Math.min(
    aktiverPosten
      ? (chargeId
          ? (aktiverPosten.chargen.find((c) => c.id === chargeId)?.rest ?? 0)
          : aktiverPosten.menge)
      : 0,
    BUCHUNG_MENGE_MAX,
  );

  function einheitWaehlen(wert: string | undefined): void {
    setArtikelId("");
    setChargeId(CHARGE_FEFO);
    setMenge(1);
    setMeldung(null);
    setzen({ von: wert ?? "" });
  }

  function absenden(): void {
    if (!gewaehlt || !aktiverPosten) return;
    const m = Math.min(menge, grenze);
    if (m <= 0) return;
    setMeldung(null);
    start(async () => {
      try {
        const r = await bucheInEntnahmebox({
          fahrzeugId: gewaehlt.id,
          artikelId: aktiverPosten.artikelId,
          menge: m,
          // Leer heisst „keine Charge gewaehlt" — der Server nimmt dann die
          // zuerst ablaufende. `null` und `""` duerfen nicht durcheinander
          // geraten: `""` faellt im Zod-Schema durch `min(1)`.
          chargeId: chargeId || null,
        });
        if (!r.ok) {
          // Der Server hat den Text; die Oberflaeche formuliert ihn NICHT neu.
          setMeldung({ art: "fehler", text: r.text });
          return;
        }
        setMeldung({
          art: "ok",
          text: `${r.wert.gebucht} × ${aktiverPosten.artikelName} in die Entnahmebox gebucht.`,
        });
        setArtikelId("");
        setChargeId(CHARGE_FEFO);
        setMenge(1);
        router.refresh();
      } catch {
        setMeldung({ art: "fehler", text: "Die Buchung wurde nicht gespeichert." });
      }
    });
  }

  return (
    <Card>
      <Flex vertical gap={SPACE.md}>
        <Flex gap={SPACE.md} wrap align="center">
          <Select<string, FahrzeugOption>
            showSearch
            allowClear
            filterOption={fahrzeugFilter}
            value={gewaehlt?.id || undefined}
            onChange={einheitWaehlen}
            placeholder="Einheit wählen"
            aria-label="Einheit"
            style={{ minWidth: 260 }}
            options={einheiten.map((e) => ({
              value: e.id,
              // Die Art steht im Label UND in den Suchworten (DRK-309):
              // „tasche" findet jede Tasche, auch wenn ihr Name das Wort nicht
              // trägt, und zwei gleichnamige Einheiten bleiben unterscheidbar.
              label: `${e.name} · ${einheitMeta(e)}${e.aktiv ? "" : " · stillgelegt"}`,
              keywords: `${e.kennung ?? ""} ${e.einheitenart ?? ""}`,
            }))}
          />

          {gewaehlt && (
            <Select<string>
              showSearch
              allowClear
              optionFilterProp="label"
              value={artikelId || undefined}
              onChange={(wert) => {
                setArtikelId(wert ?? "");
                setChargeId(CHARGE_FEFO);
                setMenge(1);
              }}
              placeholder="Artikel wählen"
              aria-label="Artikel"
              style={{ minWidth: 260 }}
              options={posten.map((p) => ({
                value: p.artikelId,
                label: `${p.artikelName} (${p.menge} ${p.einheit})`,
              }))}
            />
          )}

          {/*
            DIE CHARGENWAHL ERSCHEINT NUR, WENN ES ETWAS ZU WAEHLEN GIBT. Bei
            genau einer Charge ist die Frage beantwortet, bevor sie gestellt
            wird.
          */}
          {aktiverPosten && aktiverPosten.chargen.length > 1 && (
            <Select<string>
              value={chargeId}
              onChange={(wert) => { setChargeId(wert); setMenge(1); }}
              aria-label="Charge"
              style={{ minWidth: 260 }}
              options={[
                { value: CHARGE_FEFO, label: "Zuerst ablaufende Charge" },
                ...aktiverPosten.chargen.map((c) => ({
                  value: c.id,
                  label: `${c.chargenNr} · ${fmtVerfall(c.verfall)} · ${c.rest} ${aktiverPosten.einheit}`,
                })),
              ]}
            />
          )}

          {/*
            ⚠️ `InputNumber` UND NICHT DER MODUL-EIGENE `Stepper`. Der Stepper
            traegt die 56px-Bediendichte des Helfer-Wegs und liest
            `helfer.module.css`; hier gilt die ARBEITSDICHTE 44
            (`core/theme/theme.ts`), und `size` wird ausdruecklich NICHT gesetzt
            (Falle 4). Zwei Bediendichten nebeneinander in derselben Zeile sind
            kein Detail — sie sind der Grund, warum es die drei Dichten gibt.
          */}
          {aktiverPosten && (
            <InputNumber
              value={menge}
              onChange={(wert) => setMenge(typeof wert === "number" ? wert : 1)}
              min={1}
              max={Math.max(grenze, 1)}
              /*
               * ⚠️ `precision={0}` IST PFLICHT, NICHT ZIERDE (Codex-Review zu
               * PR #175). Ohne sie nimmt antds `InputNumber` Kommazahlen an:
               * „1,5" besteht min und max, der Knopf bleibt aktiv, und erst
               * `BoxSchema` weist es ab — mit „Die Eingabe war unvollständig",
               * einem Satz, der auf ein ausgefülltes Formular nicht passt. Jedes
               * andere Mengenfeld des Moduls setzt sie (`SollEditor`,
               * `AussondernDialog`, `ArtikelDrawer`, `ReferenzEditor`).
               */
              precision={0}
              aria-label="Menge"
              style={{ width: 120 }}
            />
          )}

          <Button
            type="primary"
            icon={<Ikone name="box" groesse={16} />}
            loading={laeuft}
            disabled={!aktiverPosten || grenze <= 0 || laeuft}
            onClick={absenden}
            data-rolle="box-buchen"
          >
            In die Entnahmebox buchen
          </Button>
        </Flex>

        {gewaehlt && posten.length === 0 && (
          <Alert
            type="info"
            showIcon={false}
            title={`Das Lagerbuch schreibt ${gewaehlt.name} keinen Bestand zu. Es lässt sich nichts abgeben.`}
          />
        )}

        {/* Falle 3: `colorError === colorPrimary` — ein `type="error"` sähe aus
            wie eine Primäraktion. Deshalb `warning` bzw. `success`. */}
        {meldung && (
          <Alert
            type={meldung.art === "ok" ? "success" : "warning"}
            showIcon={false}
            title={meldung.text}
            data-rolle="box-meldung"
          />
        )}
      </Flex>
    </Card>
  );
}

export function BoxAnsicht({
  boxName,
  nimmtAuf,
  einheiten,
  gewaehltId,
  quellPosten,
  inhalt,
  zugaenge,
}: {
  boxName: string;
  /**
   * Nimmt die Box ueberhaupt noch etwas auf? (Codex-Review zu PR #175.)
   *
   * ⚠️ IST SIE STILLGELEGT, VERSCHWINDET DIE ABGABE GANZ — sie zu zeigen und
   * erst der Action widersprechen zu lassen hiesse: Einheit waehlen, Artikel
   * waehlen, Menge tippen, klicken, abgewiesen werden. Der Hinweis dazu steht
   * in der Seite darueber; hier bleibt, was in der Kiste liegt, unveraendert
   * sichtbar — sie ausraeumen soll man ja weiter koennen.
   *
   * ⚠️ PFLICHT-PROP, KEIN OPTIONAL: ein vergessenes `nimmtAuf?` waere still
   * `undefined` und damit „nimmt nichts auf" — die Abgabe verschwaende dann auf
   * jeder Seite, und zwar lautlos.
   */
  nimmtAuf: boolean;
  einheiten: EinheitOption[];
  gewaehltId: string;
  quellPosten: BoxPosten[];
  inhalt: BoxPosten[];
  zugaenge: ZugangZeile[];
}) {
  const gewaehlt = einheiten.find((e) => e.id === gewaehltId) ?? null;
  const inhaltSpaltenliste = useMemo(() => inhaltSpalten(), []);
  const zugangSpaltenliste = useMemo(() => zugangSpalten(), []);

  return (
    <Flex vertical gap={SPACE.xl}>
      {nimmtAuf && (
        <Abgabe einheiten={einheiten} gewaehlt={gewaehlt} posten={quellPosten} />
      )}

      <Datentabelle<BoxPosten>
        rowKey="artikelId"
        aria-label={`Inhalt ${boxName}`}
        dataSource={inhalt}
        locale={{
          emptyText: "Die Entnahmebox ist leer. Was hier landet, kommt aus einem "
            + "Fahrzeug oder einer Tasche — über „In die Entnahmebox buchen“ oder "
            + "am Telefon über den Reiter „Box“.",
        }}
        columns={inhaltSpaltenliste}
      />

      <div>
        <h2 style={{ ...SCHRIFT.abschnitt, marginBlockStart: 0, marginBlockEnd: SPACE.sm }}>
          Zuletzt abgegeben
        </h2>
        <Datentabelle<ZugangZeile>
          rowKey="buchungId"
          aria-label="Zuletzt abgegeben"
          dataSource={zugaenge}
          locale={{ emptyText: "Noch nichts abgegeben." }}
          columns={zugangSpaltenliste}
        />
      </div>
    </Flex>
  );
}
