"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Rate, Typography, Space, Card } from "antd";
import type { Question } from "../../_lib/questions";
import { ratingScale } from "../../_lib/questions";
import { submitResponseAction } from "../../actions";

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

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await submitResponseAction(slugSecret, formData);
      router.push(`/f/${slugSecret}/thanks`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Absenden");
      setPending(false);
    }
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
        {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
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
