"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Typography } from "antd";
import { recordEntry } from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import type { QrPayload } from "@/app/m/qr/_lib/types";

import { SPACE } from "@/core/theme/tokens";
export default function TelPage() {
  const [number, setNumber] = useState("");
  const router = useRouter();

  const canSubmit = number.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // Ohne `tel:`-Präfix ergäbe der Code beim Scannen nur Text statt eines
    // Wählvorgangs — das Präfix setzt payloadToQrString in buildQrUrl.
    const payload: QrPayload = { kind: "tel", value: number };
    const label = `Tel: ${number}`;
    recordEntry(label, payload);
    router.push(buildQrUrl(label, payload));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
      {/* `onClick` statt `href`: ein echtes `<a>` waere eine volle
          Dokumentnavigation samt Neuhydrierung statt eines Client-Wechsels. */}
      <Button
        type="link"
        onClick={() => router.push("/")}
        style={{ alignSelf: "flex-start", padding: 0 }}
      >
        ← Zurück
      </Button>
      <Typography.Title level={4} style={{ margin: 0 }}>
        Telefonnummer
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Beim Scannen öffnet sich der Wählvorgang im Telefon.
      </Typography.Paragraph>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <label htmlFor="tel-number" style={{ fontWeight: 600 }}>
            Nummer
          </label>
          <Input
            id="tel-number"
            type="tel"
            size="large"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
            placeholder="+49 151 12345678"
          />
          <Typography.Text type="secondary">
            Internationales Format mit Ländervorwahl empfohlen (z. B. +49…).
          </Typography.Text>
        </div>

        <Button htmlType="submit" type="primary" size="large" block disabled={!canSubmit}>
          QR-Code erzeugen
        </Button>
      </form>
    </div>
  );
}
