"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Typography } from "antd";
import { QR_MAX_LENGTH, exceedsQrCapacity } from "@/app/m/qr/_lib/qr";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import { recordEntry } from "@/app/m/qr/_lib/history";
import { ergaenzeSchemaWennAdresse } from "@/app/m/qr/_lib/url";

import { SPACE } from "@/core/theme/tokens";
export function UrlInput() {
  const [value, setValue] = useState("");
  const router = useRouter();
  // Byte-Länge, nicht value.length: ein Text aus Umlauten wäre nach Zeichen
  // gezählt längst erlaubt, während die Erzeugung ihn bereits ablehnt. Die
  // Warnung schwiege dann genau dann, wenn sie gebraucht wird.
  // „drk.de" wird https://drk.de — ohne Schema zeigt mancher Scanner nur Text (`_lib/url.ts`).
  // Ein Satz bleibt, wie er ist: das Feld nimmt auch freien Text. Gemessen wird der fertige Inhalt.
  const inhalt = ergaenzeSchemaWennAdresse(value);
  const tooLong = exceedsQrCapacity(inhalt);
  const canSubmit = value.length > 0 && !tooLong;

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const payload = { kind: "url" as const, value: inhalt };
        recordEntry(inhalt, payload);
        router.push(buildQrUrl(inhalt, payload));
      }}
    >
      <label htmlFor="qr-url" style={{ fontWeight: 600 }}>
        Link oder Text
      </label>
      <Input
        id="qr-url"
        size="large"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        placeholder="https://…"
      />
      {tooLong ? (
        <Typography.Text type="danger" data-testid="too-long">
          Zu lang für einen QR-Code (max. {QR_MAX_LENGTH} Bytes — Umlaute zählen doppelt, Emoji
          vierfach).
        </Typography.Text>
      ) : null}
      <Button htmlType="submit" type="primary" size="large" block disabled={!canSubmit}>
        QR-Code erzeugen
      </Button>
    </form>
  );
}
