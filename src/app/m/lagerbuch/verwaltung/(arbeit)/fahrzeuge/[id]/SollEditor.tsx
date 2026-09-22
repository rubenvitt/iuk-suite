"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Alert,
  Button,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  type TableProps,
} from "antd";
import { Kartentabelle, trifftWert, werteAlsFilter } from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import {
  sollPositionEntfernen,
  sollPositionSetzen,
  sollPositionWiederherstellen,
} from "../../../../_actions/fahrzeuge";
import type { ActionAusgang } from "../../../../_lib/actionErgebnis";
import type { SollZeile } from "../../../../_lib/lesepfade/fahrzeuge";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";
import { Ikone } from "../../../../_ui/ikonen";
import s from "../../../../_ui/verwaltung.module.css";

const SOLL_DEBOUNCE_MS = 400;
const SPEICHER_FEHLER = "Soll-Position konnte nicht gespeichert werden.";
const ENTFERNEN_FEHLER = "Soll-Position konnte nicht entfernt werden.";
const RESTORE_FEHLER = "Soll-Position konnte nicht wiederhergestellt werden.";

export type ArtikelOption = {
  value: string;
  label: string;
  keywords: string;
};

type SollAnzeigeZeile = SollZeile & { rowSpan: number };

/** `showSearch` findet damit neben dem Namen auch das Handlager-Fach. */
export function fachFilter(eingabe: string, option?: ArtikelOption): boolean {
  return `${option?.label ?? ""} ${option?.keywords ?? ""}`
    .toLocaleLowerCase("de")
    .includes(eingabe.trim().toLocaleLowerCase("de"));
}

/** Sortiert eine Kopie und markiert die erste Zelle jeder echten Fachgruppe. */
export function sollGruppieren(positionen: SollZeile[]): SollAnzeigeZeile[] {
  const sortiert = [...positionen].sort((a, b) =>
    a.fachLabel.localeCompare(b.fachLabel, "de")
    || a.sort - b.sort
    || a.id.localeCompare(b.id, "de"));
  const gruppengroesse = new Map<string, number>();
  for (const position of sortiert) {
    gruppengroesse.set(
      position.fachLabel,
      (gruppengroesse.get(position.fachLabel) ?? 0) + 1,
    );
  }
  const gesehen = new Set<string>();
  return sortiert.map((position) => {
    const erste = !gesehen.has(position.fachLabel);
    gesehen.add(position.fachLabel);
    return {
      ...position,
      rowSpan: erste ? (gruppengroesse.get(position.fachLabel) ?? 1) : 0,
    };
  });
}

/** Verschiedene aktive Faecher je Artikel; Grabsteine zaehlen nicht mit. */
export function faecherJeArtikelZaehlen(positionen: SollZeile[]): Map<string, number> {
  const faecher = new Map<string, Set<string>>();
  for (const position of positionen) {
    if (position.entfernt) continue;
    const menge = faecher.get(position.artikelId) ?? new Set<string>();
    menge.add(position.fachLabel);
    faecher.set(position.artikelId, menge);
  }
  return new Map(Array.from(faecher, ([artikelId, menge]) => [artikelId, menge.size]));
}

const HERKUNFT_TON = {
  manuell: "grau",
  vorlage: "grau",
  ueberschrieben: "gelb",
} as const;

export function SollEditor({
  fahrzeugId,
  positionen,
  artikel,
}: {
  fahrzeugId: string;
  positionen: SollZeile[];
  artikel: { id: string; name: string; fach: string }[];
}) {
  const [neuFach, setNeuFach] = useState("");
  const [neuArtikel, setNeuArtikel] = useState<string>();
  const [neuSoll, setNeuSoll] = useState<number | null>(1);
  const [spiegel, setSpiegel] = useState<Record<string, number>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  // Zum Timer gehoert sein Rumpf: nur so kann `onBlur` den ausstehenden
  // Schreibvorgang VORZIEHEN, statt ihn nur abzuraeumen. Ohne das verliert das
  // Verlassen der Seite innerhalb der Entprellzeit die Eingabe stillschweigend.
  const timer = useRef<Record<string, {
    id: ReturnType<typeof setTimeout>;
    sofort: () => void;
  }>>({});

  const zeilen = useMemo(() => sollGruppieren(positionen), [positionen]);
  const faecherJeArtikel = useMemo(() => faecherJeArtikelZaehlen(positionen), [positionen]);
  const optionen = useMemo<ArtikelOption[]>(() => artikel.map((eintrag) => ({
    value: eintrag.id,
    label: eintrag.name,
    keywords: eintrag.fach,
  })), [artikel]);

  useEffect(() => () => {
    for (const ausstehend of Object.values(timer.current)) clearTimeout(ausstehend.id);
    timer.current = {};
  }, []);

  /**
   * `ActionAusgang` statt `{ ok: boolean }`: die Actions
   * unterscheiden „Einheit nicht gefunden." von „Soll-Position nicht
   * gefunden." von einem Schreibfehler, und nur der Satz aus der Action sagt
   * der Person, ob neu laden, erneut versuchen oder etwas anderes eintragen
   * hilft. Der Konstantentext bleibt Rueckfall fuer den Wurf — dort ist
   * `e.message` in Produktion Framework-Englisch (siehe `_lib/actionErgebnis`).
   */
  async function sicherAusfuehren(
    aktion: () => Promise<ActionAusgang>,
    fehlerText: string,
  ): Promise<boolean> {
    try {
      const ergebnis = await aktion();
      if (!ergebnis.ok) {
        setFehler(ergebnis.fehler);
        return false;
      }
      setFehler(null);
      return true;
    } catch {
      setFehler(fehlerText);
      return false;
    }
  }

  function sollGeaendert(position: SollZeile, wert: number | null): void {
    if (wert === null) return;
    setSpiegel((vorher) => ({ ...vorher, [position.id]: wert }));
    clearTimeout(timer.current[position.id]?.id);
    const payload = {
      id: position.id,
      fahrzeugId,
      fachLabel: position.fachLabel,
      artikelId: position.artikelId,
      soll: wert,
      sort: position.sort,
    };
    const sofort = () => {
      delete timer.current[position.id];
      void sicherAusfuehren(
        () => sollPositionSetzen(payload),
        SPEICHER_FEHLER,
      );
    };
    timer.current[position.id] = {
      id: setTimeout(sofort, SOLL_DEBOUNCE_MS),
      sofort,
    };
  }

  function ausstehendenSollCommitVerwerfen(positionId: string): void {
    const ausstehend = timer.current[positionId];
    if (ausstehend === undefined) return;
    clearTimeout(ausstehend.id);
    delete timer.current[positionId];
  }

  /**
   * Zieht einen entprellten Schreibvorgang beim Verlassen des Feldes vor.
   *
   * Ohne das ist jede Aenderung verloren, die innerhalb der Entprellzeit von
   * einem Klick auf den `zurueck`-Weg im Seitenkopf oder einem Seitenwechsel
   * gefolgt wird — der Aufraeumer in `useEffect` loescht den Timer, ohne ihn
   * auszufuehren, und es gibt keinen Hinweis darauf. Form aus
   * `bz/[id]/ReferenzEditor.tsx`.
   */
  function ausstehendenSollCommitAusfuehren(positionId: string): void {
    const ausstehend = timer.current[positionId];
    if (ausstehend === undefined) return;
    clearTimeout(ausstehend.id);
    ausstehend.sofort();
  }

  /**
   * ⚠️ DIESE TABELLE BEKOMMT KEINE SORTIERUNG — UND NUR EINEN FILTER, DEN AUF
   * DAS FACH. Beides ist kein Versehen, und beides hat DIESELBE Ursache.
   *
   * Die Fachspalte ist ueber `onCell: { rowSpan }` zusammengefasst; die
   * Zusammenfassung rechnet `sollGruppieren` EINMAL auf der nach `fachLabel`
   * sortierten Kopie — also auf der VOLLEN Liste, bevor antd irgendetwas
   * anfasst. Jeder Eingriff danach, der die Gruppen DURCHMISCHT ODER
   * ANSCHNEIDET, macht die gemerkten Spannweiten falsch:
   *
   * - SORTIEREN mischt sie durch: die Zelle mit `rowSpan > 0` steht nicht mehr
   *   am Anfang ihrer Gruppe, die Tabelle verschluckt Zeilen oder zeigt das
   *   Fach an der falschen Stelle.
   * - EIN FILTER AUF EINE ANDERE SPALTE schneidet sie an. Genau das tat bis
   *   DRK-331 (dritte Reviewrunde) der Filter auf `herkunft`: ein Fach kann
   *   Positionen verschiedener Herkunft enthalten. Faellt die ERSTE Zeile einer
   *   Gruppe heraus, bleibt die ueberlebende auf `rowSpan: 0` und ihre
   *   Fachzelle verschwindet; ueberlebt die erste, reicht ihre alte Spannweite
   *   ins NAECHSTE Fach hinein. Die Eingabefelder stehen dann unter dem
   *   falschen Fach — eine schreibende Flaeche an der falschen Zeile.
   *
   * Der FACHFILTER ist als einziger unbedenklich: sein Praedikat liest genau
   * das Merkmal, nach dem gruppiert wurde, und entfernt deshalb immer GANZE
   * Gruppen. Wer hier eine weitere Spalte filterbar macht, muss die
   * Spannweiten aus den GEFILTERTEN Zeilen neu rechnen — kein Tor faende den
   * Fehler, und Vitest sieht `rowSpan` nur als Zahl, nicht als Bild.
   */
  const spalten: TableProps<SollAnzeigeZeile>["columns"] = [
    {
      title: "Fach",
      dataIndex: "fachLabel",
      key: "fach",
      onCell: (position) => ({ rowSpan: position.rowSpan }),
      filters: werteAlsFilter(zeilen, (position) => position.fachLabel),
      onFilter: trifftWert<SollAnzeigeZeile>((position) => position.fachLabel),
      render: (fachLabel: string) => <span className={s.fach}>{fachLabel}</span>,
    },
    {
      title: "Artikel",
      dataIndex: "artikelName",
      key: "artikel",
      render: (artikelName: string, position) => (
        // 2 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) — enger
        // Zweizeiler aus Artikelname und Bestandstext, keine Geschwisterzeile
        // in diesem Zuschnitt, die einen Skalenwert nahelegen wuerde.
        <div style={{ display: "grid", gap: 2 }}>
          <span
            data-rolle={position.entfernt ? "grabstein" : undefined}
            style={position.entfernt
              ? { textDecoration: "line-through", opacity: 0.6 }
              : undefined}
          >
            {artikelName}{" "}
            {position.entfernt ? <Chip ton="grau">entfernt</Chip> : null}
          </span>
          <span style={SCHRIFT.neben}>
            Handlager {position.handlagerBestand} {position.einheit}
          </span>
        </div>
      ),
    },
    {
      // DER IST STEHT IN EIGENER SPALTE, NICHT IM NEBENTEXT (DRK-315). Dort
      // war er 12px grau und von der Handlager-Zahl daneben nur am Wort zu
      // unterscheiden. Gross gesetzt und neben dem Soll-Feld lesen sich beide
      // als Paar: IST ist Zahl, SOLL ist Eingabe. Keine Farbe fuer die
      // Abweichung — Rot gehoert nicht auf eine Datenflaeche (Falle 3).
      // KEIN `width`: sonst stimmt `scroll.x = "max-content"` nicht mehr.
      title: "Ist",
      dataIndex: "fahrzeugBestand",
      key: "ist",
      align: "right",
      render: (bestand: number, position) => {
        const faecherGesamt = faecherJeArtikel.get(position.artikelId) ?? 0;
        return (
          // `gap: 2` wie in der Artikelzelle, s. dort.
          <div
            data-rolle="ist"
            style={{
              display: "grid",
              gap: 2,
              justifyItems: "end",
              opacity: position.entfernt ? 0.6 : undefined,
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              <span style={SCHRIFT.zahl}>{bestand}</span>{" "}
              <span style={SCHRIFT.neben}>{position.einheit}</span>
            </span>
            {/*
              Der Bestand gehoert dem ARTIKEL im Fahrzeug, nicht dem Fach.
              Steht der Artikel in mehreren Faechern, stuende sonst dieselbe
              grosse Zahl mehrfach da und laese sich als Ist je Fach.
            */}
            {faecherGesamt > 1 ? (
              <span style={{ ...SCHRIFT.neben, whiteSpace: "nowrap" }}>
                gesamt für {faecherGesamt} Fächer
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      title: "Soll",
      dataIndex: "soll",
      key: "soll",
      align: "right",
      render: (wert: number, position) => (
        // KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
        // docs/design/README.md) ist mit der Arbeitsdichte gefallen -- 44px
        // ist hier bereits die volle wie die halbe Bediendichte, "small"
        // unterbietet die Mindesttapflaeche (WCAG 2.5.5).
        <InputNumber
          min={1}
          max={9999}
          precision={0}
          disabled={position.entfernt}
          value={spiegel[position.id] ?? wert}
          onChange={(neu) => sollGeaendert(position, neu)}
          onBlur={() => ausstehendenSollCommitAusfuehren(position.id)}
          aria-label={`Soll für ${position.artikelName}`}
        />
      ),
    },
    {
      title: "Herkunft",
      dataIndex: "herkunft",
      key: "herkunft",
      // ⚠️ KEIN `filters` HIER — Begruendung im Block ueber der Spaltenliste:
      // eine Herkunft schneidet Fachgruppen an, und die Spannweiten sind schon
      // gerechnet.
      render: (herkunft: SollZeile["herkunft"]) => (
        <Chip ton={HERKUNFT_TON[herkunft]}>{herkunft}</Chip>
      ),
    },
    {
      title: "",
      dataIndex: "id",
      key: "aktion",
      render: (_id: string, position) => position.entfernt ? (
        // KEIN size="small" an den beiden Zeilenaktionen unten, s. o.
        <Button
          data-rolle="wiederherstellen"
          loading={laeuft}
          icon={<Ikone name="zuruecksetzen" groesse={14} />}
          onClick={() => startTransition(async () => {
            await sicherAusfuehren(
              () => sollPositionWiederherstellen({ id: position.id }),
              RESTORE_FEHLER,
            );
          })}
        >
          zurücksetzen
        </Button>
      ) : (
        <Popconfirm
          title="Position entfernen?"
          okText="Entfernen"
          cancelText="Abbrechen"
          onConfirm={() => {
            // Ein spaeter Soll-Commit wuerde eine template-abgeleitete Zeile
            // mit `entfernt:false` wiederbeleben. Entfernen gewinnt deshalb
            // synchron gegen den noch nicht gestarteten Debounce.
            ausstehendenSollCommitVerwerfen(position.id);
            return new Promise<void>((fertig) => {
              startTransition(async () => {
                await sicherAusfuehren(
                  () => sollPositionEntfernen({ id: position.id }),
                  ENTFERNEN_FEHLER,
                );
                fertig();
              });
            });
          }}
        >
          <Button
            danger
            loading={laeuft}
            icon={<Ikone name="papierkorb" groesse={14} />}
            aria-label={`${position.artikelName} aus Fach ${position.fachLabel} entfernen`}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    // `minmax(0, 1fr)` STATT DER IMPLIZITEN `auto`-SPALTE: die waechst auf die
    // Mindestbreite der Tabelle, und `scroll.x` kommt nie zum Zug — gemessen
    // (DRK-315) lief das Fahrzeugblatt bei 390px um 372px waagerecht ueber,
    // statt die Tabelle in sich scrollen zu lassen.
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      <Kartentabelle<SollAnzeigeZeile>
        rowKey="id"
        aria-label="Soll-Bestückung"
        dataSource={zeilen}
        leer={{
          nichts: "Noch keine Soll-Position. Lege unten die erste an.",
          gefiltert: "Keine Soll-Position passt zum Filter.",
        }}
        columns={spalten}
      />
      <Flex gap={SPACE.sm} wrap align="center">
        <Input
          placeholder="Fach"
          aria-label="Fach"
          value={neuFach}
          onChange={(ereignis) => setNeuFach(ereignis.target.value)}
          style={{ minWidth: 160, width: "auto" }}
        />
        <Select<string, ArtikelOption>
          showSearch
          filterOption={fachFilter}
          value={neuArtikel}
          onChange={setNeuArtikel}
          placeholder="Artikel"
          aria-label="Artikel"
          style={{ minWidth: 240 }}
          options={optionen}
        />
        <InputNumber
          min={1}
          max={9999}
          precision={0}
          value={neuSoll}
          onChange={setNeuSoll}
          aria-label="Soll"
        />
        <Button
          type="primary"
          icon={<Ikone name="plus" groesse={16} />}
          loading={laeuft}
          disabled={!neuFach.trim() || !neuArtikel || !neuSoll || laeuft}
          onClick={() => {
            const payload = {
              fahrzeugId,
              fachLabel: neuFach.trim(),
              artikelId: neuArtikel!,
              soll: neuSoll!,
            };
            startTransition(async () => {
              const erfolgreich = await sicherAusfuehren(
                () => sollPositionSetzen(payload),
                SPEICHER_FEHLER,
              );
              if (erfolgreich) {
                setNeuArtikel(undefined);
                setNeuSoll(1);
              }
            });
          }}
        >
          Position hinzufügen
        </Button>
      </Flex>
    </div>
  );
}
