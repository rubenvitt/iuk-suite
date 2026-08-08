"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Dayjs } from "dayjs";
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
} from "antd";
import { updateArtikel, setArtikelAktiv } from "../_actions/artikel";
import { bucheEntnahme, bucheZugang } from "../_actions/buchung";
import {
  getDetail,
  type ArtikelDetailBuchung,
  type ArtikelDetailCharge,
  type ArtikelDetailResult,
} from "../_actions/detail";
import {
  deaktiviereElement,
  loescheElement,
  pruefeLoeschbar,
} from "../_actions/loeschen";
import { ampelTon, fmtVerfall } from "../_lib/format";
import { journalZeile } from "../_lib/journalZeile";
import { SCHRIFT } from "../_lib/schrift";
import { fmtTs } from "../_lib/zeit";
import { Chip } from "./Chip";
import { LoeschButton } from "./LoeschButton";
import { monatAusPicker } from "./monat";
import { Plakette } from "./Plakette";
import styles from "./verwaltung.module.css";

export const NEUE_CHARGE = "__neu__";
const MINDEST_DEBOUNCE_MS = 400;

type SuchOption = {
  label?: ReactNode;
  keywords?: string;
};

/** Gemeinsame Suche fuer Charge und Fahrzeug: sichtbarer Text plus Kennung. */
export function zielFilter(eingabe: string, option?: SuchOption): boolean {
  const nadel = eingabe.trim().toLocaleLowerCase("de");
  const label = typeof option?.label === "string" ? option.label : "";
  const text = `${label} ${option?.keywords ?? ""}`.toLocaleLowerCase("de");
  return text.includes(nadel);
}

type Fahrzeug = {
  id: string;
  name: string;
  kennung: string | null;
};

type ArtikelDrawerProps = {
  id: string;
  onSchliessen: () => void;
  fahrzeuge: Fahrzeug[];
};

type ZugangWerte = {
  menge: number;
  chargeId: string;
  chargenNr?: string;
  verfall?: Dayjs | null;
};

type EntnahmeWerte = {
  menge: number;
  zielLagerortId?: string;
  kommentar?: string;
};

type ArtikelPatch = Partial<{
  mindestbestand: number;
  fach: string;
  einheit: string;
}>;

export function ArtikelDrawer({ id, onSchliessen, fahrzeuge }: ArtikelDrawerProps) {
  const [detail, setDetail] = useState<ArtikelDetailResult>();
  /**
   * Die Meldung traegt ihre HERKUNFT, weil der Drawer lang ist.
   *
   * Ein Fehler aus „Entnahme buchen" stand bisher als einziger Kanal ganz oben
   * im Drawer — rund 700px ueber dem Knopf, hinter Kopf, Stammdaten und dem
   * ganzen Abschnitt „Zugang buchen", und es wird nicht dorthin gescrollt. Auf
   * einem schmalen Geraet sieht es aus, als reagiere der Knopf nicht, und der
   * Vorgang wird wiederholt. Formularfehler gehoeren deshalb an ihr Formular;
   * alles Uebrige (Laden, Stammdaten, Loeschen) bleibt oben.
   */
  const [meldung, setMeldung] = useState<
    { text: string; quelle: "allgemein" | "zugang" | "entnahme" } | null
  >(null);
  function setFehler(
    text: string | null,
    quelle: "allgemein" | "zugang" | "entnahme" = "allgemein",
  ): void {
    setMeldung(text === null ? null : { text, quelle });
  }

  const [busy, setBusy] = useState(false);
  const [mindestbestand, setMindestbestand] = useState<number | null>(null);
  const [fach, setFach] = useState("");
  const [einheit, setEinheit] = useState("");
  const [loeschDialogGeneration, setLoeschDialogGeneration] = useState(0);
  const mindestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ladeGeneration = useRef(0);
  const mutationsKette = useRef<Promise<void>>(Promise.resolve());
  const offeneMutationen = useRef(0);
  const [zugangForm] = Form.useForm<ZugangWerte>();
  const [entnahmeForm] = Form.useForm<EntnahmeWerte>();
  const ausgewaehlteCharge =
    Form.useWatch("chargeId", zugangForm) ?? NEUE_CHARGE;

  const laden = useCallback(async (): Promise<boolean> => {
    const generation = ++ladeGeneration.current;
    try {
      const ergebnis = await getDetail(id);
      if (generation !== ladeGeneration.current) return false;
      if (!ergebnis.ok) {
        setFehler(ergebnis.fehler);
        return false;
      }
      setDetail(ergebnis.wert);
      // Nach der Initialladung bleiben die drei Stammdaten lokale Spiegel.
      // Ein Reload darf keine neuere Eingabe ueberschreiben, waehrend der
      // vorherige Auto-Commit noch laeuft (Falle 45).
      return true;
    } catch {
      if (generation === ladeGeneration.current) {
        setFehler("Artikeldetails konnten nicht geladen werden.");
      }
      return false;
    }
  }, [id]);

  useEffect(() => {
    let verworfen = false;
    const generation = ++ladeGeneration.current;
    void getDetail(id).then(
      (ergebnis) => {
        if (verworfen || generation !== ladeGeneration.current) return;
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        setDetail(ergebnis.wert);
        setMindestbestand(ergebnis.wert.artikel.mindestbestand);
        setFach(ergebnis.wert.artikel.fach);
        setEinheit(ergebnis.wert.artikel.einheit);
        setFehler(null);
      },
      () => {
        if (!verworfen && generation === ladeGeneration.current) {
          setFehler("Artikeldetails konnten nicht geladen werden.");
        }
      },
    );
    return () => {
      verworfen = true;
    };
  }, [id]);

  useEffect(() => () => {
    if (mindestTimer.current) clearTimeout(mindestTimer.current);
  }, []);

  function mutationSerialisieren(arbeit: () => Promise<void>): Promise<void> {
    offeneMutationen.current += 1;
    setBusy(true);
    const ausfuehrung = mutationsKette.current.then(arbeit, arbeit);
    mutationsKette.current = ausfuehrung.then(
      () => undefined,
      () => undefined,
    );
    return ausfuehrung.finally(() => {
      offeneMutationen.current -= 1;
      if (offeneMutationen.current === 0) setBusy(false);
    });
  }

  function loeschActionAbweisen(aktionsFehler: string): never {
    // LoeschDialog unterscheidet absichtlich nur Erfolg und Runtime-Fehler.
    // Ein erwarteter ActionErgebnis-Fehler gehoert dagegen unveraendert in
    // den Drawer. Der neue key schliesst den alten Dialog, ohne onFertig und
    // damit ohne den Artikel-Drawer zu schliessen.
    setFehler(aktionsFehler);
    setLoeschDialogGeneration((generation) => generation + 1);
    throw new Error("Die Löschaktion ist fachlich fehlgeschlagen.");
  }

  function artikelFeldSpeichern(aenderung: ArtikelPatch): Promise<void> {
    return mutationSerialisieren(async () => {
      setFehler(null);
      try {
        const ergebnis = await updateArtikel(id, aenderung);
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        await laden();
      } catch {
        setFehler("Artikeldaten konnten nicht gespeichert werden.");
      }
    });
  }

  function mindestbestandAendern(wert: number | null): void {
    setMindestbestand(wert);
    if (mindestTimer.current) {
      clearTimeout(mindestTimer.current);
      mindestTimer.current = null;
    }
    if (wert === null) return;
    mindestTimer.current = setTimeout(() => {
      mindestTimer.current = null;
      void artikelFeldSpeichern({ mindestbestand: wert });
    }, MINDEST_DEBOUNCE_MS);
  }

  /** Zieht einen ausstehenden Mindestbestand-Commit vor (siehe `onBlur`). */
  function mindestbestandSpeichern(): void {
    if (!mindestTimer.current) return;
    clearTimeout(mindestTimer.current);
    mindestTimer.current = null;
    if (mindestbestand === null) return;
    void artikelFeldSpeichern({ mindestbestand });
  }

  function fachSpeichern(): void {
    const wert = fach.trim();
    if (wert && wert !== detail?.artikel.fach) {
      setFach(wert);
      void artikelFeldSpeichern({ fach: wert });
    }
  }

  function einheitSpeichern(): void {
    const wert = einheit.trim();
    if (wert && wert !== detail?.artikel.einheit) {
      setEinheit(wert);
      void artikelFeldSpeichern({ einheit: wert });
    }
  }

  function aktivAendern(aktiv: boolean): Promise<void> {
    return mutationSerialisieren(async () => {
      setFehler(null);
      try {
        const ergebnis = await setArtikelAktiv({ id, aktiv });
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        await laden();
      } catch {
        setFehler("Artikelstatus konnte nicht gespeichert werden.");
      }
    });
  }

  async function zugangBuchen(werte: ZugangWerte): Promise<void> {
    let eingabe:
      | { artikelId: string; menge: number; chargeId: string }
      | {
        artikelId: string;
        menge: number;
        neueCharge: { chargenNr: string; verfall: string };
      };

    if (werte.chargeId === NEUE_CHARGE) {
      const verfall = monatAusPicker(werte.verfall);
      if (!verfall) {
        setFehler("Bitte einen Verfallsmonat auswählen.", "zugang");
        return;
      }
      eingabe = {
        artikelId: id,
        menge: werte.menge,
        neueCharge: {
          chargenNr: werte.chargenNr?.trim() ?? "",
          verfall,
        },
      };
    } else {
      eingabe = {
        artikelId: id,
        menge: werte.menge,
        chargeId: werte.chargeId,
      };
    }

    await mutationSerialisieren(async () => {
      setFehler(null);
      try {
        const ergebnis = await bucheZugang(eingabe);
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler, "zugang");
          return;
        }
        await laden();
        zugangForm.resetFields();
      } catch {
        setFehler("Zugang konnte nicht gebucht werden.", "zugang");
      }
    });
  }

  async function entnahmeBuchen(werte: EntnahmeWerte): Promise<void> {
    const kommentar = werte.kommentar?.trim();
    const eingabe = {
      artikelId: id,
      menge: werte.menge,
      ...(werte.zielLagerortId
        ? { zielLagerortId: werte.zielLagerortId }
        : {}),
      ...(kommentar ? { kommentar } : {}),
    };

    await mutationSerialisieren(async () => {
      setFehler(null);
      try {
        const ergebnis = await bucheEntnahme(eingabe);
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler, "entnahme");
          return;
        }
        await laden();
        entnahmeForm.resetFields();
      } catch {
        setFehler("Entnahme konnte nicht gebucht werden.", "entnahme");
      }
    });
  }

  const chargeOptionen = detail
    ? [
      { value: NEUE_CHARGE, label: "+ Neue Charge", keywords: "neue Charge" },
      ...detail.chargen.map((charge) => ({
        value: charge.id,
        label: `${charge.chargenNr} · ${fmtVerfall(charge.verfall)} · Rest ${charge.rest}`,
        keywords: charge.chargenNr,
      })),
    ]
    : [];

  const fahrzeugOptionen = fahrzeuge.map((fahrzeug) => ({
    value: fahrzeug.id,
    label: fahrzeug.name,
    keywords: `${fahrzeug.name} ${fahrzeug.kennung ?? ""}`,
  }));

  return (
    <Drawer
      open
      onClose={onSchliessen}
      title={detail?.artikel.name ?? "Artikeldetails"}
      size={520}
      rootClassName={styles.modul}
      destroyOnHidden
    >
      {meldung?.quelle === "allgemein" ? (
        <Alert
          type="warning"
          showIcon={false}
          title={meldung.text}
          style={{ marginBlockEnd: 16 }}
        />
      ) : null}

      {!detail ? (
        <div style={SCHRIFT.neben}>Artikeldetails werden geladen …</div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          <ArtikelKopf
            detail={detail}
            mindestbestand={mindestbestand ?? detail.artikel.mindestbestand}
          />

          {!detail.artikel.aktiv ? (
            <Alert
              type="info"
              showIcon={false}
              title="Dieser Artikel ist deaktiviert und erscheint nicht in den aktiven Listen."
            />
          ) : null}

          <Abschnitt titel="Stammdaten">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <div style={SCHRIFT.feldname}>Mindestbestand</div>
                <div data-rolle="mindestbestand">
                  <InputNumber
                    min={0}
                    precision={0}
                    value={mindestbestand}
                    onChange={mindestbestandAendern}
                    // Zieht den entprellten Schreibvorgang beim Verlassen des
                    // Feldes vor. Ohne das verliert ein Schliessen des Drawers
                    // innerhalb der Entprellzeit die Aenderung stillschweigend
                    // — der Aufraeumer loescht den Timer, ohne ihn
                    // auszufuehren. `fach` und `einheit` daneben tun es schon.
                    onBlur={mindestbestandSpeichern}
                    aria-label="Mindestbestand"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              <div>
                <div style={SCHRIFT.feldname}>Fach im Handlager</div>
                <Input
                  value={fach}
                  onChange={(ereignis) => setFach(ereignis.target.value.toUpperCase())}
                  onBlur={fachSpeichern}
                  aria-label="Fach im Handlager"
                />
              </div>
              <div>
                <div style={SCHRIFT.feldname}>Einheit</div>
                <Input
                  value={einheit}
                  onChange={(ereignis) => setEinheit(ereignis.target.value)}
                  onBlur={einheitSpeichern}
                  aria-label="Einheit"
                />
              </div>
              <div>
                <div style={SCHRIFT.feldname}>Aktiv</div>
                <Switch
                  checked={detail.artikel.aktiv}
                  loading={busy}
                  onChange={(aktiv) => { void aktivAendern(aktiv); }}
                  aria-label="Artikel aktiv"
                />
              </div>
            </div>
          </Abschnitt>

          <Abschnitt titel="Zugang buchen">
            <Form<ZugangWerte>
              form={zugangForm}
              layout="vertical"
              disabled={busy}
              initialValues={{ menge: 1, chargeId: NEUE_CHARGE }}
              onFinish={(werte) => { void zugangBuchen(werte); }}
              data-rolle="zugang-form"
            >
              <Form.Item
                name="menge"
                label="Menge"
                rules={[{ required: true }, { type: "number", min: 1 }]}
              >
                <InputNumber
                  min={1}
                  precision={0}
                  aria-label="Zugangsmenge"
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item name="chargeId" label="Charge" rules={[{ required: true }]}>
                <Select
                  aria-label="Charge"
                  showSearch
                  filterOption={zielFilter}
                  options={chargeOptionen}
                  virtual={false}
                />
              </Form.Item>
              {ausgewaehlteCharge === NEUE_CHARGE ? (
                <>
                  <Form.Item
                    name="chargenNr"
                    label="Chargennummer"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input aria-label="Chargennummer" autoComplete="off" />
                  </Form.Item>
                  <Form.Item label="Verfallsmonat">
                    <div data-rolle="verfallsmonat">
                      <Form.Item
                        name="verfall"
                        noStyle
                        rules={[{ required: true, message: "Bitte Verfallsmonat auswählen." }]}
                      >
                        <DatePicker
                          picker="month"
                          format="YYYY-MM"
                          aria-label="Verfallsmonat"
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </div>
                  </Form.Item>
                </>
              ) : null}
              {meldung?.quelle === "zugang" ? (
                <Alert
                  type="warning"
                  showIcon={false}
                  title={meldung.text}
                  style={{ marginBlockEnd: 12 }}
                />
              ) : null}
              <Button type="primary" htmlType="submit" loading={busy}>
                Zugang buchen
              </Button>
            </Form>
          </Abschnitt>

          <Abschnitt titel="Entnahme buchen">
            <Form<EntnahmeWerte>
              form={entnahmeForm}
              layout="vertical"
              disabled={busy}
              initialValues={{ menge: 1 }}
              onFinish={(werte) => { void entnahmeBuchen(werte); }}
              data-rolle="entnahme-form"
            >
              <Form.Item
                name="menge"
                label="Menge"
                rules={[{ required: true }, { type: "number", min: 1 }]}
              >
                <InputNumber
                  min={1}
                  precision={0}
                  aria-label="Entnahmemenge"
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item name="zielLagerortId" label="Ziel-Fahrzeug">
                <Select
                  aria-label="Ziel-Fahrzeug"
                  placeholder="Handlager (Verbrauch)"
                  allowClear
                  showSearch
                  filterOption={zielFilter}
                  options={fahrzeugOptionen}
                  virtual={false}
                />
              </Form.Item>
              <Form.Item name="kommentar" label="Kommentar">
                <Input.TextArea
                  aria-label="Entnahmekommentar"
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
              </Form.Item>
              {meldung?.quelle === "entnahme" ? (
                <Alert
                  type="warning"
                  showIcon={false}
                  title={meldung.text}
                  style={{ marginBlockEnd: 12 }}
                />
              ) : null}
              <Button
                type="primary"
                htmlType="submit"
                loading={busy}
                disabled={detail.artikel.bestand === 0}
              >
                Entnahme buchen
              </Button>
            </Form>
          </Abschnitt>

          <ChargenTabelle
            chargen={detail.chargen}
            einheit={detail.artikel.einheit}
          />
          <HistorieTabelle
            historie={detail.historie}
            mehrVorhanden={detail.mehrVorhanden}
          />

          <section className={styles.gefahr}>
            <div className={styles.gtitle}>Gefahrenzone</div>
            <p style={SCHRIFT.text}>
              Artikel deaktivieren oder – wenn keine Nachweise verknüpft sind – endgültig löschen.
            </p>
            <LoeschButton
              key={loeschDialogGeneration}
              name={detail.artikel.name}
              typLabel="Artikel"
              pruefen={async () => {
                const ergebnis = await pruefeLoeschbar("artikel", id);
                if (!ergebnis.ok) {
                  return {
                    loeschbar: false,
                    grund: ergebnis.fehler,
                    kannDeaktivieren: false,
                  };
                }
                return ergebnis.wert;
              }}
              onLoeschen={async () => {
                setFehler(null);
                const ergebnis = await loescheElement("artikel", id);
                if (!ergebnis.ok) loeschActionAbweisen(ergebnis.fehler);
              }}
              onDeaktivieren={async () => {
                setFehler(null);
                const ergebnis = await deaktiviereElement("artikel", id);
                if (!ergebnis.ok) loeschActionAbweisen(ergebnis.fehler);
              }}
              onFertig={onSchliessen}
            />
          </section>
        </div>
      )}
    </Drawer>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid var(--lb-linie)",
        borderRadius: 6,
        padding: 16,
        background: "var(--lb-karte)",
      }}
    >
      <h3 style={{ ...SCHRIFT.abschnitt, marginBlock: "0 14px" }}>{titel}</h3>
      {children}
    </section>
  );
}

function ArtikelKopf({
  detail,
  mindestbestand,
}: {
  detail: ArtikelDetailResult;
  mindestbestand: number;
}) {
  const unterMindest = detail.artikel.bestand < mindestbestand;
  const faelligeCharge = detail.chargen.find((charge) => charge.ampel !== "gruen");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={SCHRIFT.zahl}>
        Bestand {detail.artikel.bestand} {detail.artikel.einheit}
      </div>
      <Space wrap>
        {!detail.artikel.aktiv ? <Chip ton="grau">inaktiv</Chip> : null}
        {detail.artikel.aktiv && !unterMindest && !faelligeCharge ? (
          <Chip ton="ok">ok</Chip>
        ) : null}
        {unterMindest ? <Chip ton="rot">unter Mindestbestand</Chip> : null}
        {faelligeCharge ? (
          <Chip ton={ampelTon(faelligeCharge.ampel)}>
            Charge {faelligeCharge.text}
          </Chip>
        ) : null}
      </Space>
    </div>
  );
}

function ChargenTabelle({
  chargen,
  einheit,
}: {
  chargen: ArtikelDetailCharge[];
  einheit: string;
}) {
  return (
    <Abschnitt titel="Chargen · älteste zuerst (FEFO)">
      <Table<ArtikelDetailCharge>
        aria-label="Chargen"
        rowKey="id"
        dataSource={chargen}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "Keine Chargen im Bestand." }}
        columns={[
          {
            title: "Verfall",
            key: "verfall",
            render: (_, charge) => (
              <Space>
                <Plakette
                  verfall={charge.verfall}
                  ampel={charge.ampel}
                  statusText={charge.text}
                />
                <Chip ton={ampelTon(charge.ampel)}>{charge.text}</Chip>
              </Space>
            ),
          },
          { title: "Charge", dataIndex: "chargenNr", key: "chargenNr" },
          {
            title: "Rest",
            dataIndex: "rest",
            key: "rest",
            align: "right",
            render: (rest: number) => `${rest} ${einheit}`,
          },
        ]}
      />
    </Abschnitt>
  );
}

function HistorieTabelle({
  historie,
  mehrVorhanden,
}: {
  historie: ArtikelDetailBuchung[];
  mehrVorhanden: boolean;
}) {
  return (
    <Abschnitt titel="Letzte Buchungen">
      <Table<ArtikelDetailBuchung>
        aria-label="Buchungshistorie des Artikels"
        rowKey="id"
        dataSource={historie}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "Noch keine Buchungen." }}
        columns={[
          {
            title: "Zeit",
            dataIndex: "ts",
            key: "ts",
            render: (ts: Date) => <span className={styles.jts}>{fmtTs(ts)}</span>,
          },
          {
            title: "Buchung",
            key: "typ",
            render: (_, buchung) => {
              const zeile = journalZeile(buchung);
              return buchung.kommentar
                ? `${zeile.typText} · ${buchung.kommentar}`
                : zeile.typText;
            },
          },
          { title: "Quelle", dataIndex: "quelleName", key: "quelleName" },
          {
            title: "Menge",
            key: "menge",
            align: "right",
            render: (_, buchung) => {
              const zeile = journalZeile(buchung);
              const farbe = zeile.zustand === "negativ"
                ? styles.jminus
                : zeile.zustand === "positiv"
                  ? styles.jplus
                  : "";
              return (
                <span className={`${styles.jdelta} ${farbe}`}>
                  {zeile.mengeText}
                </span>
              );
            },
          },
        ]}
      />
      {mehrVorhanden ? (
        <div className={styles.footnote} style={{ marginBlockStart: 10 }}>
          Es werden nur die neuesten Buchungen angezeigt.
        </div>
      ) : null}
    </Abschnitt>
  );
}
