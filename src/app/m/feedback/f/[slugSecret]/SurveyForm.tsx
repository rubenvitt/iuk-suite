"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Rate, Typography, Space, Card } from "antd";
import type { Question } from "../../_lib/questions";
import { ratingScale } from "../../_lib/questions";
import { submitResponseAction, type SubmitResult } from "../../actions";

/**
 * Klartext je Ergebniscode der Action (Entwurf 3.8). `incomplete` ist über beide
 * realen Wege unerreichbar (Lückenspringer bzw. `required`) und trägt trotzdem
 * einen Satz, falls die serverseitige letzte Linie doch greift.
 */
const MESSAGES: Record<Extract<SubmitResult, { ok: false }>["code"], string> = {
  invalid: "Dieser Link ist nicht mehr gültig.",
  none: "Für diese Gruppe läuft gerade keine Rückmeldung.",
  closed:
    "Diese Rückmeldung ist abgeschlossen. Deine Rückmeldung konnte nicht mehr gespeichert werden.",
  ratelimit:
    "Gerade sind viele Rückmeldungen gleichzeitig unterwegs. Bitte einmal auf Absenden tippen.",
  incomplete: "Da fehlten noch Noten.",
};

// `Typography.Title`, `Input.TextArea`, `Card` etc. sind hier zulässig, weil
// diese Datei "use client" ist — die Server-Component-Compound-Falle betrifft
// nur Server-Komponenten (page.tsx/layout.tsx/route.ts).
export function SurveyForm({
  slugSecret,
  groupName,
  eveningTopic,
  questions,
}: {
  slugSecret: string;
  groupName: string;
  eveningTopic: string | null;
  questions: Question[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // KEIN try/catch: die Action gibt ihr Ergebnis zurück, und ihr Erfolgs-`redirect`
  // würde von einem Catch verschluckt und als Fehler angezeigt.
  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await submitResponseAction(slugSecret, formData);
    // Erfolg heißt: die Action hat `redirect()` gerufen. Das wirft in Next intern,
    // der Client bekommt dann den Sprung und KEINEN Rückgabewert — deshalb null-safe.
    if (result && !result.ok) {
      setError(MESSAGES[result.code]);
      setPending(false);
      return;
    }
    router.push(`/f/${slugSecret}/thanks`);
  }

  return (
    <form action={onSubmit}>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <Typography.Title level={3}>{groupName}</Typography.Title>
        {eveningTopic ? <Typography.Text type="secondary">{eveningTopic}</Typography.Text> : null}
        {questions.map((q) => (
          <Card key={q.id} size="small" title={q.text}>
            {q.type === "text" ? (
              <Input.TextArea name={q.id} rows={3} />
            ) : (
              // schulnote UND stars als Sterne-Skala (Rating). name trägt die Zahl.
              <RatingField name={q.id} count={ratingScale(q.type)} />
            )}
          </Card>
        ))}
        {/* Kein `type="danger"`: colorError === colorPrimary === #c8000f, und auf
            /f/** darf diese Farbe nie auf einer Datenfläche erscheinen. */}
        {error ? <Typography.Text role="alert">{error}</Typography.Text> : null}
        <Button type="primary" htmlType="submit" loading={pending} block size="large">
          Absenden
        </Button>
      </Space>
    </form>
  );
}

function RatingField({ name, count }: { name: string; count: number }) {
  const [value, setValue] = useState(0);
  return (
    <>
      <input type="hidden" name={name} value={value || ""} />
      <Rate count={count} value={value} onChange={setValue} />
    </>
  );
}
