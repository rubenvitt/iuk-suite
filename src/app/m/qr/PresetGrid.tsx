"use client";

import { useRouter } from "next/navigation";
import { Button, Col, Row, Typography } from "antd";
import { recordEntry } from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import type { Preset } from "@/app/m/qr/_lib/types";

/** Client-Komponente, weil ein Tipp in den Verlauf schreibt und dann
 *  navigiert — beides gibt es auf dem Server nicht. */
export function PresetGrid({ presets }: { presets: Preset[] }) {
  const router = useRouter();
  if (presets.length === 0) return null;

  function open(p: Preset) {
    // `p` ist ein Preset, also ein QrPayload mit Zusatzfeldern — buildQrUrl
    // kodiert daraus denselben String, den auch die Formulare erzeugen.
    recordEntry(p.label, p);
    router.push(buildQrUrl(p.label, p));
  }

  return (
    <section
      aria-label="Schnellzugriffe"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <Typography.Title level={5} style={{ margin: 0 }}>
        Schnellzugriffe
      </Typography.Title>
      <Row gutter={[12, 12]} data-testid="preset-grid">
        {presets.map((p) => (
          <Col key={p.id} xs={12} sm={8}>
            {/* Bleibt ein echter <button>: PresetGrid.test.tsx klickt die Kachel an. */}
            <Button
              block
              onClick={() => open(p)}
              data-testid="preset-tile"
              style={{
                height: 128,
                whiteSpace: "normal",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 30, lineHeight: 1 }}>
                {p.icon ?? p.label.charAt(0).toUpperCase()}
              </span>
              <span>{p.label}</span>
            </Button>
          </Col>
        ))}
      </Row>
    </section>
  );
}
