"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Space, Typography } from "antd";

import { WARTUNG_LINKS, type WartungsAbo } from "@/app/m/portal/_lib/serverwartung";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

const { Paragraph, Text } = Typography;

/**
 * Die Store-Seiten der ntfy-App, aus ntfys eigener Anleitung
 * (`docs/subscribe/phone.md` im Repo binwiederhier/ntfy).
 */
const STORES = [
  { titel: "Google Play", href: "https://play.google.com/store/apps/details?id=io.heckel.ntfy" },
  { titel: "F-Droid", href: "https://f-droid.org/packages/io.heckel.ntfy/" },
  { titel: "App Store (iPhone)", href: "https://apps.apple.com/app/ntfy/id1625396347" },
] as const;

/** 2 s wie der Kopierknopf in `feedback`: lang genug zum Lesen. */
const RUECKMELDUNG_MS = 2000;

/**
 * DIE ANLEITUNG ZUM WARTUNGS-ABO — eine Client-Insel aus zwei Gründen:
 * `navigator.clipboard` für den Kopierknopf und `Typography.*`, das in einer
 * Server Component HTTP 500 wäre (Falle 1). Sie bekommt nur das fertige,
 * serialisierbare Abo; ob die Person es sehen darf, hat die Seite davor
 * entschieden.
 *
 * Die Schritte sind für jemanden geschrieben, der ntfy nicht kennt und die
 * Seite am Telefon öffnet: zuerst die App, dann das Abo, dann die Erlaubnis
 * für Mitteilungen — ohne den dritten Schritt kommt auf einem frischen
 * iPhone nichts an, und niemand merkt es bis zur ersten Wartung.
 */
export function ServerwartungAnleitung({ abo }: { abo: WartungsAbo }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg, maxInlineSize: 720 }}>
      <Card title="Status und Datenvolumen" data-testid="wartung-links">
        {WARTUNG_LINKS.map((link) => (
          <Paragraph key={link.href}>
            <Text strong>{link.titel}:</Text> {link.text}
          </Paragraph>
        ))}
        <Space wrap>
          {WARTUNG_LINKS.map((link) => (
            <Button key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
              {link.titel} öffnen
            </Button>
          ))}
        </Space>
      </Card>

      <Card title="Dein Abo" data-testid="wartung-abo">
        <Paragraph>
          Das Thema ist der Name, unter dem die Nachrichten verschickt werden. Du brauchst es gleich in
          der App.
        </Paragraph>
        <div
          data-testid="wartung-thema"
          style={{ ...SCHRIFT.mono, fontSize: 14, userSelect: "all", overflowWrap: "anywhere", marginBlockEnd: SPACE.md }}
        >
          {abo.thema}
        </div>
        {!abo.standardServer && (
          <Paragraph>
            Server: <Text code>{abo.serverUrl}</Text>
          </Paragraph>
        )}
        <Space wrap>
          <KopierKnopf text={abo.thema} />
          <Button type="primary" href={abo.appLink} data-testid="wartung-app-link">
            In der ntfy-App öffnen (Android)
          </Button>
          <Button href={abo.url} target="_blank" rel="noopener noreferrer">
            Im Browser ansehen
          </Button>
        </Space>
      </Card>

      <Card title="1. App installieren">
        <Paragraph>
          Installiere die kostenlose App <Text strong>ntfy</Text> auf deinem Telefon. Ein Konto brauchst du
          dafür nicht.
        </Paragraph>
        <Space wrap>
          {STORES.map((store) => (
            <Button key={store.href} href={store.href} target="_blank" rel="noopener noreferrer">
              {store.titel}
            </Button>
          ))}
        </Space>
      </Card>

      <Card title="2. Thema abonnieren">
        <Paragraph>
          <Text strong>Android:</Text> Öffne diese Seite auf dem Telefon und tippe oben auf „In der
          ntfy-App öffnen“. Die App legt das Abo „I&amp;K Serverwartung“ von selbst an.
        </Paragraph>
        <Paragraph style={{ marginBlockEnd: SPACE.xs }}>
          <Text strong>iPhone</Text> (oder wenn der Knopf nichts tut):
        </Paragraph>
        <ol style={{ marginBlock: 0, paddingInlineStart: SPACE.xl }} data-testid="wartung-schritte">
          <li>Tippe oben auf „Kopieren“.</li>
          <li>Öffne die ntfy-App und tippe auf „+“.</li>
          <li>Füge das Thema in das Feld für den Themennamen ein.</li>
          {!abo.standardServer && (
            <li>
              Schalte „Anderen Server verwenden“ ein und trage <Text code>{abo.serverUrl}</Text> ein.
            </li>
          )}
          <li>Tippe auf „Abonnieren“ (in der englischen App „Subscribe“).</li>
        </ol>
      </Card>

      <Card title="3. Mitteilungen erlauben">
        <Paragraph style={{ marginBlockEnd: 0 }}>
          Wenn das Telefon fragt, ob ntfy Mitteilungen senden darf, tippe auf „Erlauben“. Hast du das
          verpasst, findest du den Schalter in den Einstellungen des Telefons unter Mitteilungen bzw.
          Benachrichtigungen bei ntfy.
        </Paragraph>
      </Card>

      {/* Warnung als Text mit 3px-Kante, nicht als `Alert type="error"`: das sähe
          aus wie eine Primäraktion (Falle 3). */}
      <section
        data-testid="wartung-hinweis"
        style={{ borderInlineStart: "3px solid var(--iuk-marke)", paddingInlineStart: SPACE.md }}
      >
        <Paragraph style={{ marginBlockEnd: 0 }}>
          <Text strong>Gib das Thema nicht weiter.</Text> Wer es kennt, liest mit und kann selbst
          Nachrichten an alle schicken. Wer das Abo auch braucht, bekommt die Berechtigung und findet
          dann diese Seite im Portal.
        </Paragraph>
      </section>
    </div>
  );
}

function KopierKnopf({ text }: { text: string }) {
  const [kopiert, setKopiert] = useState(false);
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (uhr.current) clearTimeout(uhr.current); }, []);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ohne Berechtigung bleibt das Thema darüber markierbar (`userSelect: all`).
      return;
    }
    setKopiert(true);
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = setTimeout(() => setKopiert(false), RUECKMELDUNG_MS);
  };

  return (
    <Button onClick={kopieren} data-testid="wartung-kopieren">
      {kopiert ? "Kopiert ✓" : "Kopieren"}
    </Button>
  );
}
