"use client";

import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Card, Input, InputNumber, Radio, Switch } from "antd";
import { fingerabdruck } from "@/core/entwurf/ablage";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { anzeigeSpeichernAction } from "../_actions/verwaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import { KARTEN_ZOOM, MITMACHEN_MAX_ZEICHEN, MITMACHEN_TEXT_VORGABE, WARNSCHWELLEN, type KonfigurationDTO, type Mitmachen, type Module, type SuchlageTeile, type Verkehr, type Warnschwelle } from "../_lib/konfiguration";
import type { KategorieDTO } from "../_lib/kategorieRegeln";
import type { MeldungDTO } from "../_lib/meldungRegeln";
import type { FahrzeugAuswahl, FahrzeugDTO } from "../_lib/fahrzeuge";
import type { LagekarteObjektDTO } from "../_lib/lagekarteRegeln";
import type { LinkDTO } from "../_lib/links";
import type { ZugangDTO } from "../_lib/schluessel";
import type { StandortAuswahl, StandortDTO } from "../_lib/standort";
import type { Szenario } from "../_lib/vorschau";
import { Fahrzeuge } from "./Fahrzeuge";
import { Kategorien } from "./Kategorien";
import { Lagekarte } from "./Lagekarte";
import { OeffentlicheLinks } from "./OeffentlicheLinks";
import { bandMeldungen, kartenMitte, useJetzt, vorschauOrtVon } from "./vorschauBand";
import { VorschauSpalte } from "./VorschauSpalte";
import { Zugaenge } from "./Zugaenge";
import { ZumMonitor } from "./ZumMonitor";
import v from "./verwaltung.module.css";

const STAND = zeitFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

interface Zustand {
  kartenZoom: number | null;
  regionArs: string;
  regionName: string;
  warnschwelle: Warnschwelle;
  module: Module;
  suchlage: SuchlageTeile;
  mitmachen: Mitmachen;
  suchlageLink: string;
  suchlageTrennen: boolean;
  verkehr: Verkehr;
  tomtomSchluessel: string;
  tomtomEntfernen: boolean;
}

function zustandAus(k: KonfigurationDTO): Zustand {
  return {
    kartenZoom: k.kartenZoom,
    regionArs: k.regionArs,
    regionName: k.regionName,
    warnschwelle: k.warnschwelle,
    module: { ...k.module },
    suchlage: { ...k.suchlage },
    mitmachen: { ...k.mitmachen },
    suchlageLink: "",
    suchlageTrennen: false,
    verkehr: { ...k.verkehr },
    tomtomSchluessel: "",
    tomtomEntfernen: false,
  };
}

/** Was auf dem Gerät liegen darf: alles außer dem Suchlage-Link und dem TomTom-Schlüssel (IDA-358). */
type Ablage = Omit<Zustand, "suchlageLink" | "tomtomSchluessel">;
function ablageAus(z: Zustand): Ablage {
  const kopie: Partial<Zustand> = { ...z };
  delete kopie.suchlageLink;
  delete kopie.tomtomSchluessel;
  return kopie as Ablage;
}

const MODUL_TEXT: { feld: keyof Omit<Module, "suchlage">; titel: string }[] = [
  { feld: "wetter", titel: "Wetter" },
  { feld: "radar", titel: "Regenradar" },
  { feld: "warngebiete", titel: "Warngebiete auf der Karte" },
  { feld: "warnliste", titel: "Warnungen unter der Schwelle" },
];

const VERKEHR_TEXT: { feld: keyof Verkehr; titel: string }[] = [
  { feld: "fluss", titel: "Verkehrsfluss" },
  { feld: "baustellen", titel: "Baustellen und Sperrungen" },
  { feld: "blitzer", titel: "Feste Blitzer" },
];

const TEIL_TEXT: { feld: keyof SuchlageTeile; titel: string }[] = [
  { feld: "flugspuren", titel: "Flugspuren" },
  { feld: "gebiete", titel: "Suchgebiete" },
  { feld: "drohnenbild", titel: "Drohnenbild" },
];

/**
 * Die Einrichtung des Lagemonitors (seit IDA-396 getrennt von den Meldungen): Formular und daneben die
 * Vorschau, die jede Änderung sofort zeigt —
 * noch vor dem Speichern, mit Beispieldaten. Nur serialisierbare Props, die Actions direkt importiert
 * (Falle 9). Nach dem Speichern kommt der neue Stand über die Props (`revalidatePath`).
 */
export function AnzeigeVerwaltung({
  konfiguration,
  zugaenge,
  meldungen,
  kategorien,
  links,
  online,
  fahrzeuge,
  standorte,
  lagekarte,
}: {
  konfiguration: KonfigurationDTO;
  zugaenge: ZugangDTO[];
  meldungen: MeldungDTO[];
  kategorien: KategorieDTO[];
  links: LinkDTO[];
  online: string | null;
  fahrzeuge: { liste: FahrzeugDTO[]; auswahl: FahrzeugAuswahl };
  standorte: { je: Record<string, StandortDTO>; auswahl: StandortAuswahl };
  lagekarte: { liste: LagekarteObjektDTO[]; zeichen: { schluessel: string; titel: string }[] };
}) {
  const [gespeichert, setGespeichert] = useState(konfiguration);
  const [z, setZ] = useState<Zustand>(() => zustandAus(konfiguration));
  const [szenario, setSzenario] = useState<Szenario>("ruhe");
  const [linkErsetzen, setLinkErsetzen] = useState(false);
  const [schluesselErsetzen, setSchluesselErsetzen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  const [erfolg, setErfolg] = useState(false);
  const basis = useId();
  const jetzt = useJetzt();

  // Kommt ein neuer Stand vom Server (anderer Tab, anderes Gerät), wird er übernommen. Verglichen wird der
  // Inhalt: `revalidatePath` nach Anlegen oder Widerrufen eines Zugangs liefert ein neues, gleiches Objekt.
  if (JSON.stringify(konfiguration) !== JSON.stringify(gespeichert)) {
    setGespeichert(konfiguration);
    setZ(zustandAus(konfiguration));
  }

  const setze = <K extends keyof Zustand>(feld: K, wert: Zustand[K]) => {
    setErfolg(false);
    setZ((alt) => ({ ...alt, [feld]: wert }));
  };
  const geaendert = JSON.stringify(z) !== JSON.stringify(zustandAus(gespeichert));
  /*
   * IDA-358: ungespeicherte Änderungen liegen auf dem Gerät. „Leer" ist der Stand vom Server beim
   * Aufbau: gleicht ein liegender Entwurf ihm (gespeichert, hier oder anderswo), fällt er weg.
   */
  const [serverStand] = useState(() => fingerabdruck(konfiguration));
  const formEntwurf = useEntwurf<Ablage>({
    schluessel: `lagemonitor:anzeige:${serverStand}`,
    stand: ablageAus(z),
    wiederherstellen: (w) => setZ({ ...zustandAus(gespeichert), ...w }),
  });
  const band = useMemo(() => bandMeldungen(meldungen, kategorien, null, jetzt), [meldungen, kategorien, jetzt]);
  const tomtom = z.tomtomSchluessel.trim() !== "" || (gespeichert.tomtomHinterlegt && !z.tomtomEntfernen);
  const vorschauOrt = vorschauOrtVon(zugaenge, standorte.je);
  const mitte = useMemo(() => kartenMitte(zugaenge, standorte.je), [zugaenge, standorte]);
  const eingabe = useMemo(() => ({ ...z, standortName: vorschauOrt, tomtom }), [z, vorschauOrt, tomtom]);

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    setFehler(null);
    setFeldFehler({});
    setLaeuft(true);
    void anzeigeSpeichernAction(z)
      .then((ergebnis) => {
        if (ergebnis.ok) {
          setLinkErsetzen(false);
          setSchluesselErsetzen(false);
          setErfolg(true);
          return;
        }
        setFehler(ergebnis.fehler);
        setFeldFehler(ergebnis.feldFehler ?? {});
      })
      .catch(() => setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(false));
  }

  const linkFeld = !gespeichert.suchlageVerbunden || linkErsetzen;
  const schluesselFeld = !gespeichert.tomtomHinterlegt || schluesselErsetzen;
  const tomtomNoetig = z.verkehr.fluss || z.verkehr.baustellen;
  const zahl = (feld: "kartenZoom", label: string, hilfe?: string) => (
    <Feld id={`${basis}-${feld}`} label={label} fehler={feldFehler[feld]} hilfe={hilfe}>
      <InputNumber
        id={`${basis}-${feld}`}
        value={z[feld]}
        step={0.5}
        min={KARTEN_ZOOM.min}
        max={KARTEN_ZOOM.max}
        decimalSeparator=","
        // Halbe Stufen: am Telefon die Zifferntastatur mit Komma, nicht die Buchstaben (IDA-390).
        inputMode="decimal"
        style={{ width: "100%" }}
        status={feldFehler[feld] ? "error" : undefined}
        aria-describedby={feldFehler[feld] ? `${basis}-${feld}-fehler` : hilfe ? `${basis}-${feld}-hilfe` : undefined}
        onChange={(wert) => setze(feld, typeof wert === "number" ? wert : null)}
      />
    </Feld>
  );
  const text = (feld: "regionArs" | "regionName", label: string, hilfe?: string) => (
    <Feld id={`${basis}-${feld}`} label={label} fehler={feldFehler[feld]} hilfe={hilfe}>
      <Input
        id={`${basis}-${feld}`}
        value={z[feld]}
        status={feldFehler[feld] ? "error" : undefined}
        aria-describedby={feldFehler[feld] ? `${basis}-${feld}-fehler` : hilfe ? `${basis}-${feld}-hilfe` : undefined}
        onChange={(e) => setze(feld, e.target.value)}
      />
    </Feld>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Einrichtung"
        aktionen={<ZumMonitor online={online} />}
      />

      <div className={v.raster}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg, alignContent: "start" }}>
          <form onSubmit={absenden} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }} aria-label="Einstellungen des Lagemonitors">
            <EntwurfHinweis entwurf={formEntwurf} />
            {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

            <Card title="Karte und Warnregion">
              <div style={{ display: "grid", gap: SPACE.md }}>
                {zahl(
                  "kartenZoom",
                  "Zoomstufe der Karte",
                  `${KARTEN_ZOOM.min} bis ${KARTEN_ZOOM.max}`,
                )}
                {text("regionName", "Warnregion")}
                {text("regionArs", "Regionalschlüssel", "12 Ziffern")}
              </div>
            </Card>

            <Card title="Wann eine Warnung das Band bekommt">
              <div style={{ display: "grid", gap: SPACE.sm }}>
                <Radio.Group
                  aria-label="Warnschwelle"
                  value={z.warnschwelle}
                  onChange={(e) => setze("warnschwelle", e.target.value as Warnschwelle)}
                  options={WARNSCHWELLEN.map((s) => ({ value: s.wert, label: s.text }))}
                  optionType="button"
                />
              </div>
            </Card>

            <Card title="Was der Monitor zeigt">
              {MODUL_TEXT.map((m) => (
                <Schalter
                  key={m.feld}
                  id={`${basis}-${m.feld}`}
                  titel={m.titel}
                  an={z.module[m.feld]}
                  onChange={(an) => setze("module", { ...z.module, [m.feld]: an })}
                />
              ))}
            </Card>

            <Card title="Suchlage">
              <div style={{ display: "grid", gap: SPACE.md }}>
                <Schalter
                  id={`${basis}-suchlage`}
                  titel="Laufenden Suchlage-Einsatz zeigen"
                  an={z.module.suchlage}
                  onChange={(an) => {
                    setze("module", { ...z.module, suchlage: an });
                    if (an) setSzenario("einsatz");
                  }}
                />
                {z.module.suchlage ? (
                  <>
                    {linkFeld ? (
                      <Feld
                        id={`${basis}-suchlageLink`}
                        label="Großbild-Link aus Suchlage"
                        fehler={feldFehler.suchlageLink}
                      >
                        <Input
                          id={`${basis}-suchlageLink`}
                          value={z.suchlageLink}
                          autoComplete="off"
                          status={feldFehler.suchlageLink ? "error" : undefined}
                          aria-describedby={feldFehler.suchlageLink ? `${basis}-suchlageLink-fehler` : undefined}
                          onChange={(e) => setze("suchlageLink", e.target.value)}
                        />
                      </Feld>
                    ) : z.suchlageTrennen ? (
                      <Alert
                        type="warning"
                        showIcon={false}
                        title="Beim Speichern wird die Verbindung zu Suchlage getrennt."
                        action={<Button onClick={() => setze("suchlageTrennen", false)}>Doch nicht</Button>}
                      />
                    ) : (
                      <div style={{ display: "grid", gap: SPACE.sm }}>
                        <span>
                          Verbunden mit <strong>{gespeichert.suchlageAdresse}</strong>
                        </span>
                        <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
                          <Button onClick={() => setLinkErsetzen(true)}>Anderen Link eintragen</Button>
                          <Button onClick={() => setze("suchlageTrennen", true)}>Verbindung trennen</Button>
                        </div>
                      </div>
                    )}
                    {!gespeichert.suchlageVerbunden && z.suchlageLink.trim() === "" ? (
                      <Alert type="warning" showIcon={false} title="Ohne Link weiß der Monitor nicht, wo Suchlage läuft, und zeigt keinen Einsatz." />
                    ) : null}
                    {TEIL_TEXT.map((t) => (
                      <Schalter
                        key={t.feld}
                        id={`${basis}-${t.feld}`}
                        titel={t.titel}
                        an={z.suchlage[t.feld]}
                        onChange={(an) => setze("suchlage", { ...z.suchlage, [t.feld]: an })}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            </Card>

            <Card title="Verkehrslage">
              <div style={{ display: "grid", gap: SPACE.md }}>
                {VERKEHR_TEXT.map((t) => (
                  <Schalter
                    key={t.feld}
                    id={`${basis}-verkehr-${t.feld}`}
                    titel={t.titel}
                    an={z.verkehr[t.feld]}
                    onChange={(an) => setze("verkehr", { ...z.verkehr, [t.feld]: an })}
                  />
                ))}
                {schluesselFeld ? (
                  <Feld
                    id={`${basis}-tomtomSchluessel`}
                    label="API-Schlüssel von TomTom"
                    fehler={feldFehler.tomtomSchluessel}
                  >
                    <Input.Password
                      id={`${basis}-tomtomSchluessel`}
                      value={z.tomtomSchluessel}
                      autoComplete="off"
                      visibilityToggle={false}
                      status={feldFehler.tomtomSchluessel ? "error" : undefined}
                      aria-describedby={feldFehler.tomtomSchluessel ? `${basis}-tomtomSchluessel-fehler` : undefined}
                      onChange={(e) => setze("tomtomSchluessel", e.target.value)}
                    />
                  </Feld>
                ) : z.tomtomEntfernen ? (
                  <Alert
                    type="warning"
                    showIcon={false}
                    title="Beim Speichern wird der TomTom-Schlüssel entfernt."
                    action={<Button onClick={() => setze("tomtomEntfernen", false)}>Doch nicht</Button>}
                  />
                ) : (
                  <div style={{ display: "grid", gap: SPACE.sm }}>
                    <span>Ein TomTom-Schlüssel ist hinterlegt.</span>
                    <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
                      <Button onClick={() => setSchluesselErsetzen(true)}>Anderen Schlüssel eintragen</Button>
                      <Button onClick={() => setze("tomtomEntfernen", true)}>Schlüssel entfernen</Button>
                    </div>
                  </div>
                )}
                {tomtomNoetig && !tomtom ? (
                  <Alert type="warning" showIcon={false} title="Ohne TomTom-Schlüssel zeigt der Monitor weder Verkehrsfluss noch Baustellen." />
                ) : null}
              </div>
            </Card>

            <Card title="Mitmachen im Ehrenamt">
              <div style={{ display: "grid", gap: SPACE.md }}>
                <Schalter
                  id={`${basis}-mitmachen`}
                  titel="QR-Code fürs Ehrenamt zeigen"
                  an={z.mitmachen.an}
                  onChange={(an) => setze("mitmachen", { ...z.mitmachen, an, text: z.mitmachen.text || MITMACHEN_TEXT_VORGABE })}
                />
                {z.mitmachen.an ? (
                  <>
                    <Feld id={`${basis}-mitmachenAdresse`} label="Wohin der Code führt" fehler={feldFehler["mitmachen.adresse"]}>
                      <Input
                        id={`${basis}-mitmachenAdresse`}
                        value={z.mitmachen.adresse}
                        placeholder="https://…"
                        inputMode="url"
                        status={feldFehler["mitmachen.adresse"] ? "error" : undefined}
                        aria-describedby={feldFehler["mitmachen.adresse"] ? `${basis}-mitmachenAdresse-fehler` : undefined}
                        onChange={(e) => setze("mitmachen", { ...z.mitmachen, adresse: e.target.value })}
                      />
                    </Feld>
                    <Feld id={`${basis}-mitmachenText`} label="Satz neben dem Code" fehler={feldFehler["mitmachen.text"]}>
                      <Input
                        id={`${basis}-mitmachenText`}
                        value={z.mitmachen.text}
                        maxLength={MITMACHEN_MAX_ZEICHEN}
                        showCount
                        status={feldFehler["mitmachen.text"] ? "error" : undefined}
                        onChange={(e) => setze("mitmachen", { ...z.mitmachen, text: e.target.value })}
                      />
                    </Feld>
                  </>
                ) : null}
              </div>
            </Card>

            {/*
              IDA-390: Ungespeichertes klebt am unteren Rand. Die Schalter oben wirken sofort auf die
              Vorschau, „Speichern" stand aber weit darunter außer Sicht. `data-fussleiste` nimmt den
              schwebenden Rückmeldeknopf zurück, der sonst auf der Leiste läge (`core/rueckmeldung`).
            */}
            <div
              className={v.speicherleiste}
              data-rolle="speicherleiste"
              data-klebt={geaendert ? "" : undefined}
              data-fussleiste={geaendert ? "" : undefined}
            >
              <Button type="primary" htmlType="submit" loading={laeuft} disabled={!geaendert}>
                Speichern
              </Button>
              <span style={SCHRIFT.neben} className={geaendert ? v.ungespeichert : v.gedaempft} role="status">
                {geaendert
                  ? "Ungespeicherte Änderungen"
                  : erfolg
                    ? "Gespeichert"
                    : gespeichert.aktualisiertAm
                      ? `Zuletzt gespeichert am ${STAND.format(new Date(gespeichert.aktualisiertAm))} von ${gespeichert.aktualisiertVon}.`
                      : "Noch nie gespeichert"}
              </span>
            </div>
          </form>
        </div>

        <VorschauSpalte
          eingabe={eingabe}
          band={band}
          szenario={szenario}
          onSzenario={setSzenario}
          geaendert={geaendert}
          lagekarte={{ objekte: lagekarte.liste, mitte, zoom: z.kartenZoom ?? KARTEN_ZOOM.vorgabe }}
        />
      </div>

      <Kategorien liste={kategorien} />

      <OeffentlicheLinks liste={links} online={online} />

      <Zugaenge liste={zugaenge} standorte={standorte.je} auswahl={standorte.auswahl} />

      <Fahrzeuge liste={fahrzeuge.liste} auswahl={fahrzeuge.auswahl} />

      <Lagekarte liste={lagekarte.liste} zeichen={lagekarte.zeichen} standort={mitte} />
    </div>
  );
}

/** Ein Schalter mit Titel und einem Satz, was er bewirkt. */
function Schalter({ id, titel, an, onChange }: { id: string; titel: string; an: boolean; onChange: (an: boolean) => void }) {
  return (
    <div className={v.schalter}>
      <Switch id={id} checked={an} onChange={onChange} />
      <div>
        <label htmlFor={id} style={{ fontWeight: 600 }}>
          {titel}
        </label>
      </div>
    </div>
  );
}

/** Label über dem Feld, Hilfe und Fehlertext darunter (wie `fahrzeuge/_ui/FahrzeugFormular.tsx`). */
function Feld({ id, label, fehler, hilfe, children }: { id: string; label: string; fehler?: string; hilfe?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
        {label}
      </label>
      {children}
      {fehler ? (
        <div id={`${id}-fehler`} style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>
          {fehler}
        </div>
      ) : hilfe ? (
        <div id={`${id}-hilfe`} style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }} className={v.gedaempft}>
          {hilfe}
        </div>
      ) : null}
    </div>
  );
}
