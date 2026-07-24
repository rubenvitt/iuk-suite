"use client";
import { Button, Input, Space, Tag } from "antd";
import { SPACE } from "@/core/theme/tokens";
import type { SurveyStatus } from "../_lib/lifecycle";
import {
  createSurveyAction,
  activateSurveyAction,
  closeSurveyAction,
  archiveSurveyAction,
} from "../actions";

const STATUS_LABEL: Record<SurveyStatus, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  closed: "Geschlossen",
  archived: "Archiviert",
};

const STATUS_COLOR: Record<SurveyStatus, string> = {
  draft: "default",
  active: "green",
  closed: "orange",
  archived: "default",
};

// Genau ein Aktions-Button pro Status: die Server Actions selbst validieren
// keinen Statusübergang (setSurveyStatus schreibt jeden übergebenen Status),
// die Beschränkung "nur der sinnvolle nächste Schritt" ist Sache dieser UI.
export function SurveyControls({
  eveningId,
  survey,
}: {
  eveningId: number;
  survey: { id: number; status: SurveyStatus } | null;
}) {
  if (!survey) {
    return (
      <form action={createSurveyAction}>
        <input type="hidden" name="eveningId" value={eveningId} />
        <Space orientation="horizontal" size={SPACE.sm} wrap>
          <Input name="closeAfterHours" placeholder="Frist (h, optional)" type="number" />
          <Button htmlType="submit" type="primary">
            Umfrage erstellen
          </Button>
        </Space>
      </form>
    );
  }

  return (
    <Space orientation="vertical" size={SPACE.sm}>
      <Tag color={STATUS_COLOR[survey.status]}>{STATUS_LABEL[survey.status]}</Tag>
      {survey.status === "draft" && (
        <form action={activateSurveyAction}>
          <input type="hidden" name="id" value={survey.id} />
          <Button htmlType="submit" type="primary">
            Aktivieren
          </Button>
        </form>
      )}
      {survey.status === "active" && (
        <form action={closeSurveyAction}>
          <input type="hidden" name="id" value={survey.id} />
          <Button htmlType="submit" danger>
            Schließen
          </Button>
        </form>
      )}
      {survey.status === "closed" && (
        <form action={archiveSurveyAction}>
          <input type="hidden" name="id" value={survey.id} />
          <Button htmlType="submit">Archivieren</Button>
        </form>
      )}
    </Space>
  );
}
