"use client";

import { useActionState, useRef, useState, useTransition, type CSSProperties } from "react";
import { Button, Card, Checkbox, Input, InputNumber, Popconfirm, Radio, Select } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { SPACE } from "@/core/theme/tokens";
import { rotiereSecretAction, speichereQuizAction } from "../quiz-actions";
import type { QuizFrage, QuizModus } from "../_lib/quiz/fragen";
import { MAX_FRAGEN } from "../_lib/quiz/fragen";
import { schrittAnzahl } from "../_lib/quiz/ablauf";
import {
  BEAMER_WARNUNG,
  MODUS_ERKLAERUNG,
  MODUS_TEXT,
  QUIZ_FORM_START,
  TITEL_MAX,
  slidevKlicks,
  slidevSchnipsel,
} from "../_lib/quiz/formular";
import { KopierZeile } from "./KopierZeile";
import { T } from "./typo";

/**
 * DER QUIZ-EDITOR (Spec §5.2, Zeile „Admin: Quiz-Verwaltung").
 *
 * Client-Insel: `useActionState`, `Popconfirm`, die Fragenliste als Zustand. Sie bekommt nur
 * Werte (Falle 6/9, `CLAUDE.md`), die Actions importiert sie selbst.
 *
 * Die Fragen gehen als JSON im versteckten Feld `fragen` an die Action; geprüft wird dort mit
 * `pruefeFragen`, und jeder Fehler kommt als Satz zurück („Frage 3: …"). Die Karten tragen
 * deshalb dieselbe Nummer.
 *
 * DER SCHNIPSEL LIEST DEN GESPEICHERTEN STAND (Props), nicht den Entwurf: die Runde nimmt den
 * Schnappschuss der gespeicherten Vorlage, und eine Klickzahl aus ungespeicherten Fragen wäre
 * im Foliensatz falsch. Weicht der Entwurf ab, sagt eine Zeile das.
 */

export type QuizEditorProps = {
  quizId: number;
  titel: string;
  modus: QuizModus;
  fragen: QuizFrage[];
  /** Vollständige Beamer-Adresse, gebaut in der Seite (`_lib/quiz/adresse.ts`). */
  beamerUrl: string;
};

type Typ = QuizFrage["typ"];

type Entwurf = {
  key: number;
  text: string;
  typ: Typ;
  optionen: string[];
  richtig: number[];
  zeit: number | null;
  erklaerung: string;
};

const WAHR_FALSCH = ["Wahr", "Falsch"];
const MIN_OPTIONEN = 2;
const MAX_OPTIONEN = 6;

const TYP_OPTIONEN: { value: Typ; label: string }[] = [
  { value: "einfach", label: "Eine Antwort" },
  { value: "mehrfach", label: "Mehrere Antworten" },
  { value: "wahrfalsch", label: "Wahr oder falsch" },
];

const FELD: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.xs };
const MONO: CSSProperties = {
  background: "var(--fb-tint)",
  padding: "8px 12px",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  wordBreak: "break-all",
  userSelect: "all",
  margin: 0,
};

/** Was an die Action geht: getrimmt, leere Zeit und leere Erklärung fehlen. */
function alsFrage(e: Entwurf): QuizFrage {
  const f: QuizFrage = {
    text: e.text.trim(),
    typ: e.typ,
    optionen: e.typ === "wahrfalsch" ? [...WAHR_FALSCH] : e.optionen.map((o) => o.trim()),
    richtig: [...e.richtig].sort((a, b) => a - b),
  };
  if (e.zeit !== null) f.zeit_s = e.zeit;
  const erklaerung = e.erklaerung.trim();
  if (erklaerung !== "") f.erklaerung = erklaerung;
  return f;
}

function ausFrage(f: QuizFrage, key: number): Entwurf {
  return {
    key,
    text: f.text,
    typ: f.typ,
    optionen: [...f.optionen],
    richtig: [...f.richtig],
    zeit: f.zeit_s ?? null,
    erklaerung: f.erklaerung ?? "",
  };
}

function mitTyp(e: Entwurf, typ: Typ): Entwurf {
  if (typ === "wahrfalsch") return { ...e, typ, optionen: [...WAHR_FALSCH], richtig: e.richtig[0] === 1 ? [1] : [0] };
  if (typ === "einfach") return { ...e, typ, richtig: e.richtig.slice(0, 1) };
  return { ...e, typ };
}

function umschalten(e: Entwurf, i: number): Entwurf {
  if (e.typ !== "mehrfach") return { ...e, richtig: [i] };
  return { ...e, richtig: e.richtig.includes(i) ? e.richtig.filter((r) => r !== i) : [...e.richtig, i] };
}

function ohneOption(e: Entwurf, i: number): Entwurf {
  return {
    ...e,
    optionen: e.optionen.filter((_, j) => j !== i),
    richtig: e.richtig.filter((r) => r !== i).map((r) => (r > i ? r - 1 : r)),
  };
}

export function QuizEditor({ quizId, titel, modus, fragen, beamerUrl }: QuizEditorProps) {
  const naechsterKey = useRef(fragen.length);
  const [entwurf, setEntwurf] = useState<Entwurf[]>(() => fragen.map((f, i) => ausFrage(f, i)));
  const [titelWert, setTitelWert] = useState(titel);
  const [modusWert, setModusWert] = useState<QuizModus>(modus);
  const [state, formAction, isPending] = useActionState(speichereQuizAction, QUIZ_FORM_START);

  const gespeicherteKlicks = slidevKlicks(schrittAnzahl(fragen.length, modus));
  const entwurfKlicks = slidevKlicks(schrittAnzahl(entwurf.length, modusWert));
  const serialisiert = JSON.stringify(entwurf.map(alsFrage));

  const aendere = (i: number, f: (e: Entwurf) => Entwurf) =>
    setEntwurf((liste) => liste.map((e, j) => (j === i ? f(e) : e)));
  const verschiebe = (i: number, um: -1 | 1) =>
    setEntwurf((liste) => {
      const ziel = i + um;
      if (ziel < 0 || ziel >= liste.length) return liste;
      const neu = [...liste];
      [neu[i], neu[ziel]] = [neu[ziel]!, neu[i]!];
      return neu;
    });
  const entferne = (i: number) => setEntwurf((liste) => liste.filter((_, j) => j !== i));
  const hinzufuegen = () =>
    setEntwurf((liste) => [
      ...liste,
      { key: naechsterKey.current++, text: "", typ: "einfach", optionen: ["", ""], richtig: [], zeit: null, erklaerung: "" },
    ]);

  const titelFehler = state.ok ? undefined : state.fieldErrors.titel;
  const modusFehler = state.ok ? undefined : state.fieldErrors.modus;
  const fragenFehler = state.ok ? undefined : state.fieldErrors.fragen;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xl }}>
      <BeamerZugang quizId={quizId} beamerUrl={beamerUrl} clicks={gespeicherteKlicks} />
      {entwurfKlicks !== gespeicherteKlicks && (
        <p style={{ ...T.meta, margin: `-${SPACE.md}px 0 0` }}>
          Du hast Fragen oder den Modus geändert. Speichere zuerst, dann stimmt die Klickzahl im Schnipsel.
        </p>
      )}

      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: SPACE.xl }}>
        <input type="hidden" name="quizId" value={quizId} />
        <input type="hidden" name="modus" value={modusWert} />
        <input type="hidden" name="fragen" value={serialisiert} />

        <label style={FELD}>
          <span style={T.kicker}>Titel</span>
          <Input
            name="titel"
            value={titelWert}
            maxLength={TITEL_MAX}
            onChange={(e) => setTitelWert(e.target.value)}
            status={titelFehler ? "error" : undefined}
            aria-invalid={titelFehler ? true : undefined}
            aria-describedby={titelFehler ? "quiz-titel-err" : undefined}
          />
          {titelFehler && (
            <span id="quiz-titel-err" style={T.meta}>
              {titelFehler}
            </span>
          )}
        </label>

        <div style={FELD}>
          <span id="quiz-modus-kopf" style={T.kicker}>
            Modus
          </span>
          <Radio.Group
            value={modusWert}
            aria-labelledby="quiz-modus-kopf"
            onChange={(e) => setModusWert(e.target.value as QuizModus)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
              {(["lagebild", "wettbewerb"] as const).map((m) => (
                <Radio key={m} value={m}>
                  <span style={T.body}>{MODUS_TEXT[m]}</span>
                  <span style={{ ...T.meta, display: "block" }}>{MODUS_ERKLAERUNG[m]}</span>
                </Radio>
              ))}
            </div>
          </Radio.Group>
          {modusFehler && <span style={T.meta}>{modusFehler}</span>}
        </div>

        <section aria-labelledby="quiz-fragen-kopf" style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
          <h2 id="quiz-fragen-kopf" style={{ ...T.h2, margin: 0 }}>
            Fragen
          </h2>
          {entwurf.length === 0 && (
            <p style={{ ...T.meta, margin: 0 }}>Noch keine Fragen. Ohne Fragen lässt sich das Quiz nicht starten.</p>
          )}
          {entwurf.map((e, i) => (
            <FrageKarte
              key={e.key}
              nr={i + 1}
              anzahl={entwurf.length}
              frage={e}
              aendere={(f) => aendere(i, f)}
              hoch={() => verschiebe(i, -1)}
              runter={() => verschiebe(i, 1)}
              entferne={() => entferne(i)}
            />
          ))}
          <div>
            <Button
              onClick={hinzufuegen}
              disabled={entwurf.length >= MAX_FRAGEN}
              icon={<Icons8Ikone name="plus" groesse={16} />}
              className="fb-block-mobil"
            >
              Frage hinzufügen
            </Button>
          </div>
        </section>

        {fragenFehler && fragenFehler.length > 0 && (
          <div role="alert" style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
            <span style={{ ...T.body, fontWeight: 600 }}>Das Quiz ist noch nicht gespeichert:</span>
            <ul style={{ ...T.meta, margin: 0, paddingInlineStart: 20 }}>
              {fragenFehler.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: SPACE.md, flexWrap: "wrap" }}>
          <Button type="primary" htmlType="submit" loading={isPending} disabled={isPending} className="fb-block-mobil">
            Speichern
          </Button>
          {state.ok && state.gespeichert && !isPending && (
            <span role="status" style={T.meta}>
              Gespeichert.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function FrageKarte({
  nr,
  anzahl,
  frage,
  aendere,
  hoch,
  runter,
  entferne,
}: {
  nr: number;
  anzahl: number;
  frage: Entwurf;
  aendere: (f: (e: Entwurf) => Entwurf) => void;
  hoch: () => void;
  runter: () => void;
  entferne: () => void;
}) {
  const wahrFalsch = frage.typ === "wahrfalsch";
  return (
    <Card
      variant="outlined"
      title={`Frage ${nr}`}
      extra={
        <span style={{ display: "inline-flex", gap: SPACE.xs }}>
          <Button
            type="text"
            aria-label={`Frage ${nr} nach oben`}
            disabled={nr === 1}
            onClick={hoch}
            icon={<Icons8Ikone name="arrow-up" groesse={16} />}
          />
          <Button
            type="text"
            aria-label={`Frage ${nr} nach unten`}
            disabled={nr === anzahl}
            onClick={runter}
            icon={<Icons8Ikone name="arrow-down" groesse={16} />}
          />
          <Popconfirm
            title={`Frage ${nr} entfernen?`}
            okText="Entfernen"
            cancelText="Abbrechen"
            onConfirm={entferne}
          >
            <Button type="text" aria-label={`Frage ${nr} entfernen`} icon={<Icons8Ikone name="trash" groesse={16} />} />
          </Popconfirm>
        </span>
      }
      styles={{ body: { padding: "var(--fb-kartenpolster)", display: "flex", flexDirection: "column", gap: SPACE.lg } }}
    >
      <label style={FELD}>
        <span style={T.kicker}>Frage</span>
        <Input.TextArea
          value={frage.text}
          autoSize={{ minRows: 1, maxRows: 4 }}
          maxLength={300}
          onChange={(ev) => aendere((e) => ({ ...e, text: ev.target.value }))}
        />
      </label>

      <label style={FELD}>
        <span style={T.kicker}>Antwortart</span>
        <Select<Typ>
          value={frage.typ}
          options={TYP_OPTIONEN}
          onChange={(typ) => aendere((e) => mitTyp(e, typ))}
          style={{ maxWidth: 280 }}
          aria-label={`Antwortart von Frage ${nr}`}
        />
      </label>

      <fieldset style={{ ...FELD, border: 0, padding: 0, margin: 0 }}>
        <legend style={{ ...T.kicker, padding: 0, marginBottom: SPACE.xs }}>Antworten</legend>
        {frage.optionen.map((o, j) => (
          <div key={j} style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
            <Checkbox
              checked={frage.richtig.includes(j)}
              onChange={() => aendere((e) => umschalten(e, j))}
              aria-label={`Antwort ${j + 1} ist richtig`}
            >
              richtig
            </Checkbox>
            <Input
              value={o}
              readOnly={wahrFalsch}
              maxLength={120}
              aria-label={`Antwort ${j + 1}`}
              onChange={(ev) =>
                aendere((e) => ({ ...e, optionen: e.optionen.map((x, k) => (k === j ? ev.target.value : x)) }))
              }
            />
            {!wahrFalsch && frage.optionen.length > MIN_OPTIONEN && (
              <Button
                type="text"
                aria-label={`Antwort ${j + 1} entfernen`}
                onClick={() => aendere((e) => ohneOption(e, j))}
                icon={<Icons8Ikone name="minus-circle" groesse={16} />}
              />
            )}
          </div>
        ))}
        {!wahrFalsch && frage.optionen.length < MAX_OPTIONEN && (
          <div>
            <Button
              type="text"
              onClick={() => aendere((e) => ({ ...e, optionen: [...e.optionen, ""] }))}
              icon={<Icons8Ikone name="plus" groesse={16} />}
            >
              Antwort hinzufügen
            </Button>
          </div>
        )}
      </fieldset>

      <label style={FELD}>
        <span style={T.kicker}>Zeit</span>
        <InputNumber
          value={frage.zeit}
          step={5}
          suffix="Sekunden"
          placeholder="ohne Zeitlimit"
          style={{ width: "100%", maxWidth: 240 }}
          onChange={(v) => aendere((e) => ({ ...e, zeit: typeof v === "number" ? v : null }))}
        />
        <span style={T.meta}>Leer lassen: die Frage bleibt offen, bis du weiterklickst. Sonst 5 bis 300 Sekunden.</span>
      </label>

      <label style={FELD}>
        <span style={T.kicker}>Erklärung (optional)</span>
        <Input.TextArea
          value={frage.erklaerung}
          autoSize={{ minRows: 1, maxRows: 4 }}
          onChange={(ev) => aendere((e) => ({ ...e, erklaerung: ev.target.value }))}
        />
        <span style={T.meta}>Erscheint bei der Auflösung.</span>
      </label>
    </Card>
  );
}

/** Beamer-Adresse, Warnung (§5.6), Slidev-Schnipsel (§5.5) und „Adresse neu erzeugen". */
function BeamerZugang({ quizId, beamerUrl, clicks }: { quizId: number; beamerUrl: string; clicks: number }) {
  const [laeuft, starte] = useTransition();
  const schnipsel = slidevSchnipsel(clicks, beamerUrl);

  const neuErzeugen = () =>
    starte(async () => {
      const daten = new FormData();
      daten.set("quizId", String(quizId));
      await rotiereSecretAction(daten);
    });

  return (
    <Card
      variant="outlined"
      title="BEAMER"
      styles={{
        header: { ...T.kicker, minHeight: 40, paddingInline: 20, borderBottomColor: "var(--fb-split)" },
        body: { padding: "var(--fb-kartenpolster)", display: "flex", flexDirection: "column", gap: SPACE.lg },
      }}
    >
      <div role="group" aria-label="Beamer-Adresse" style={FELD}>
        <span style={T.kicker}>Adresse</span>
        <p data-testid="beamer-url" style={MONO}>
          {beamerUrl}
        </p>
        <p style={{ ...T.body, margin: 0, display: "flex", gap: SPACE.sm, alignItems: "flex-start" }}>
          <Icons8Ikone name="warning" groesse={18} style={{ marginTop: 2 }} />
          <span>{BEAMER_WARNUNG}</span>
        </p>
        <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
          <KopierZeile url={beamerUrl} />
          <Popconfirm
            title="Adresse neu erzeugen?"
            description="Die alte Adresse steuert danach nichts mehr. Trag die neue in deine Foliensätze ein."
            okText="Adresse neu erzeugen"
            cancelText="Abbrechen"
            okButtonProps={{ danger: true, loading: laeuft }}
            onConfirm={neuErzeugen}
          >
            <Button danger loading={laeuft} className="fb-block-mobil">
              Adresse neu erzeugen
            </Button>
          </Popconfirm>
        </div>
      </div>

      <div role="group" aria-label="Slidev-Schnipsel" style={FELD}>
        <span style={T.kicker}>Für Slidev</span>
        <span style={T.meta}>
          Eine eigene Folie in deinem Foliensatz. Klick 0 zeigt die Lobby, jeder weitere Klick den nächsten Schritt.
        </span>
        <pre data-testid="slidev-schnipsel" style={{ ...MONO, whiteSpace: "pre-wrap" }}>
          {schnipsel}
        </pre>
        <div>
          <KopierZeile url={schnipsel} />
        </div>
      </div>
    </Card>
  );
}
