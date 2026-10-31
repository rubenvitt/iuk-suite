"use client";

import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { Alert, App, Button, Card, Input, Popconfirm, Radio } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { kategorieAendernAction, kategorieAnlegenAction, kategorieLoeschenAction } from "../_actions/verwaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import { FARBEN, KATEGORIE_NAME_MAX, KATEGORIEN_MAX, NACHLAUF_MINUTEN, VORLAEUFE, ZEICHEN, ZEICHEN_TEXT, type KategorieDTO, type KategorieEingabe } from "../_lib/kategorieRegeln";
import { KategorieMarke } from "./KategorieMarke";
import v from "./verwaltung.module.css";

/** Radio-Werte sind Zeichenketten; „nie“ steht für `null`. */
const NIE = "nie";
const vorlaufText = (m: number | null) => VORLAEUFE.find((x) => x.minuten === m)?.text ?? "Nie";

const NEU: KategorieEingabe = { name: "", zeichen: "info", farbe: "blau", vorlaufMinuten: 5 };

/**
 * Meldekategorien, etwa „Lagemeldung“ oder „Besprechung“: Name, Zeichen, Farbe und wann eine Meldung
 * mit Countdown blinkt. Eine Änderung wirkt sofort, auch auf laufende Meldungen.
 */
export function Kategorien({ liste }: { liste: KategorieDTO[] }) {
  const { message } = App.useApp();
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const voll = liste.length >= KATEGORIEN_MAX;

  function loeschen(k: KategorieDTO): void {
    setLaeuft(k.id);
    void kategorieLoeschenAction(k.id)
      .then((r) => {
        if (!r.ok) void message.warning(r.fehler);
        else if (bearbeitet === k.id) setBearbeitet(null);
      })
      .catch(() => void message.warning("Löschen ist fehlgeschlagen. Bitte die Seite neu laden."))
      .finally(() => setLaeuft(null));
  }

  return (
    <Card title="Meldekategorien">
      <div style={{ display: "grid", gap: SPACE.lg }}>
        <span style={SCHRIFT.neben} className={v.gedaempft}>
          Jede Meldung bekommt eine Kategorie. Am Monitor steht sie mit Zeichen und Farbe vor dem Text. Hat die Meldung eine Uhrzeit zum Herunterzählen, blinkt sie kurz vorher und bis {NACHLAUF_MINUTEN} Minuten danach.
        </span>
        {liste.length > 0 ? (
          <ul className={v.meldungen} aria-label="Kategorien">
            {liste.map((k) =>
              bearbeitet === k.id ? (
                <li key={k.id}>
                  <KategorieFormular
                    titel={`Kategorie „${k.name}“ ändern`}
                    start={k}
                    knopf="Speichern"
                    onAbbrechen={() => setBearbeitet(null)}
                    senden={(e) => kategorieAendernAction(k.id, e)}
                    onFertig={() => {
                      setBearbeitet(null);
                      void message.success("Kategorie gespeichert.");
                    }}
                  />
                </li>
              ) : (
                <li key={k.id}>
                  <div style={{ display: "flex", gap: SPACE.md, alignItems: "center", flexWrap: "wrap" }}>
                    <KategorieMarke kategorie={k} />
                    <span style={SCHRIFT.neben} className={v.gedaempft}>
                      blinkt: {vorlaufText(k.vorlaufMinuten)}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: SPACE.sm }}>
                    <Button onClick={() => setBearbeitet(k.id)} aria-label={`Kategorie ändern: ${k.name}`}>
                      Ändern
                    </Button>
                    <Popconfirm
                      title={`„${k.name}“ löschen?`}
                      description="Laufende Meldungen mit ihr bleiben, ohne Kategorie."
                      okText="Löschen"
                      cancelText="Abbrechen"
                      onConfirm={() => loeschen(k)}
                    >
                      <Button loading={laeuft === k.id} aria-label={`Kategorie löschen: ${k.name}`}>
                        Löschen
                      </Button>
                    </Popconfirm>
                  </div>
                </li>
              ),
            )}
          </ul>
        ) : (
          <span>Noch keine Kategorie. Meldungen stehen dann als schlichte „Meldung“ am Monitor.</span>
        )}
        {bearbeitet === "neu" ? (
          <KategorieFormular
            titel="Neue Kategorie"
            start={NEU}
            knopf="Kategorie anlegen"
            onAbbrechen={() => setBearbeitet(null)}
            senden={(e) => kategorieAnlegenAction(e)}
            onFertig={() => {
              setBearbeitet(null);
              void message.success("Kategorie angelegt.");
            }}
          />
        ) : voll ? (
          <span style={SCHRIFT.neben} className={v.gedaempft}>
            Mehr als {KATEGORIEN_MAX} Kategorien gehen nicht. Für eine neue bitte erst eine löschen.
          </span>
        ) : (
          <div>
            <Button onClick={() => setBearbeitet("neu")}>Neue Kategorie</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function KategorieFormular({
  titel,
  start,
  knopf,
  senden,
  onFertig,
  onAbbrechen,
}: {
  titel: string;
  start: KategorieEingabe;
  knopf: string;
  senden: (e: KategorieEingabe) => Promise<{ ok: true } | { ok: false; fehler: string; feldFehler?: FeldFehler }>;
  onFertig: () => void;
  onAbbrechen: () => void;
}) {
  const [e, setE] = useState<KategorieEingabe>({ name: start.name, zeichen: start.zeichen, farbe: start.farbe, vorlaufMinuten: start.vorlaufMinuten });
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  const basis = useId();

  function absenden(ev: FormEvent<HTMLFormElement>): void {
    ev.preventDefault();
    setFehler(null);
    setFeldFehler({});
    setLaeuft(true);
    void senden(e)
      .then((r) => {
        if (r.ok) return onFertig();
        setFehler(r.fehler);
        setFeldFehler(r.feldFehler ?? {});
      })
      .catch(() => setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(false));
  }

  const beschriftung = { ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs } satisfies CSSProperties;
  return (
    <form onSubmit={absenden} aria-label={titel} style={{ display: "grid", gap: SPACE.md, inlineSize: "100%" }}>
      <strong style={SCHRIFT.kicker}>{titel}</strong>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      <div>
        <label htmlFor={`${basis}-name`} style={beschriftung}>
          Name
        </label>
        <Input
          id={`${basis}-name`}
          value={e.name}
          maxLength={KATEGORIE_NAME_MAX}
          showCount
          placeholder="zum Beispiel Lagemeldung"
          status={feldFehler.name ? "error" : undefined}
          onChange={(x) => setE({ ...e, name: x.target.value })}
        />
        {feldFehler.name ? <div style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>{feldFehler.name}</div> : null}
      </div>
      <div style={{ display: "grid", gap: SPACE.xs }}>
        <span style={SCHRIFT.neben} id={`${basis}-zeichen`}>
          Zeichen
        </span>
        <Radio.Group
          aria-labelledby={`${basis}-zeichen`}
          value={e.zeichen}
          optionType="button"
          onChange={(x) => setE({ ...e, zeichen: x.target.value as KategorieEingabe["zeichen"] })}
          options={ZEICHEN.map((z) => ({
            value: z,
            label: (
              <>
                <Icons8Ikone name={z} groesse={20} />
                <span className={v.versteckt}>{ZEICHEN_TEXT[z]}</span>
              </>
            ),
          }))}
        />
      </div>
      <div style={{ display: "grid", gap: SPACE.xs }}>
        <span style={SCHRIFT.neben} id={`${basis}-farbe`}>
          Farbe
        </span>
        <Radio.Group
          aria-labelledby={`${basis}-farbe`}
          value={e.farbe}
          optionType="button"
          onChange={(x) => setE({ ...e, farbe: x.target.value as KategorieEingabe["farbe"] })}
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
      <div style={{ display: "grid", gap: SPACE.xs }}>
        <span style={SCHRIFT.neben} id={`${basis}-vorlauf`}>
          Blinkt bei einer Uhrzeit zum Herunterzählen
        </span>
        <Radio.Group
          aria-labelledby={`${basis}-vorlauf`}
          value={e.vorlaufMinuten === null ? NIE : String(e.vorlaufMinuten)}
          optionType="button"
          onChange={(x) => setE({ ...e, vorlaufMinuten: x.target.value === NIE ? null : Number(x.target.value) })}
          options={VORLAEUFE.map((l) => ({ value: l.minuten === null ? NIE : String(l.minuten), label: l.text }))}
        />
      </div>
      <div style={{ display: "flex", gap: SPACE.md, alignItems: "center", flexWrap: "wrap" }}>
        <span style={SCHRIFT.neben} className={v.gedaempft}>
          So sieht es aus:
        </span>
        <KategorieMarke kategorie={{ name: e.name.trim() || "Name", zeichen: e.zeichen, farbe: e.farbe }} />
      </div>
      <div style={{ display: "flex", gap: SPACE.sm }}>
        <Button htmlType="submit" loading={laeuft}>
          {knopf}
        </Button>
        <Button onClick={onAbbrechen}>Abbrechen</Button>
      </div>
    </form>
  );
}
