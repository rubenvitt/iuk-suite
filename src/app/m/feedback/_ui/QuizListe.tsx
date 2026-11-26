"use client";

import { useActionState, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { Button, Input } from "antd";
import { Kartentabelle, Zeilenaktionen, aktionsSpalte, nachText, nachZahl } from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { beendeRundeAction, legeQuizAnAction, loescheQuizAction } from "../quiz-actions";
import { MODUS_TEXT, QUIZ_FORM_START, TITEL_MAX } from "../_lib/quiz/formular";
import type { QuizModus } from "../_lib/quiz/fragen";
import { T } from "./typo";

/**
 * DIE QUIZLISTE EINER GRUPPE (Spec §5.2). Client-Insel: `columns[].render`, Zeilenaktionen mit
 * Bestätigung, `useActionState` (Falle 9, `CLAUDE.md`). Sie bekommt nur Werte; die Actions
 * importiert sie selbst.
 */

export type QuizZeile = {
  id: number;
  titel: string;
  modus: QuizModus;
  fragen: number;
  /** Die Runde von heute: `laeuft`, `beendet` oder keine. */
  heute: "laeuft" | "beendet" | null;
};

const HEUTE_TEXT = { laeuft: "läuft", beendet: "beendet" } as const;
const FELD: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.xs };

function formular(quizId: number): FormData {
  const f = new FormData();
  f.set("quizId", String(quizId));
  return f;
}

export function QuizListe({ groupId, zeilen }: { groupId: number; zeilen: QuizZeile[] }) {
  const [laeuft, setLaeuft] = useState<number | null>(null);
  const [, starte] = useTransition();
  const editor = (id: number) => `/m/feedback/groups/${groupId}/quiz/${id}`;

  const ausfuehren = (id: number, action: (f: FormData) => Promise<void>) =>
    new Promise<void>((fertig, fehler) => {
      setLaeuft(id);
      starte(async () => {
        try {
          await action(formular(id));
          fertig();
        } catch (e) {
          fehler(e);
        } finally {
          setLaeuft(null);
        }
      });
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xl }}>
      <QuizAnlegen groupId={groupId} />
      <Kartentabelle<QuizZeile>
        rowKey="id"
        aria-label="Quizze"
        dataSource={zeilen}
        leer={{ nichts: "Noch kein Quiz. Leg oben eins an." }}
        columns={[
          {
            title: "Titel",
            key: "titel",
            sorter: nachText<QuizZeile>((z) => z.titel),
            render: (_: unknown, z: QuizZeile) => <Link href={editor(z.id)}>{z.titel}</Link>,
          },
          {
            title: "Modus",
            key: "modus",
            render: (_: unknown, z: QuizZeile) => <span style={T.body}>{MODUS_TEXT[z.modus]}</span>,
          },
          {
            title: "Fragen",
            key: "fragen",
            sorter: nachZahl<QuizZeile>((z) => z.fragen),
            render: (_: unknown, z: QuizZeile) => <span style={T.body}>{z.fragen}</span>,
          },
          {
            title: "Heute",
            key: "heute",
            render: (_: unknown, z: QuizZeile) => (
              <span style={T.body}>{z.heute === null ? "–" : HEUTE_TEXT[z.heute]}</span>
            ),
          },
          aktionsSpalte<QuizZeile>((z) => {
            const bearbeiten = { key: "bearbeiten", label: "Bearbeiten", ikone: "pencil" as const, href: editor(z.id) };
            const beenden = {
              key: "beenden",
              label: "Quiz beenden",
              onClick: () => ausfuehren(z.id, beendeRundeAction),
              bestaetigen: {
                titel: "Quiz beenden?",
                text: "Danach kann niemand mehr beitreten oder antworten. Die Auswertung bleibt erhalten.",
                ok: "Beenden",
              },
            };
            const loeschen = {
              key: "loeschen",
              label: "Löschen",
              ikone: "trash" as const,
              danger: true,
              onClick: () => ausfuehren(z.id, loescheQuizAction),
              bestaetigen: {
                titel: `„${z.titel}“ löschen?`,
                text:
                  (z.heute === "laeuft" ? "Die laufende Runde wird beendet. " : "") +
                  "Vergangene Runden und ihre Auswertung bleiben erhalten.",
                ok: "Löschen",
              },
            };
            return (
              <Zeilenaktionen
                name={z.titel}
                laeuft={laeuft === z.id}
                haupt={z.heute === "laeuft" ? beenden : bearbeiten}
                aktionen={z.heute === "laeuft" ? [bearbeiten, loeschen] : [loeschen]}
              />
            );
          }),
        ]}
      />
    </div>
  );
}

function QuizAnlegen({ groupId }: { groupId: number }) {
  const [state, formAction, isPending] = useActionState(legeQuizAnAction, QUIZ_FORM_START);
  const fehler = state.ok ? undefined : state.fieldErrors.titel;
  return (
    <form
      action={formAction}
      style={{ display: "flex", gap: SPACE.sm, alignItems: "flex-end", flexWrap: "wrap" }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <label style={{ ...FELD, flex: "1 1 240px", maxWidth: 420 }}>
        <span style={T.kicker}>Neues Quiz</span>
        <Input
          name="titel"
          placeholder="Titel"
          maxLength={TITEL_MAX}
          defaultValue={state.ok ? "" : (state.values.titel ?? "")}
          status={fehler ? "error" : undefined}
          aria-invalid={fehler ? true : undefined}
          aria-describedby={fehler ? "quiz-neu-err" : undefined}
        />
      </label>
      <Button type="primary" htmlType="submit" loading={isPending} disabled={isPending} className="fb-block-mobil">
        Quiz anlegen
      </Button>
      {fehler && (
        <span id="quiz-neu-err" style={{ ...T.meta, flexBasis: "100%" }}>
          {fehler}
        </span>
      )}
    </form>
  );
}
