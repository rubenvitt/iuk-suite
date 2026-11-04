"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { App, Button, Card, Input, InputNumber, Popconfirm, Radio, Select, Switch } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { lagekarteAendernAction, lagekarteAnlegenAction, lagekarteLoeschenAction, lagekarteSchaltenAction, lagekarteZeichenAction } from "../_actions/verwaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import { farbe as farbeAus, FARBEN, type Farbe } from "../_lib/kategorieRegeln";
import { ECKEN_MAX, ECKEN_MIN, LAGEKARTE_MAX, LAGEKARTE_NAME_MAX, lagenVon, umriss, type Art, type Lage, type LagekarteEingabe, type LagekarteObjektDTO } from "../_lib/lagekarteRegeln";
import type { Hintergrund, Start } from "./LagekarteKarte";
import v from "./verwaltung.module.css";

/** maplibre erst im Browser und erst, wenn jemand ein Objekt bearbeitet (Falle 7 gilt sinngemäß: kein `window` auf dem Server). */
const LagekarteKarte = dynamic(() => import("./LagekarteKarte"), { ssr: false, loading: () => <div className={v.karte} /> });

type Bearbeitet = { neu: Art } | { id: string } | null;

/**
 * Die Lagekarte (IDA-348): feste Punkte und Flächen, die alle Lagemonitore zeigen. Liste mit Schalter je Objekt,
 * darunter das Formular mit der Karte. Nur serialisierbare Props, die Actions direkt importiert (Falle 9).
 */
export function Lagekarte({ liste, zeichen, standort }: { liste: LagekarteObjektDTO[]; zeichen: { schluessel: string; titel: string }[]; standort: Lage }) {
  const { message } = App.useApp();
  const [bearbeitet, setBearbeitet] = useState<Bearbeitet>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);

  function schalten(o: LagekarteObjektDTO, an: boolean): void {
    setLaeuft(o.id);
    void lagekarteSchaltenAction(o.id, an)
      .then((r) => {
        if (!r.ok) void message.warning(r.fehler);
      })
      .catch(() => void message.warning("Umschalten ist fehlgeschlagen. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  function loeschen(o: LagekarteObjektDTO): void {
    setLaeuft(o.id);
    void lagekarteLoeschenAction(o.id)
      .then((r) => {
        if (!r.ok) void message.warning(r.fehler);
        else if (bearbeitet && "id" in bearbeitet && bearbeitet.id === o.id) setBearbeitet(null);
      })
      .catch(() => void message.warning("Löschen ist fehlgeschlagen. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  const formular = (objekt: LagekarteObjektDTO | null, art: Art) => (
    <LagekarteFormular
      key={objekt?.id ?? `neu-${art}`}
      objekt={objekt}
      art={art}
      alle={liste}
      zeichen={zeichen}
      standort={standort}
      onFertig={() => setBearbeitet(null)}
    />
  );
  const voll = liste.length >= LAGEKARTE_MAX;

  return (
    <Card title="Lagekarte">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
        {liste.length === 0 ? (
          <span>Noch nichts auf der Lagekarte.</span>
        ) : (
          <ul className={v.lagekarteListe} aria-label="Objekte der Lagekarte">
            {liste.map((o) => {
              const offen = bearbeitet !== null && "id" in bearbeitet && bearbeitet.id === o.id;
              return (
                <li key={o.id} data-lagekarte-id={o.id}>
                  <div className={v.lagekarteZeile}>
                    <span className={v.lagekarteZeichen} aria-hidden>
                      {o.art === "punkt" ? (
                        o.svg ? (
                          // eslint-disable-next-line @next/next/no-img-element -- ein Data-URI-SVG, kein Bild aus dem Netz
                          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(o.svg)}`} alt="" width={32} height={32} />
                        ) : null
                      ) : (
                        <span className={v.lagekarteFlaeche} style={{ "--kategorie": farbeAus(o.farbe ?? "grau").ton } as CSSProperties} />
                      )}
                    </span>
                    <div>
                      <strong>{o.name}</strong>
                      <div style={SCHRIFT.neben} className={v.gedaempft}>
                        {o.art === "punkt"
                          ? `Punkt · ${o.zeichenTitel ?? "kein Zeichen"}`
                          : `Fläche · ${farbeAus(o.farbe ?? "grau").text} · ${o.ring?.length ?? 0} Eckpunkte`}
                      </div>
                    </div>
                  </div>
                  <div className={v.lagekarteAktionen}>
                    <Switch
                      checked={o.aufKarte}
                      loading={laeuft === o.id}
                      aria-label={`Auf der Karte: ${o.name}`}
                      onChange={(an) => schalten(o, an)}
                    />
                    <Button aria-expanded={offen} aria-label={`Bearbeiten: ${o.name}`} onClick={() => setBearbeitet(offen ? null : { id: o.id })}>
                      Bearbeiten
                    </Button>
                    <Popconfirm title={`„${o.name}“ löschen?`} okText="Löschen" cancelText="Abbrechen" onConfirm={() => loeschen(o)}>
                      <Button aria-label={`Löschen: ${o.name}`}>Löschen</Button>
                    </Popconfirm>
                  </div>
                  {offen ? <div style={{ flex: "1 1 100%", minInlineSize: 0 }}>{formular(o, o.art)}</div> : null}
                </li>
              );
            })}
          </ul>
        )}

        {bearbeitet && "neu" in bearbeitet ? formular(null, bearbeitet.neu) : null}

        <div className={v.lagekarteAktionen}>
          <Button disabled={voll} aria-expanded={bearbeitet !== null && "neu" in bearbeitet && bearbeitet.neu === "punkt"} onClick={() => setBearbeitet({ neu: "punkt" })}>
            Neuer Punkt
          </Button>
          <Button disabled={voll} aria-expanded={bearbeitet !== null && "neu" in bearbeitet && bearbeitet.neu === "flaeche"} onClick={() => setBearbeitet({ neu: "flaeche" })}>
            Neue Fläche
          </Button>
          {voll ? <span style={SCHRIFT.neben} className={v.gedaempft}>{`Höchstens ${LAGEKARTE_MAX} Objekte`}</span> : null}
        </div>
      </div>
    </Card>
  );
}

/** Startausschnitt: das bearbeitete Objekt, sonst alle Objekte, sonst der Standort der Monitore. */
function startFuer(objekt: LagekarteObjektDTO | null, alle: LagekarteObjektDTO[], standort: Lage): Start {
  const eigene = objekt ? lagenVon(objekt) : [];
  const r = umriss(eigene.length > 0 ? eigene : alle.flatMap(lagenVon));
  return { umriss: r, mitte: standort, zoom: 13 };
}

function LagekarteFormular({
  objekt,
  art: startArt,
  alle,
  zeichen,
  standort,
  onFertig,
}: {
  objekt: LagekarteObjektDTO | null;
  art: Art;
  alle: LagekarteObjektDTO[];
  zeichen: { schluessel: string; titel: string }[];
  standort: Lage;
  onFertig: () => void;
}) {
  const basis = useId();
  const [art, setArt] = useState<Art>(startArt);
  const [name, setName] = useState(objekt?.name ?? "");
  const [zeichenWahl, setZeichenWahl] = useState<string | null>(objekt?.zeichen ?? null);
  const [farbe, setFarbe] = useState<Farbe>(objekt?.farbe ?? "blau");
  const [breite, setBreite] = useState<number | null>(objekt?.art === "punkt" ? objekt.breite : null);
  const [laenge, setLaenge] = useState<number | null>(objekt?.art === "punkt" ? objekt.laenge : null);
  const [ecken, setEcken] = useState<Lage[]>(objekt?.ring ?? []);
  const [geschlossen, setGeschlossen] = useState(objekt?.art === "flaeche" && (objekt.ring?.length ?? 0) >= ECKEN_MIN);
  const [aufKarte, setAufKarte] = useState(objekt?.aufKarte ?? true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  // Fest beim Öffnen: sonst sprünge die Karte bei jeder Änderung an einem anderen Objekt.
  const [start] = useState(() => startFuer(objekt, alle, standort));

  const andere = useMemo<Hintergrund[]>(
    () => alle.filter((o) => o.id !== objekt?.id).map((o) => ({ id: o.id, art: o.art, name: o.name, breite: o.breite, laenge: o.laenge, ring: o.ring })),
    [alle, objekt?.id],
  );
  // Das Bild des gewählten Zeichens holt erst die Auswahl; beim Bearbeiten steht das bisherige schon da.
  const [bilder, setBilder] = useState<Record<string, string | null>>(() => (objekt?.zeichen ? { [objekt.zeichen]: objekt.svg } : {}));
  useEffect(() => {
    if (!zeichenWahl || zeichenWahl in bilder) return;
    let aktuell = true;
    void lagekarteZeichenAction(zeichenWahl)
      .then((s) => {
        if (aktuell) setBilder((b) => ({ ...b, [zeichenWahl]: s }));
      })
      .catch(() => undefined);
    return () => {
      aktuell = false;
    };
  }, [zeichenWahl, bilder]);
  const svg = zeichenWahl ? (bilder[zeichenWahl] ?? null) : null;
  const punkt: Lage | null = breite !== null && laenge !== null ? [laenge, breite] : null;
  const titel = objekt ? `„${objekt.name}“ bearbeiten` : art === "punkt" ? "Neuer Punkt" : "Neue Fläche";

  function speichern(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setFehler(null);
    setFeldFehler({});
    setLaeuft(true);
    const eingabe: LagekarteEingabe = art === "punkt"
      ? { art, name, zeichen: zeichenWahl ?? "", breite: breite as number, laenge: laenge as number, aufKarte }
      : { art, name, farbe, ring: ecken, aufKarte };
    void (objekt ? lagekarteAendernAction(objekt.id, eingabe) : lagekarteAnlegenAction(eingabe))
      .then((r) => {
        if (r.ok) return onFertig();
        setFehler(r.fehler);
        setFeldFehler(r.feldFehler ?? {});
      })
      .catch(() => setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(false));
  }

  const zahl = (feld: "breite" | "laenge", label: string, wert: number | null, setze: (w: number | null) => void) => (
    <Feld id={`${basis}-${feld}`} label={label} fehler={feldFehler[feld]}>
      <InputNumber
        id={`${basis}-${feld}`}
        value={wert}
        step={0.0001}
        controls={false}
        decimalSeparator=","
        style={{ width: "100%" }}
        status={feldFehler[feld] ? "error" : undefined}
        onChange={(w) => setze(typeof w === "number" ? w : null)}
      />
    </Feld>
  );
  const ringFehler = feldFehler.ring ?? Object.entries(feldFehler).find(([k]) => k.startsWith("ring."))?.[1];

  return (
    <form onSubmit={speichern} className={v.lagekarteFormular} aria-label={titel}>
      <strong style={SCHRIFT.kicker}>{titel}</strong>
      <Radio.Group
        aria-label="Art"
        value={art}
        optionType="button"
        onChange={(x) => setArt(x.target.value as Art)}
        options={[
          { value: "punkt", label: "Punkt" },
          { value: "flaeche", label: "Fläche" },
        ]}
      />
      <Feld id={`${basis}-name`} label="Name" fehler={feldFehler.name}>
        <Input id={`${basis}-name`} value={name} maxLength={LAGEKARTE_NAME_MAX} status={feldFehler.name ? "error" : undefined} onChange={(x) => setName(x.target.value)} />
      </Feld>
      {art === "punkt" ? (
        <Feld id={`${basis}-zeichen`} label="Taktisches Zeichen" fehler={feldFehler.zeichen}>
          <Select
            id={`${basis}-zeichen`}
            value={zeichenWahl}
            onChange={setZeichenWahl}
            showSearch={{ optionFilterProp: "label" }}
            options={zeichen.map((z) => ({ value: z.schluessel, label: z.titel }))}
            status={feldFehler.zeichen ? "error" : undefined}
            style={{ width: "100%" }}
          />
        </Feld>
      ) : (
        <div style={{ display: "grid", gap: SPACE.xs }}>
          <span style={SCHRIFT.neben} id={`${basis}-farbe`}>
            Farbe
          </span>
          <Radio.Group
            aria-labelledby={`${basis}-farbe`}
            value={farbe}
            optionType="button"
            onChange={(x) => setFarbe(x.target.value as Farbe)}
            options={FARBEN.map((f) => ({
              value: f.wert,
              label: (
                <>
                  <span className={v.farbfeld} style={{ "--kategorie": f.ton } as CSSProperties} aria-hidden />
                  {f.text}
                </>
              ),
            }))}
          />
        </div>
      )}

      <LagekarteKarte
        art={art}
        farbe={farbe}
        svg={svg}
        punkt={punkt}
        ecken={ecken}
        geschlossen={geschlossen}
        andere={andere}
        start={start}
        onPunkt={([x, y]) => {
          setLaenge(x);
          setBreite(y);
        }}
        onEcken={setEcken}
      />

      {art === "punkt" ? (
        <div className={v.standortKoordinaten}>
          {zahl("breite", "Breitengrad", breite, setBreite)}
          {zahl("laenge", "Längengrad", laenge, setLaenge)}
        </div>
      ) : (
        <div style={{ display: "grid", gap: SPACE.xs }}>
          <div className={v.lagekarteAktionen}>
            <Button
              disabled={ecken.length === 0}
              onClick={() => {
                setEcken(ecken.slice(0, -1));
                setGeschlossen(false);
              }}
            >
              Letzten Punkt entfernen
            </Button>
            <Button disabled={ecken.length < ECKEN_MIN && !geschlossen} onClick={() => setGeschlossen(!geschlossen)}>
              {geschlossen ? "Weiter zeichnen" : "Fläche schließen"}
            </Button>
            <span style={SCHRIFT.neben} className={v.gedaempft} role="status" data-testid="lagekarte-ecken">
              {`${ecken.length} von ${ECKEN_MAX} Eckpunkten`}
            </span>
          </div>
          {ringFehler ? <div style={SCHRIFT.neben}>{ringFehler}</div> : null}
        </div>
      )}

      <div className={v.schalter}>
        <Switch id={`${basis}-auf`} checked={aufKarte} onChange={setAufKarte} />
        <label htmlFor={`${basis}-auf`} style={{ fontWeight: 600 }}>
          Auf der Karte
        </label>
      </div>
      {fehler ? <span style={SCHRIFT.neben}>{fehler}</span> : null}
      <div className={v.lagekarteAktionen}>
        <Button htmlType="submit" loading={laeuft}>
          {objekt ? "Speichern" : art === "punkt" ? "Punkt anlegen" : "Fläche anlegen"}
        </Button>
        <Button onClick={onFertig}>Abbrechen</Button>
      </div>
    </form>
  );
}

function Feld({ id, label, fehler, children }: { id: string; label: string; fehler?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
        {label}
      </label>
      {children}
      {fehler ? <div style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>{fehler}</div> : null}
    </div>
  );
}
