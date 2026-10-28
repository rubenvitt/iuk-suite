"use client";

import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Card, Input, InputNumber, Radio, Switch } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { anzeigeSpeichernAction } from "../_actions/verwaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import { MITMACHEN_MAX_ZEICHEN, MITMACHEN_TEXT_VORGABE, WARNSCHWELLEN, type KonfigurationDTO, type Mitmachen, type Module, type SuchlageTeile, type Warnschwelle } from "../_lib/konfiguration";
import { naechsteUhrzeit, type MeldungDTO } from "../_lib/meldungRegeln";
import type { LinkDTO } from "../_lib/links";
import type { ZugangDTO } from "../_lib/schluessel";
import { countdownText, SZENARIEN, vorschau, type Szenario, type VorschauMeldung } from "../_lib/vorschau";
import { Meldungen, type MeldungEntwurf } from "./Meldungen";
import { MonitorVorschau } from "./MonitorVorschau";
import { OeffentlicheLinks } from "./OeffentlicheLinks";
import { Zugaenge } from "./Zugaenge";
import v from "./verwaltung.module.css";

const STAND = zeitFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

interface Zustand {
  standortName: string;
  standortBreite: number | null;
  standortLaenge: number | null;
  regionArs: string;
  regionName: string;
  warnschwelle: Warnschwelle;
  module: Module;
  suchlage: SuchlageTeile;
  mitmachen: Mitmachen;
  suchlageLink: string;
  suchlageTrennen: boolean;
}

function zustandAus(k: KonfigurationDTO): Zustand {
  return {
    standortName: k.standortName,
    standortBreite: k.standortBreite,
    standortLaenge: k.standortLaenge,
    regionArs: k.regionArs,
    regionName: k.regionName,
    warnschwelle: k.warnschwelle,
    module: { ...k.module },
    suchlage: { ...k.suchlage },
    mitmachen: { ...k.mitmachen },
    suchlageLink: "",
    suchlageTrennen: false,
  };
}

const MODUL_TEXT: { feld: keyof Omit<Module, "suchlage">; titel: string; text: string }[] = [
  { feld: "wetter", titel: "Wetter", text: "Temperatur, Wind und Niederschlag am Standort in der rechten Spalte." },
  { feld: "radar", titel: "Regenradar", text: "Der Niederschlag der letzten Minuten als Ebene auf der Karte." },
  { feld: "warngebiete", titel: "Warngebiete auf der Karte", text: "Die Gebiete der aktuellen Warnungen als Umriss." },
  { feld: "warnliste", titel: "Warnungen unter der Schwelle", text: "Leichtere Warnungen als Liste in der rechten Spalte. Ohne sie siehst du nur, was ins Band kommt." },
];

const TEIL_TEXT: { feld: keyof SuchlageTeile; titel: string; text: string }[] = [
  { feld: "flugspuren", titel: "Flugspuren", text: "Die Spur jedes Flugs im laufenden Einsatz, jeder Flug in eigener Farbe." },
  { feld: "gebiete", titel: "Suchgebiete", text: "Die in Suchlage gezeichneten Gebiete und Elemente." },
  { feld: "drohnenbild", titel: "Drohnenbild", text: "Das Livebild fährt von rechts ein, solange eine Drohne sendet, und wieder hinaus, wenn es endet." },
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
  links,
  online,
}: {
  konfiguration: KonfigurationDTO;
  zugaenge: ZugangDTO[];
  meldungen: MeldungDTO[];
  links: LinkDTO[];
  online: string | null;
}) {
  const [gespeichert, setGespeichert] = useState(konfiguration);
  const [z, setZ] = useState<Zustand>(() => zustandAus(konfiguration));
  const [szenario, setSzenario] = useState<Szenario>("ruhe");
  const [linkErsetzen, setLinkErsetzen] = useState(false);
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
    const laufend = meldungen.map((m) => ({ text: m.text, countdown: zaehler(m.zeitpunkt ? Date.parse(m.zeitpunkt) : null) }));
    if (!entwurf) return laufend;
    const ziel = entwurf.uhrzeit && jetzt !== null ? naechsteUhrzeit(entwurf.uhrzeit, new Date(jetzt)).getTime() : null;
    return [...laufend, { text: entwurf.text, countdown: zaehler(ziel), entwurf: true }];
  }, [meldungen, entwurf, jetzt]);
  const bild = useMemo(() => vorschau(z, szenario, bandMeldungen), [z, szenario, bandMeldungen]);

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    setFehler(null);
    setFeldFehler({});
    setLaeuft(true);
    void anzeigeSpeichernAction(z)
      .then((ergebnis) => {
        if (ergebnis.ok) {
          setLinkErsetzen(false);
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
  const zahl = (feld: "standortBreite" | "standortLaenge", label: string) => (
    <Feld id={`${basis}-${feld}`} label={label} fehler={feldFehler[feld]}>
      <InputNumber
        id={`${basis}-${feld}`}
        value={z[feld]}
        step={0.0001}
        decimalSeparator=","
        controls={false}
        style={{ width: "100%" }}
        status={feldFehler[feld] ? "error" : undefined}
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
        beschreibung="Was der Bildschirm im FüKw zeigt. Die Vorschau zeigt jede Änderung sofort mit Beispieldaten, noch bevor du speicherst. Der Monitor holt gespeicherte Einstellungen spätestens nach einer Minute ab und behält sie, auch wenn die Verbindung zur Suite abreißt."
      />

      <div className={v.raster}>
        <div style={{ display: "grid", gap: SPACE.lg, alignContent: "start" }}>
          <Meldungen liste={meldungen} jetzt={jetzt} onEntwurf={setEntwurf} />
          <form onSubmit={absenden} style={{ display: "grid", gap: SPACE.lg }} aria-label="Einstellungen des Lagemonitors">
            {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

            <Card title="Standort und Warnregion">
              <div style={{ display: "grid", gap: SPACE.md }}>
                {text("standortName", "Standort", "So heißt der Ort in der Kopfzeile und beim Wetter.")}
                <div style={{ display: "grid", gap: SPACE.md, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  {zahl("standortBreite", "Breitengrad")}
                  {zahl("standortLaenge", "Längengrad")}
                </div>
                {text("regionName", "Warnregion", "Für diese Region kommen die Warnungen von NINA.")}
                {text("regionArs", "Regionalschlüssel", "12 Ziffern, für einen Landkreis mit sieben Nullen am Ende (Uelzen: 033600000000).")}
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
                <span style={SCHRIFT.neben} className={v.gedaempft}>
                  {WARNSCHWELLEN.find((s) => s.wert === z.warnschwelle)?.erklaerung}
                </span>
              </div>
            </Card>

            <Card title="Was der Monitor zeigt">
              {MODUL_TEXT.map((m) => (
                <Schalter
                  key={m.feld}
                  id={`${basis}-${m.feld}`}
                  titel={m.titel}
                  text={m.text}
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
                  text="Läuft in Suchlage ein Einsatz, zeigt die Karte ihn und die Kopfzeile seinen Namen. Ohne Einsatz sieht der Monitor aus wie sonst."
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
                        hilfe="In Suchlage unter Einstellungen → Großbild einen Zugang anlegen und den Link hier einfügen. Er sieht so aus: https://suchlage…/kiosk#…"
                      >
                        <Input
                          id={`${basis}-suchlageLink`}
                          value={z.suchlageLink}
                          autoComplete="off"
                          status={feldFehler.suchlageLink ? "error" : undefined}
                          aria-describedby={feldFehler.suchlageLink ? `${basis}-suchlageLink-fehler` : `${basis}-suchlageLink-hilfe`}
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
                        text={t.text}
                        an={z.suchlage[t.feld]}
                        onChange={(an) => setze("suchlage", { ...z.suchlage, [t.feld]: an })}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            </Card>

            <Card title="Mitmachen im Ehrenamt">
              <div style={{ display: "grid", gap: SPACE.md }}>
                <Schalter
                  id={`${basis}-mitmachen`}
                  titel="QR-Code fürs Ehrenamt zeigen"
                  text="Ein QR-Code unten rechts auf der Karte für alle, die am Bildschirm vorbeikommen und bei der Bereitschaft mitmachen möchten. Nur solange es ruhig ist: bei einer Warnung im Band oder einem Einsatz verschwindet er."
                  an={z.mitmachen.an}
                  onChange={(an) => setze("mitmachen", { ...z.mitmachen, an, text: z.mitmachen.text || MITMACHEN_TEXT_VORGABE })}
                />
                {z.mitmachen.an ? (
                  <>
                    <Feld id={`${basis}-mitmachenAdresse`} label="Wohin der Code führt" fehler={feldFehler["mitmachen.adresse"]} hilfe="Die Mitmach-Seite eures Ortsvereins oder Kreisverbands, mit https://.">
                      <Input
                        id={`${basis}-mitmachenAdresse`}
                        value={z.mitmachen.adresse}
                        placeholder="https://…"
                        inputMode="url"
                        status={feldFehler["mitmachen.adresse"] ? "error" : undefined}
                        aria-describedby={feldFehler["mitmachen.adresse"] ? `${basis}-mitmachenAdresse-fehler` : `${basis}-mitmachenAdresse-hilfe`}
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
                  ? "Ungespeicherte Änderungen. Die Vorschau zeigt sie schon, der Monitor noch nicht."
                  : erfolg
                    ? "Gespeichert. Der Monitor zeigt es spätestens in einer Minute."
                    : gespeichert.aktualisiertAm
                      ? `Zuletzt gespeichert am ${STAND.format(new Date(gespeichert.aktualisiertAm))} von ${gespeichert.aktualisiertVon}.`
                      : "Noch nie gespeichert: der Monitor zeigt seine Vorgaben."}
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
              {szenario === "einsatz" && !z.module.suchlage ? (
                <Alert type="info" showIcon={false} title="Suchlage ist aus: Auch während eines Einsatzes zeigt der Monitor nur Wetter und Warnungen." />
              ) : null}
              <div>
                <strong style={SCHRIFT.kicker}>Das siehst du</strong>
                <ul className={v.liste} data-testid="vorschau-erklaerung">
                  {bild.sichtbar.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
              {bild.aus.length > 0 ? (
                <div style={SCHRIFT.neben} className={v.gedaempft}>
                  Ausgeschaltet: {bild.aus.join(", ")}.
                </div>
              ) : null}
              <div style={SCHRIFT.neben} className={v.gedaempft}>
                Der echte Monitor wird tagsüber hell und nachts dunkel; die Vorschau zeigt die Nachtansicht.
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <OeffentlicheLinks liste={links} online={online} />

      <Zugaenge liste={zugaenge} />
    </div>
  );
}

/** Ein Schalter mit Titel und einem Satz, was er bewirkt. */
function Schalter({ id, titel, text, an, onChange }: { id: string; titel: string; text: string; an: boolean; onChange: (an: boolean) => void }) {
  return (
    <div className={v.schalter}>
      <Switch id={id} checked={an} onChange={onChange} aria-describedby={`${id}-text`} />
      <div>
        <label htmlFor={id} style={{ fontWeight: 600 }}>
          {titel}
        </label>
        <div id={`${id}-text`} style={SCHRIFT.neben} className={v.gedaempft}>
          {text}
        </div>
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
