"use client";

import { useId, useState, type FormEvent } from "react";
import { Alert, App, Button, Card, Input, Radio } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { meldungAnlegenAction, meldungBeendenAction } from "../_actions/verwaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import { LAUFZEIT_VORGABE, LAUFZEITEN, MELDUNG_MAX_ZEICHEN, MELDUNGEN_MAX_AKTIV, STUNDE, type MeldungDTO } from "../_lib/meldungRegeln";
import { countdownText } from "../_lib/vorschau";
import v from "./verwaltung.module.css";

const ABLAUF = zeitFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const UHR = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

export interface MeldungEntwurf {
  text: string;
  uhrzeit: string;
}

/**
 * Meldungen fürs Band am Monitor: anlegen (Text, optional eine Uhrzeit zum Herunterzählen, Laufzeit)
 * und vorzeitig beenden. Wirkt sofort, ohne „Speichern“ der Anzeige; die Vorschau daneben zeigt auch
 * den Entwurf, solange er getippt wird.
 */
export function Meldungen({ liste, jetzt, onEntwurf }: { liste: MeldungDTO[]; jetzt: number | null; onEntwurf: (e: MeldungEntwurf | null) => void }) {
  const { message } = App.useApp();
  const [text, setText] = useState("");
  const [uhrzeit, setUhrzeit] = useState("");
  const [laufzeit, setLaufzeit] = useState<number>(LAUFZEIT_VORGABE);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const basis = useId();
  const voll = liste.length >= MELDUNGEN_MAX_AKTIV;

  function aendere(t: string, u: string): void {
    setText(t);
    setUhrzeit(u);
    setFeldFehler({});
    onEntwurf(t.trim() === "" ? null : { text: t.trim(), uhrzeit: u });
  }

  function anlegen(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setFehler(null);
    setFeldFehler({});
    setLaeuft("neu");
    void meldungAnlegenAction({ text, uhrzeit, laufzeitStunden: laufzeit })
      .then((r) => {
        if (!r.ok) {
          setFehler(r.fehler);
          setFeldFehler(r.feldFehler ?? {});
          return;
        }
        aendere("", "");
        setLaufzeit(LAUFZEIT_VORGABE);
        void message.success("Meldung angelegt. Der Monitor zeigt sie spätestens in einer Minute.");
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
  return (
    <Card title="Meldungen am Monitor">
      <div style={{ display: "grid", gap: SPACE.lg }}>
        <span style={SCHRIFT.neben} className={v.gedaempft}>
          Ein kurzer Hinweis als blaues Band unter der Kopfzeile, etwa „Nächste Lagebesprechung“. Jede Meldung läuft von selbst ab; du kannst sie auch vorher beenden.
        </span>

        {liste.length > 0 ? (
          <ul className={v.meldungen} aria-label="Laufende Meldungen">
            {liste.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.text}</strong>
                  {m.zeitpunkt ? (
                    <span>
                      {" "}
                      · um {UHR.format(new Date(m.zeitpunkt))}
                      {jetzt !== null ? `, ${countdownText(Date.parse(m.zeitpunkt), jetzt)}` : ""}
                    </span>
                  ) : null}
                  <div style={SCHRIFT.neben} className={v.gedaempft}>
                    läuft ab {ABLAUF.format(new Date(m.ablaufAm))} · von {m.angelegtVon}
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
          <Alert type="info" showIcon={false} title={`Es laufen ${MELDUNGEN_MAX_AKTIV} Meldungen, mehr passen nicht untereinander. Für eine neue bitte erst eine beenden.`} />
        ) : (
          <form onSubmit={anlegen} style={{ display: "grid", gap: SPACE.md }} aria-label="Neue Meldung">
            {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
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
            <div style={{ display: "grid", gap: SPACE.xs }}>
              <span style={SCHRIFT.neben} id={`${basis}-laufzeit`}>
                Läuft ab nach
              </span>
              <Radio.Group
                aria-labelledby={`${basis}-laufzeit`}
                value={laufzeit}
                onChange={(e) => setLaufzeit(e.target.value as number)}
                options={LAUFZEITEN.map((l) => ({ value: l.stunden, label: l.text }))}
                optionType="button"
              />
              {jetzt !== null ? (
                <span style={SCHRIFT.neben} className={v.gedaempft}>
                  Verschwindet {ABLAUF.format(jetzt + laufzeit * STUNDE)} vom Monitor.
                </span>
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
