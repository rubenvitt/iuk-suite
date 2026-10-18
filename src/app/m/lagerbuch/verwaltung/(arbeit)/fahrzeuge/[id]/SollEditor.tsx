"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Checkbox,
  Collapse,
  Flex,
  InputNumber,
  Popconfirm,
  Select,
  Switch,
  type TableProps,
} from "antd";
import { Kartentabelle, useEntprellt } from "@/core/tabelle";
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
import { Suchfeld } from "../../../../_ui/Suchfeld";

const SOLL_DEBOUNCE_MS = 400;
const SPEICHER_FEHLER = "Soll-Position konnte nicht gespeichert werden.";
const ENTFERNEN_FEHLER = "Soll-Position konnte nicht entfernt werden.";
const RESTORE_FEHLER = "Soll-Position konnte nicht wiederhergestellt werden.";

/**
 * Bis zu so vielen aktiven Positionen stehen alle Fächer beim Öffnen offen.
 * Darüber beginnt das Soll zugeklappt — zehn Fachköpfe mit ihren Zählern sind
 * dann die Übersicht, und ein großes Fahrzeug rendert nicht 200 Zeilen auf
 * einmal (IDA-232, gemessen mit 210 Positionen in 10 Fächern).
 */
export const OFFEN_BIS_POSITIONEN = 40;

export type ArtikelOption = {
  value: string;
  label: string;
  keywords: string;
};

/** `showSearch` findet damit neben dem Namen auch das Handlager-Fach. */
export function fachFilter(eingabe: string, option?: ArtikelOption): boolean {
  return `${option?.label ?? ""} ${option?.keywords ?? ""}`
    .toLocaleLowerCase("de")
    .includes(eingabe.trim().toLocaleLowerCase("de"));
}

export type SollGruppe = {
  fach: string;
  positionen: SollZeile[];
  /** Aktive Positionen — Grabsteine zählen nicht als Soll. */
  aktiv: number;
  entfernt: number;
};

/**
 * Gruppiert nach Fach — Fächer alphabetisch, innerhalb nach `sort`, dann `id`.
 * Arbeitet auf einer Kopie; die Prop bleibt unberührt.
 *
 * ⚠️ DIE FACHÜBERSCHRIFT STEHT ÜBER IHRER GRUPPE, NICHT IN EINER ZUSAMMEN-
 * GEFASSTEN ZELLE (IDA-232). Bis hierher trug die erste Spalte das Fach als
 * `rowSpan` über alle Zeilen der Gruppe, senkrecht mittig — bei 21 Zeilen stand
 * der Name rund 600px unter dem Gruppenanfang und war beim Scrollen meist gar
 * nicht zu sehen. Dazu kam die Falle, die der alte Kommentar ausführlich
 * beschrieb: jede Sortierung und jeder Filter auf einer anderen Spalte machte
 * die gemerkten Spannweiten falsch. Mit einer Tabelle je Fach gibt es keine
 * Spannweite mehr, die falsch werden kann.
 */
export function sollNachFach(positionen: readonly SollZeile[]): SollGruppe[] {
  const sortiert = [...positionen].sort((a, b) =>
    a.fachLabel.localeCompare(b.fachLabel, "de")
    || a.sort - b.sort
    || a.id.localeCompare(b.id, "de"));
  const gruppen = new Map<string, SollGruppe>();
  for (const position of sortiert) {
    const gruppe = gruppen.get(position.fachLabel)
      ?? { fach: position.fachLabel, positionen: [], aktiv: 0, entfernt: 0 };
    gruppe.positionen.push(position);
    if (position.entfernt) gruppe.entfernt += 1;
    else gruppe.aktiv += 1;
    gruppen.set(position.fachLabel, gruppe);
  }
  return [...gruppen.values()];
}

/** Die Suche über Artikelname, Fach der Einheit und Handlager-Fach. */
export function sollTrifft(position: SollZeile, suche: string): boolean {
  const muster = suche.trim().toLocaleLowerCase("de");
  if (!muster) return true;
  return `${position.artikelName} ${position.fachLabel} ${position.handlagerFach}`
    .toLocaleLowerCase("de")
    .includes(muster);
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

/**
 * ⚠️ FESTE BREITEN, DAMIT DIE TABELLEN DER FÄCHER UNTEREINANDER FLUCHTEN. Jede
 * Gruppe ist eine eigene Tabelle; nach Inhalt gemessen stünde die Soll-Spalte
 * in jedem Fach woanders. Die Artikelspalte trägt KEINE Breite und nimmt den
 * Rest — `scroll.x` ist ihre Mindestbreite plus die Summe der übrigen.
 */
const BREITE = {
  artikelMindestens: 280,
  ist: 120,
  soll: 120,
  immerZaehlen: 120,
  herkunft: 130,
  aktion: 150,
} as const;

function zaehltext(gruppe: SollGruppe): string {
  const aktiv = `${gruppe.aktiv} ${gruppe.aktiv === 1 ? "Position" : "Positionen"}`;
  return gruppe.entfernt > 0 ? `${aktiv} · ${gruppe.entfernt} entfernt` : aktiv;
}

/**
 * DIE SOLL-BESTÜCKUNG — seit IDA-232 ein LESEMODUS mit Schalter „Bearbeiten".
 *
 * Vorher stand in jeder Zeile ein Mengenfeld mit automatischem Speichern, ein
 * Kästchen und ein roter Löschknopf: zweihundert offene Eingaben auf einer
 * Fläche, die im Alltag gelesen wird. Jetzt zeigt das Soll erst einmal Zahlen;
 * „Bearbeiten" schaltet Mengenfeld, „Immer zählen" und Entfernen frei. Das
 * Speichern selbst ist unverändert — entprellt, je Feld, mit vorgezogenem
 * Schreiben beim Verlassen.
 */
export function SollEditor({
  fahrzeugId,
  positionen,
  artikel,
}: {
  fahrzeugId: string;
  positionen: SollZeile[];
  artikel: { id: string; name: string; fach: string }[];
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [suche, setSuche] = useState("");
  const sucheNachlauf = useEntprellt(suche);
  const [neuOffen, setNeuOffen] = useState(false);
  const [neuFach, setNeuFach] = useState("");
  const [neuArtikel, setNeuArtikel] = useState<string>();
  const [neuSoll, setNeuSoll] = useState<number | null>(1);
  const [spiegel, setSpiegel] = useState<Record<string, number>>({});
  const [pflicht, setPflicht] = useState<Record<string, boolean>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  // Zum Timer gehoert sein Rumpf: nur so kann `onBlur` den ausstehenden
  // Schreibvorgang VORZIEHEN, statt ihn nur abzuraeumen. Ohne das verliert das
  // Verlassen der Seite innerhalb der Entprellzeit die Eingabe stillschweigend.
  const timer = useRef<Record<string, {
    id: ReturnType<typeof setTimeout>;
    sofort: () => void;
  }>>({});

  const gruppen = useMemo(() => sollNachFach(positionen), [positionen]);
  const faecherJeArtikel = useMemo(() => faecherJeArtikelZaehlen(positionen), [positionen]);
  const optionen = useMemo<ArtikelOption[]>(() => artikel.map((eintrag) => ({
    value: eintrag.id,
    label: eintrag.name,
    keywords: eintrag.fach,
  })), [artikel]);
  const fachOptionen = useMemo(
    () => gruppen.map((gruppe) => ({ value: gruppe.fach })),
    [gruppen],
  );

  const [offeneFaecher, setOffeneFaecher] = useState<string[]>(() =>
    positionen.filter((position) => !position.entfernt).length <= OFFEN_BIS_POSITIONEN
      ? gruppen.map((gruppe) => gruppe.fach)
      : []);

  const sichtbareGruppen = useMemo(() => gruppen
    .map((gruppe) => ({
      ...gruppe,
      positionen: gruppe.positionen.filter((position) => sollTrifft(position, sucheNachlauf)),
    }))
    .filter((gruppe) => gruppe.positionen.length > 0), [gruppen, sucheNachlauf]);

  /*
   * EINE SUCHE KLAPPT IHRE TREFFER AUF — einmal, beim Ändern des Suchworts, und
   * im Rendern statt in einem Effekt (Reacts Muster „Zustand bei geänderter
   * Eingabe anpassen"). Danach gehört der Zustand wieder der Person: ein Fach,
   * das sie während der Suche zuklappt, bleibt zu.
   */
  const [gesuchtFuer, setGesuchtFuer] = useState(sucheNachlauf);
  if (gesuchtFuer !== sucheNachlauf) {
    setGesuchtFuer(sucheNachlauf);
    if (sucheNachlauf.trim()) setOffeneFaecher(sichtbareGruppen.map((gruppe) => gruppe.fach));
  }

  const alleOffen = sichtbareGruppen.length > 0
    && sichtbareGruppen.every((gruppe) => offeneFaecher.includes(gruppe.fach));

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

  /**
   * IDA-223. Sofort, nicht entprellt: ein Klick ist eine Entscheidung. Das
   * Soll reist aus dem Spiegel mit, damit ein noch entprelltes Soll nicht vom
   * gespeicherten Wert ueberholt wird. An einer Vorlagenzeile ueberschreibt
   * der Klick wie jede andere Aenderung (`sollPositionSetzen`).
   */
  function pflichtGeaendert(position: SollZeile, wert: boolean): void {
    setPflicht((vorher) => ({ ...vorher, [position.id]: wert }));
    void sicherAusfuehren(
      () => sollPositionSetzen({
        id: position.id,
        fahrzeugId,
        fachLabel: position.fachLabel,
        artikelId: position.artikelId,
        soll: spiegel[position.id] ?? position.soll,
        sort: position.sort,
        immerZaehlen: wert,
      }),
      SPEICHER_FEHLER,
    ).then((ok) => {
      if (!ok) setPflicht((vorher) => ({ ...vorher, [position.id]: !wert }));
    });
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
   * Beim Verlassen des Bearbeitens verschwinden die Felder — und mit ihnen
   * jedes `onBlur`. Was noch entprellt wartet, wird deshalb HIER vorgezogen,
   * aus demselben Grund wie oben.
   */
  function bearbeitenUmschalten(an: boolean): void {
    if (!an) {
      for (const positionId of Object.keys(timer.current)) {
        ausstehendenSollCommitAusfuehren(positionId);
      }
    }
    setBearbeiten(an);
  }

  function hinzufuegen(): void {
    const fach = neuFach.trim();
    const payload = {
      fahrzeugId,
      fachLabel: fach,
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
        // Das Fach der neuen Position aufklappen — sonst landete sie
        // unsichtbar in einer zugeklappten Gruppe.
        setOffeneFaecher((vorher) => (vorher.includes(fach) ? vorher : [...vorher, fach]));
      }
    });
  }

  const artikelSpalte: NonNullable<TableProps<SollZeile>["columns"]>[number] = {
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
          {/* Im Lesemodus steht „immer zählen" als Kennzeichen am Namen; beim
              Bearbeiten übernimmt die eigene Spalte mit dem Kästchen. */}
          {!bearbeiten && !position.entfernt && (pflicht[position.id] ?? position.immerZaehlen)
            ? <Chip ton="grau">immer zählen</Chip>
            : null}
        </span>
        <span style={SCHRIFT.neben}>
          Handlager {position.handlagerBestand} {position.einheit}
        </span>
      </div>
    ),
  };

  const istSpalte: NonNullable<TableProps<SollZeile>["columns"]>[number] = {
    // DER IST STEHT IN EIGENER SPALTE, NICHT IM NEBENTEXT (DRK-315). Dort
    // war er 12px grau und von der Handlager-Zahl daneben nur am Wort zu
    // unterscheiden. Gross gesetzt und neben dem Soll lesen sich beide
    // als Paar: IST ist Zahl, SOLL ist Vorgabe. Keine Farbe fuer die
    // Abweichung — Rot gehoert nicht auf eine Datenflaeche (Falle 3).
    title: "Ist",
    dataIndex: "fahrzeugBestand",
    key: "ist",
    align: "right",
    width: BREITE.ist,
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
  };

  const herkunftSpalte: NonNullable<TableProps<SollZeile>["columns"]>[number] = {
    title: "Herkunft",
    dataIndex: "herkunft",
    key: "herkunft",
    width: BREITE.herkunft,
    render: (herkunft: SollZeile["herkunft"]) => (
      <Chip ton={HERKUNFT_TON[herkunft]}>{herkunft}</Chip>
    ),
  };

  const lesen: TableProps<SollZeile>["columns"] = [
    artikelSpalte,
    istSpalte,
    {
      title: "Soll",
      dataIndex: "soll",
      key: "soll",
      align: "right",
      width: BREITE.soll,
      render: (wert: number, position) => (
        <span
          data-rolle="soll"
          style={{ whiteSpace: "nowrap", opacity: position.entfernt ? 0.6 : undefined }}
        >
          {spiegel[position.id] ?? wert} <span style={SCHRIFT.neben}>{position.einheit}</span>
        </span>
      ),
    },
    herkunftSpalte,
  ];

  const schreiben: TableProps<SollZeile>["columns"] = [
    artikelSpalte,
    istSpalte,
    {
      title: "Soll",
      dataIndex: "soll",
      key: "soll",
      align: "right",
      width: BREITE.soll,
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
          style={{ width: "100%" }}
        />
      ),
    },
    {
      // IDA-223: kommt in jeden Kurzcheck, ausserhalb der Stichprobe.
      title: "Immer zählen",
      dataIndex: "immerZaehlen",
      key: "immerZaehlen",
      align: "center",
      width: BREITE.immerZaehlen,
      render: (wert: boolean, position) => (
        <Checkbox
          checked={pflicht[position.id] ?? wert}
          disabled={position.entfernt}
          onChange={(e) => pflichtGeaendert(position, e.target.checked)}
          aria-label={`${position.artikelName} in jedem Kurzcheck zählen`}
        />
      ),
    },
    herkunftSpalte,
    {
      title: "Aktion",
      dataIndex: "id",
      key: "aktion",
      width: BREITE.aktion,
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
          {/* KEIN `danger`: Rot ist in diesem Modul fachlich belegt (Falle 3),
              und das Entfernen fragt ohnehin noch einmal nach. */}
          <Button
            loading={laeuft}
            icon={<Ikone name="papierkorb" groesse={14} />}
            aria-label={`${position.artikelName} aus Fach ${position.fachLabel} entfernen`}
          />
        </Popconfirm>
      ),
    },
  ];

  const spalten = bearbeiten ? schreiben : lesen;
  const breite = BREITE.artikelMindestens + (bearbeiten
    ? BREITE.ist + BREITE.soll + BREITE.immerZaehlen + BREITE.herkunft + BREITE.aktion
    : BREITE.ist + BREITE.soll + BREITE.herkunft);

  return (
    // `minmax(0, 1fr)` STATT DER IMPLIZITEN `auto`-SPALTE: die waechst auf die
    // Mindestbreite der Tabelle, und `scroll.x` kommt nie zum Zug — gemessen
    // (DRK-315) lief das Fahrzeugblatt bei 390px um 372px waagerecht ueber,
    // statt die Tabelle in sich scrollen zu lassen.
    <div
      data-rolle="soll-bestueckung"
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}
    >
      <Flex gap={SPACE.md} wrap align="center">
        <Suchfeld wert={suche} onWert={setSuche} platzhalter="Artikel oder Fach suchen…" />
        {sichtbareGruppen.length > 1 ? (
          <Button
            onClick={() => setOffeneFaecher(alleOffen ? [] : sichtbareGruppen.map((g) => g.fach))}
            icon={<Ikone name={alleOffen ? "zuklappen" : "aufklappen"} groesse={16} />}
          >
            {alleOffen ? "Alle zuklappen" : "Alle aufklappen"}
          </Button>
        ) : null}
        {/* Die Beschriftung umschliesst den Schalter: ein Tippen auf das Wort
            schaltet mit, und der Name des Schalters ist das sichtbare Wort. */}
        <label style={{ display: "inline-flex", alignItems: "center", gap: SPACE.sm, minHeight: 44 }}>
          <Switch checked={bearbeiten} onChange={bearbeitenUmschalten} />
          Bearbeiten
        </label>
        <Button
          icon={<Ikone name="plus" groesse={16} />}
          onClick={() => setNeuOffen(true)}
          disabled={neuOffen}
        >
          Position hinzufügen
        </Button>
      </Flex>

      {neuOffen ? (
        <div
          data-rolle="neue-position"
          style={{
            display: "grid",
            gap: SPACE.sm,
            padding: SPACE.md,
            border: "1px solid var(--iuk-linie)",
            borderRadius: 6,
          }}
        >
          <span style={SCHRIFT.feldname}>Neue Position</span>
          <Flex gap={SPACE.sm} wrap align="center">
            {/* Ein bestehendes Fach steht zur Wahl, ein neues lässt sich
                tippen — so entsteht kein zweites Fach aus einem Tippfehler. */}
            <AutoComplete
              placeholder="Fach"
              aria-label="Fach"
              value={neuFach}
              onChange={(wert: string) => setNeuFach(wert)}
              options={fachOptionen}
              filterOption={(eingabe, option) => String(option?.value ?? "")
                .toLocaleLowerCase("de")
                .includes(eingabe.trim().toLocaleLowerCase("de"))}
              style={{ minWidth: 200 }}
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
              onClick={hinzufuegen}
            >
              Hinzufügen
            </Button>
            <Button onClick={() => setNeuOffen(false)}>Schließen</Button>
          </Flex>
        </div>
      ) : null}

      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      {gruppen.length === 0 ? (
        <p style={{ ...SCHRIFT.neben, margin: 0 }}>
          Noch keine Soll-Position. Lege oben die erste an.
        </p>
      ) : sichtbareGruppen.length === 0 ? (
        <p style={{ ...SCHRIFT.neben, margin: 0 }}>Keine Soll-Position passt zur Suche.</p>
      ) : (
        <Collapse
          activeKey={offeneFaecher}
          onChange={(schluessel) => setOffeneFaecher(
            Array.isArray(schluessel) ? schluessel.map(String) : [String(schluessel)],
          )}
          items={sichtbareGruppen.map((gruppe) => ({
            key: gruppe.fach,
            label: <strong data-rolle="fachkopf">{gruppe.fach}</strong>,
            extra: <span style={SCHRIFT.neben}>{zaehltext(gruppe)}</span>,
            children: (
              <Kartentabelle<SollZeile>
                rowKey="id"
                aria-label={`Soll-Bestückung ${gruppe.fach}`}
                dataSource={gruppe.positionen}
                tableLayout="fixed"
                scroll={{ x: breite }}
                karte={{ titel: "artikel" }}
                kartenHoehe={bearbeiten ? 260 : 170}
                leer={{ nichts: "Keine Position in diesem Fach." }}
                columns={spalten}
              />
            ),
          }))}
        />
      )}
    </div>
  );
}
