"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Typography } from "antd";
import { QR_MAX_LENGTH, exceedsQrCapacity } from "@/app/m/qr/_lib/qr";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import { recordEntry } from "@/app/m/qr/_lib/history";

import { SPACE } from "@/core/theme/tokens";
export function UrlInput() {
  const [value, setValue] = useState("");
  const router = useRouter();
  // Byte-Länge, nicht value.length: ein Text aus Umlauten wäre nach Zeichen
  // gezählt längst erlaubt, während die Erzeugung ihn bereits ablehnt. Die
  // Warnung schwiege dann genau dann, wenn sie gebraucht wird.
  const tooLong = exceedsQrCapacity(value);
  const canSubmit = value.length > 0 && !tooLong;

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const payload = { kind: "url" as const, value };
        recordEntry(value, payload);
        router.push(buildQrUrl(value, payload));
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
