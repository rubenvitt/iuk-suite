"use client";

/**
 * DIE MÄNGEL IN DER VERWALTUNG (IDA-298) — eine Karte je Meldung, mit Fotos, Erledigen und Wieder öffnen.
 *
 * Bekommt nur serialisierbare Props (Falle 9); die Zeiten formatiert der Server in der Suite-Zone.
 */
import { useState, useTransition } from "react";
import { App, Button, Card, Empty, Flex, Image, Input, Modal, Tag, Typography } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { mangelErledigen, mangelWiederOeffnen } from "../../../_actions/maengel";
import { VERMERK_MAX } from "../../../_lib/maengel/meldung";
import { mangelFotoPfad } from "../../../_lib/verwaltungPfad";

export interface MangelKarte {
  id: string;
  ort: string;
  ortAktiv: boolean;
  punkte: string[];
  beschreibung: string | null;
  melderName: string | null;
  fotos: number;
  gemeldet: string;
  erledigt: string | null;
  erledigtVermerk: string | null;
}

function Fotos({ m }: { m: MangelKarte }) {
  if (m.fotos === 0) return null;
  return (
    <Image.PreviewGroup>
      <Flex gap={SPACE.sm} wrap>
        {Array.from({ length: m.fotos }, (_, n) => (
          <Image
            key={n}
            src={mangelFotoPfad(m.id, n)}
            alt={`Foto ${n + 1} zum Mangel an ${m.ort}`}
            width={96}
            height={96}
            style={{ objectFit: "cover", borderRadius: 8 }}
          />
        ))}
      </Flex>
    </Image.PreviewGroup>
  );
}

function Inhalt({ m }: { m: MangelKarte }) {
  return (
    <Flex vertical gap={SPACE.sm}>
      {m.punkte.length > 0 && (
        <Flex gap={SPACE.xs} wrap>
          {m.punkte.map((p) => <Tag key={p}>{p}</Tag>)}
        </Flex>
      )}
      {m.beschreibung && <Typography.Paragraph style={{ marginBlockEnd: 0, whiteSpace: "pre-wrap" }}>{m.beschreibung}</Typography.Paragraph>}
      <Fotos m={m} />
      <Typography.Text type="secondary">
        Gemeldet {m.gemeldet}{m.melderName ? ` von ${m.melderName}` : ""}
        {m.ortAktiv ? "" : " · Ort ist stillgelegt"}
      </Typography.Text>
    </Flex>
  );
}

export function OffeneMaengel({ maengel }: { maengel: MangelKarte[] }) {
  const { message } = App.useApp();
  const [offen, setOffen] = useState<MangelKarte | null>(null);
  const [vermerk, setVermerk] = useState("");
  const [laeuft, start] = useTransition();

  if (maengel.length === 0) return <Empty description="Kein offener Mangel." />;

  function erledigen(): void {
    if (!offen) return;
    start(async () => {
      const r = await mangelErledigen({ id: offen.id, vermerk }).catch(() => ({ ok: false as const, fehler: "Keine Verbindung." }));
      if (r.ok) {
        void message.success(`Mangel an ${offen.ort} erledigt.`);
        setOffen(null);
        setVermerk("");
      } else {
        void message.warning(r.fehler);
      }
    });
  }

  return (
    <>
      <Flex vertical gap={SPACE.md} data-rolle="maengel-offen">
        {maengel.map((m) => (
          <Card
            key={m.id}
            title={m.ort}
            extra={<Button onClick={() => { setOffen(m); setVermerk(""); }}>Erledigt</Button>}
            data-rolle="mangel-karte"
          >
            <Inhalt m={m} />
          </Card>
        ))}
      </Flex>
      <Modal
        open={offen !== null}
        title={offen ? `Mangel an ${offen.ort} erledigt` : undefined}
        okText="Als erledigt vermerken"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onOk={erledigen}
        onCancel={() => setOffen(null)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">Was wurde gemacht? Freiwillig, hilft beim nächsten Mal.</Typography.Paragraph>
        <Input.TextArea
          aria-label="Vermerk"
          value={vermerk}
          maxLength={VERMERK_MAX}
          autoSize={{ minRows: 2, maxRows: 6 }}
          placeholder="Zum Beispiel: Glühbirne getauscht"
          onChange={(e) => setVermerk(e.target.value)}
        />
      </Modal>
    </>
  );
}

export function ErledigteMaengel({ maengel }: { maengel: MangelKarte[] }) {
  const { message } = App.useApp();
  const [laeuft, start] = useTransition();

  if (maengel.length === 0) return <Empty description="Noch nichts erledigt." />;

  function wiederOeffnen(m: MangelKarte): void {
    start(async () => {
      const r = await mangelWiederOeffnen({ id: m.id }).catch(() => ({ ok: false as const, fehler: "Keine Verbindung." }));
      if (r.ok) void message.success(`Mangel an ${m.ort} ist wieder offen.`);
      else void message.warning(r.fehler);
    });
  }

  return (
    <Flex vertical gap={SPACE.md} data-rolle="maengel-erledigt">
      {maengel.map((m) => (
        <Card
          key={m.id}
          title={m.ort}
          extra={<Button type="link" disabled={laeuft} onClick={() => wiederOeffnen(m)}>Wieder öffnen</Button>}
        >
          <Inhalt m={m} />
          <Typography.Paragraph style={{ marginBlock: `${SPACE.sm}px 0` }}>
            Erledigt {m.erledigt}{m.erledigtVermerk ? `: ${m.erledigtVermerk}` : ""}
          </Typography.Paragraph>
        </Card>
      ))}
    </Flex>
  );
}
