"use client";

import { useId, useState, type FormEvent } from "react";
import { Alert, App, Button, Card, Input, Radio, Select } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { meldungAnlegenAction, meldungBeendenAction } from "../_actions/verwaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import { begonnen, beginnVon, endeVon, offen, LAUFZEIT_VORGABE, LAUFZEITEN, MELDUNG_MAX_ZEICHEN, MELDUNGEN_MAX_AKTIV, MELDUNGEN_MAX_GEPLANT, planeMeldung, sichtbar, type MeldungDTO } from "../_lib/meldungRegeln";
import type { KategorieDTO } from "../_lib/kategorieRegeln";
import { countdownText } from "../_lib/vorschau";
import { KategorieMarke } from "./KategorieMarke";
import v from "./verwaltung.module.css";

const ABLAUF = zeitFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const UHR = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

export interface MeldungEntwurf {
  text: string;
  uhrzeit: string;
  kategorieId: string | null;
}

/** Wo eine Meldung gerade steht; ohne Uhr (vor dem Hydrieren) nichts. */
function stand(m: MeldungDTO, amMonitor: Set<string>, jetzt: number | null): string | null {
  if (jetzt === null) return null;
  if (!begonnen(m, jetzt)) return `geplant ab ${ABLAUF.format(beginnVon(m))}`;
  if (amMonitor.has(m.id)) return "am Monitor";
  return `wartet, am Monitor stehen schon ${MELDUNGEN_MAX_AKTIV}`;
}

/** Vorgewählt ist „Meldung“ aus den Vorgaben, sonst die erste Kategorie. */
function vorgabeKategorie(kategorien: KategorieDTO[]): string | null {
  return (kategorien.find((k) => k.id === "meldung") ?? kategorien[0])?.id ?? null;
}

/**
 * Meldungen fürs Band am Monitor: anlegen (Text, optional eine Uhrzeit zum Herunterzählen, optional ein
 * späterer Beginn, Laufzeit) und vorzeitig beenden. Geplant sein dürfen viele, am Monitor stehen höchstens
 * drei; die Liste sagt bei jeder, wo sie steht. Wirkt sofort, ohne „Speichern“ der Anzeige; die Vorschau daneben zeigt auch
 * den Entwurf, solange er getippt wird.
 */
export function Meldungen({
  liste,
  kategorien,
  jetzt,
  onEntwurf,
}: {
  liste: MeldungDTO[];
  kategorien: KategorieDTO[];
  jetzt: number | null;
  onEntwurf: (e: MeldungEntwurf | null) => void;
}) {
  const { message } = App.useApp();
  const [text, setText] = useState("");
  const [uhrzeit, setUhrzeit] = useState("");
  const [anzeigenAb, setAnzeigenAb] = useState("");
  const [kategorieWahl, setKategorieWahl] = useState<string | null>(() => vorgabeKategorie(kategorien));
  // Eine gelöschte Kategorie bleibt nicht gewählt.
  const kategorieId = kategorieWahl !== null && kategorien.some((k) => k.id === kategorieWahl) ? kategorieWahl : vorgabeKategorie(kategorien);
  const [laufzeit, setLaufzeit] = useState<number>(LAUFZEIT_VORGABE);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const basis = useId();
  // Was seit dem Laden abgelaufen ist, fällt mit der Uhr weg, nicht erst mit dem nächsten Stand vom Server.
  const offene = jetzt === null ? liste : offen(liste, jetzt);
  const voll = offene.length >= MELDUNGEN_MAX_GEPLANT;
  const amMonitor = new Set(jetzt === null ? [] : sichtbar(offene, jetzt).map((m) => m.id));
  const plan = jetzt === null ? null : planeMeldung({ uhrzeit, anzeigenAb, laufzeitMinuten: laufzeit }, new Date(jetzt));
  const planEnde = plan
    ? endeVon({ zeitpunkt: plan.zeitpunkt?.toISOString() ?? null, anzeigenAb: null, ablaufAm: plan.ablaufAm.toISOString(), angelegtAm: new Date(jetzt!).toISOString(), kategorie: kategorien.find((k) => k.id === kategorieId) ?? null })
    : null;

  function aendere(t: string, u: string, k: string | null = kategorieId): void {
    setText(t);
    setUhrzeit(u);
    setKategorieWahl(k);
    setFeldFehler({});
    onEntwurf(t.trim() === "" ? null : { text: t.trim(), uhrzeit: u, kategorieId: k });
  }

  function anlegen(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setFehler(null);
    setFeldFehler({});
    setLaeuft("neu");
    // Stand beim Absenden: stehen schon drei am Monitor, wartet die neue auf einen freien Platz.
    const besetzt = amMonitor.size >= MELDUNGEN_MAX_AKTIV;
    void meldungAnlegenAction({ text, uhrzeit, anzeigenAb, kategorieId, laufzeitMinuten: laufzeit })
      .then((r) => {
        if (!r.ok) {
          setFehler(r.fehler);
          setFeldFehler(r.feldFehler ?? {});
          return;
        }
        aendere("", "", kategorieId);
        setAnzeigenAb("");
        setLaufzeit(LAUFZEIT_VORGABE);
        void message.success(
          r.wert.anzeigenAb
            ? `Meldung geplant ab ${ABLAUF.format(new Date(r.wert.anzeigenAb))}.`
            : besetzt
              ? `Meldung angelegt. Sie wartet, bis am Monitor einer der ${MELDUNGEN_MAX_AKTIV} Plätze frei wird.`
              : "Meldung angelegt. Der Monitor zeigt sie spätestens in einer Minute.",
        );
      })
      .catch(() => setFehler("Anlegen ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(null));
  }

  function beenden(m: MeldungDTO): void {
    setLaeuft(m.id);
    void meldungBeendenAction(m.id)
      .then((r) => {
        if (!r.ok) void message.warning(r.fehler);
      })
      .catch(() => void message.warning("Beenden ist fehlgeschlagen. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  const feldText = feldFehler.text;
  const feldUhr = feldFehler.uhrzeit;
  const feldAb = feldFehler.anzeigenAb;
  return (
    <Card title="Meldungen am Monitor">
      <div style={{ display: "grid", gap: SPACE.lg }}>
        <span style={SCHRIFT.neben} className={v.gedaempft}>
          {`Ein kurzer Hinweis als Band unter der Kopfzeile, mit Zeichen und Farbe seiner Kategorie, etwa „Nächste Lagebesprechung“. Jede Meldung läuft von selbst ab; du kannst sie auch vorher beenden. Planen kannst du bis zu ${MELDUNGEN_MAX_GEPLANT}, der Monitor zeigt davon höchstens ${MELDUNGEN_MAX_AKTIV} auf einmal, die früher begonnenen zuerst.`}
        </span>

        {offene.length > 0 ? (
          <ul className={v.meldungen} aria-label="Laufende und geplante Meldungen">
            {offene.map((m) => (
              <li key={m.id}>
                <div>
                  <KategorieMarke kategorie={m.kategorie} /> <strong>{m.text}</strong>
                  {m.zeitpunkt ? (
                    <span>
                      {" "}
                      · um {UHR.format(new Date(m.zeitpunkt))}
                      {jetzt !== null ? `, ${countdownText(Date.parse(m.zeitpunkt), jetzt)}` : ""}
                    </span>
                  ) : null}
                  <div style={SCHRIFT.neben} className={v.gedaempft} data-testid="meldung-stand">
                    {[stand(m, amMonitor, jetzt), `verschwindet ${ABLAUF.format(endeVon(m))}`, `von ${m.angelegtVon}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Button loading={laeuft === m.id} onClick={() => beenden(m)} aria-label={`Meldung beenden: ${m.text}`}>
                  Beenden
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <span>Gerade läuft keine Meldung.</span>
        )}

        {voll ? (
          <Alert type="info" showIcon={false} title={`Es laufen oder warten ${MELDUNGEN_MAX_GEPLANT} Meldungen. Für eine neue bitte erst eine beenden.`} />
        ) : (
          <form onSubmit={anlegen} style={{ display: "grid", gap: SPACE.md }} aria-label="Neue Meldung">
            {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
            {kategorien.length > 0 ? (
              <div style={{ display: "grid", gap: SPACE.xs }}>
                <span style={SCHRIFT.neben} id={`${basis}-kategorie`}>
                  Kategorie
                </span>
                <Radio.Group
                  aria-labelledby={`${basis}-kategorie`}
                  value={kategorieId}
                  optionType="button"
                  onChange={(e) => aendere(text, uhrzeit, e.target.value as string)}
                  options={kategorien.map((k) => ({
                    value: k.id,
                    label: (
                      <>
                        <Icons8Ikone name={k.zeichen} /> {k.name}
                      </>
                    ),
                  }))}
                />
              </div>
            ) : null}
            <div>
              <label htmlFor={`${basis}-text`} style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
                Text
              </label>
              <Input
                id={`${basis}-text`}
                value={text}
                maxLength={MELDUNG_MAX_ZEICHEN}
                showCount
                placeholder="zum Beispiel Nächste Lagebesprechung"
                status={feldText ? "error" : undefined}
                onChange={(e) => aendere(e.target.value, uhrzeit)}
              />
              {feldText ? <div style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>{feldText}</div> : null}
            </div>
            <div>
              <label htmlFor={`${basis}-uhrzeit`} style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
                Herunterzählen bis (freiwillig)
              </label>
              <Input
                id={`${basis}-uhrzeit`}
                type="time"
                value={uhrzeit}
                style={{ maxWidth: 160 }}
                status={feldUhr ? "error" : undefined}
                aria-describedby={`${basis}-uhrzeit-hilfe`}
                onChange={(e) => aendere(text, e.target.value)}
              />
              <div id={`${basis}-uhrzeit-hilfe`} style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }} className={feldUhr ? undefined : v.gedaempft}>
                {feldUhr ?? "Dann steht am Monitor „in 42 min“. Ist die Uhrzeit heute schon vorbei, gilt morgen."}
              </div>
            </div>
            <div>
              <label htmlFor={`${basis}-ab`} style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
                Anzeigen ab (freiwillig)
              </label>
              <Input
                id={`${basis}-ab`}
                type="time"
                value={anzeigenAb}
                style={{ maxWidth: 160 }}
                status={feldAb ? "error" : undefined}
                aria-describedby={`${basis}-ab-hilfe`}
                onChange={(e) => {
                  setAnzeigenAb(e.target.value);
                  setFeldFehler({});
                }}
              />
              <div id={`${basis}-ab-hilfe`} style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }} className={feldAb ? undefined : v.gedaempft}>
                {feldAb ?? "Leer: sofort. Mit einer Uhrzeit zum Herunterzählen gilt die Zeit davor, etwa 13:00 für eine Besprechung um 14:00."}
              </div>
            </div>
            <div>
              <label htmlFor={`${basis}-laufzeit`} style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
                Anzeigen für
              </label>
              <Select
                id={`${basis}-laufzeit`}
                value={laufzeit}
                style={{ maxWidth: 220, width: "100%" }}
                onChange={(wert: number) => setLaufzeit(wert)}
                options={LAUFZEITEN.map((l) => ({ value: l.minuten, label: l.text }))}
                aria-describedby={`${basis}-laufzeit-hilfe`}
              />
              {plan && planEnde !== null ? (
                <div id={`${basis}-laufzeit-hilfe`} style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }} className={v.gedaempft} data-testid="meldung-plan">
                  {plan.anzeigenAb ? `Erscheint ${ABLAUF.format(plan.anzeigenAb)}, verschwindet ${ABLAUF.format(planEnde)}.` : `Verschwindet ${ABLAUF.format(planEnde)} vom Monitor.`}
                  {plan.zeitpunkt && planEnde < plan.ablaufAm.getTime() ? " Früher als die Laufzeit, weil die Kategorie die Meldung nach der Uhrzeit wegnimmt." : ""}
                </div>
              ) : null}
            </div>
            <div>
              <Button htmlType="submit" loading={laeuft === "neu"}>
                Meldung anlegen
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
