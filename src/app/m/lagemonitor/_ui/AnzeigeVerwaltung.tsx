"use client";

import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Card, Input, InputNumber, Radio, Switch } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { anzeigeSpeichernAction } from "../_actions/verwaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import { KARTEN_ZOOM, MITMACHEN_MAX_ZEICHEN, MITMACHEN_TEXT_VORGABE, WARNSCHWELLEN, type KonfigurationDTO, type Mitmachen, type Module, type SuchlageTeile, type Verkehr, type Warnschwelle } from "../_lib/konfiguration";
import { istFaellig, type KategorieDTO } from "../_lib/kategorieRegeln";
import { MELDUNGEN_MAX_AKTIV, planeMeldung, sichtbar, type MeldungDTO } from "../_lib/meldungRegeln";
import type { FahrzeugAuswahl, FahrzeugDTO } from "../_lib/fahrzeuge";
import type { LinkDTO } from "../_lib/links";
import type { ZugangDTO } from "../_lib/schluessel";
import { countdownText, SZENARIEN, vorschau, type Szenario, type VorschauMeldung } from "../_lib/vorschau";
import { Fahrzeuge } from "./Fahrzeuge";
import { Kategorien } from "./Kategorien";
import { Meldungen, type MeldungEntwurf } from "./Meldungen";
import { MonitorVorschau } from "./MonitorVorschau";
import { OeffentlicheLinks } from "./OeffentlicheLinks";
import { Zugaenge } from "./Zugaenge";
import { ZumMonitor } from "./ZumMonitor";
import v from "./verwaltung.module.css";

const STAND = zeitFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

interface Zustand {
  standortName: string;
  standortBreite: number | null;
  standortLaenge: number | null;
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
    standortName: k.standortName,
    standortBreite: k.standortBreite,
    standortLaenge: k.standortLaenge,
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
 * Die Verwaltung des Lagemonitors: Formular und daneben die Vorschau, die jede Änderung sofort zeigt —
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
}: {
  konfiguration: KonfigurationDTO;
  zugaenge: ZugangDTO[];
  meldungen: MeldungDTO[];
  kategorien: KategorieDTO[];
  links: LinkDTO[];
  online: string | null;
  fahrzeuge: { liste: FahrzeugDTO[]; auswahl: FahrzeugAuswahl };
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
  const [entwurf, setEntwurf] = useState<MeldungEntwurf | null>(null);
  // Die Uhr erst nach dem Hydrieren: Server und Browser zählten sonst verschieden herunter.
  const [jetzt, setJetzt] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setJetzt(Date.now());
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, []);

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
  const bandMeldungen = useMemo<VorschauMeldung[]>(() => {
    const zaehler = (ziel: number | null) => (ziel !== null && jetzt !== null ? countdownText(ziel, jetzt) : null);
    const blinkt = (ziel: number | null, k: KategorieDTO | null) => jetzt !== null && istFaellig(ziel, k?.vorlaufMinuten ?? null, jetzt);
    // Wie am Monitor: höchstens drei begonnene. Ohne Uhr (Server, vor dem Hydrieren) die ohne späteren Beginn.
    const amMonitor = jetzt === null ? meldungen.filter((m) => m.anzeigenAb === null).slice(0, MELDUNGEN_MAX_AKTIV) : sichtbar(meldungen, jetzt);
    const laufend = amMonitor.map((m) => {
      const ziel = m.zeitpunkt ? Date.parse(m.zeitpunkt) : null;
      return { text: m.text, countdown: zaehler(ziel), kategorie: m.kategorie, faellig: blinkt(ziel, m.kategorie) };
    });
    if (!entwurf) return laufend;
    // Beginnt der Entwurf später oder stehen schon drei am Monitor, zeigt ihn der Monitor jetzt noch nicht.
    if (laufend.length >= MELDUNGEN_MAX_AKTIV) return laufend;
    const plan = jetzt === null ? null : planeMeldung({ uhrzeit: entwurf.uhrzeit, anzeigenAb: entwurf.anzeigenAb, laufzeitMinuten: 0 }, new Date(jetzt));
    if (plan?.anzeigenAb) return laufend;
    const ziel = plan?.zeitpunkt?.getTime() ?? null;
    const k = kategorien.find((x) => x.id === entwurf.kategorieId) ?? null;
    return [...laufend, { text: entwurf.text, countdown: zaehler(ziel), entwurf: true, kategorie: k, faellig: blinkt(ziel, k) }];
  }, [meldungen, kategorien, entwurf, jetzt]);
  const tomtom = z.tomtomSchluessel.trim() !== "" || (gespeichert.tomtomHinterlegt && !z.tomtomEntfernen);
  const bild = useMemo(() => vorschau({ ...z, tomtom }, szenario, bandMeldungen), [z, tomtom, szenario, bandMeldungen]);

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
  const zahl = (feld: "standortBreite" | "standortLaenge" | "kartenZoom", label: string, hilfe?: string) => (
    <Feld id={`${basis}-${feld}`} label={label} fehler={feldFehler[feld]} hilfe={hilfe}>
      <InputNumber
        id={`${basis}-${feld}`}
        value={z[feld]}
        {...(feld === "kartenZoom" ? { step: 0.5, min: KARTEN_ZOOM.min, max: KARTEN_ZOOM.max } : { step: 0.0001, controls: false })}
        decimalSeparator=","
        style={{ width: "100%" }}
        status={feldFehler[feld] ? "error" : undefined}
        aria-describedby={feldFehler[feld] ? `${basis}-${feld}-fehler` : hilfe ? `${basis}-${feld}-hilfe` : undefined}
        onChange={(wert) => setze(feld, typeof wert === "number" ? wert : null)}
      />
    </Feld>
  );
  const text = (feld: "standortName" | "regionArs" | "regionName", label: string, hilfe?: string) => (
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
        titel="Lagemonitor"
        aktionen={<ZumMonitor online={online} />}
      />

      <div className={v.raster}>
        <div style={{ display: "grid", gap: SPACE.lg, alignContent: "start" }}>
          <Meldungen liste={meldungen} kategorien={kategorien} jetzt={jetzt} onEntwurf={setEntwurf} />
          <form onSubmit={absenden} style={{ display: "grid", gap: SPACE.lg }} aria-label="Einstellungen des Lagemonitors">
            {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

            <Card title="Standort und Warnregion">
              <div style={{ display: "grid", gap: SPACE.md }}>
                {text("standortName", "Standort")}
                <div style={{ display: "grid", gap: SPACE.md, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  {zahl("standortBreite", "Breitengrad")}
                  {zahl("standortLaenge", "Längengrad")}
                </div>
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

            <div style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap", alignItems: "center" }}>
              <Button type="primary" htmlType="submit" loading={laeuft} disabled={!geaendert}>
                Speichern
              </Button>
              <span style={SCHRIFT.neben} className={v.gedaempft} role="status">
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

        <aside className={v.vorschauSpalte} aria-label="Vorschau">
          <Card
            title="Vorschau"
            extra={<span style={SCHRIFT.neben} className={v.gedaempft}>mit Beispieldaten</span>}
          >
            <div style={{ display: "grid", gap: SPACE.md }}>
              <Radio.Group
                aria-label="Beispiellage"
                value={szenario}
                onChange={(e) => setSzenario(e.target.value as Szenario)}
                options={SZENARIEN.map((s) => ({ value: s.wert, label: s.text }))}
                optionType="button"
              />
              <MonitorVorschau v={bild} szenario={szenario} standort={z.standortName} />
            </div>
          </Card>
        </aside>
      </div>

      <Kategorien liste={kategorien} />

      <OeffentlicheLinks liste={links} online={online} />

      <Zugaenge liste={zugaenge} />

      <Fahrzeuge liste={fahrzeuge.liste} auswahl={fahrzeuge.auswahl} />
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
