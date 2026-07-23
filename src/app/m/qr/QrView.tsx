"use client";

import { useSearchParams } from "next/navigation";
import { Button, Typography } from "antd";
import { QrDisplay } from "@/app/m/qr/QrDisplay";

/**
 * QR-Ansicht, der URL-Vertrag aus easy-qr: `/qr?data=…&label=…&kind=…`.
 *
 * `data` trägt den FERTIG kodierten QR-String — alle Erzeuger rufen
 * `payloadToQrString` selbst auf, bevor sie hierher navigieren. Diese Ansicht
 * kodiert deshalb nichts nach: ein zweites `tel:`-Präfix ergäbe eine Nummer,
 * die niemand erreicht, und ein `JSON.parse` scheiterte an jedem geteilten
 * WLAN-Link. Sie reicht `data` unverändert an die Anzeige durch.
 *
 * `kind` steuert allein, ob der Rohtext zusätzlich unter dem Code steht, und
 * braucht darum keine Prüfung gegen eine Liste gültiger Werte.
 *
 * Gelesen wird CLIENTSEITIG, obwohl der Plan die Server-Prop `searchParams`
 * vorsieht — sonst trägt die Offline-Zusage des Moduls nicht: Der Service
 * Worker kann "/qr" nur query-los cachen (eine Fassung pro Payload wäre
 * sinnlos), und eine serverseitig gelesene Query wäre in dieser Fassung leer.
 * Offline liefe damit jeder erzeugte Code in den Zweig „Kein Inhalt
 * übergeben". Über die Adresszeile des Browsers gelesen bedient dieselbe
 * gecachte Fassung jeden Payload.
 */
export function QrView() {
  const params = useSearchParams();
  // `get` liefert bei doppelt gesetzten Parametern (`?kind=wifi&kind=x`) von
  // sich aus den ERSTEN Wert. Das ist keine Nachlässigkeit, sondern die
  // Zusicherung, auf die es ankommt: ein durchgereichtes Array machte
  // `kind !== "wifi"` wahr und stellte die Passwort-Zeile wieder groß unter den
  // Code, und ein zweites `data` ergäbe still "tel:+49301234,x". So las easy-qr
  // über `searchParams.get()` schon immer.
  return (
    <QrViewContent
      data={params.get("data")}
      label={params.get("label")}
      kind={params.get("kind")}
    />
  );
}

/** Die reine Darstellung, getrennt von der Herkunft der Parameter — so ist der
 *  URL-Vertrag prüfbar, ohne einen Router nachzubauen. */
export function QrViewContent({
  data,
  label,
  kind,
}: {
  data: string | null;
  label: string | null;
  kind: string | null;
}) {
  if (!data) {
    return <p data-testid="qr-missing">Kein Inhalt übergeben.</p>;
  }

  // WLAN-Zeile und vCard sind Maschinentext — die WLAN-Zeile zeigte noch dazu
  // das Passwort im Klartext groß unter dem Code.
  const showRawData = kind !== "wifi" && kind !== "vcard";

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
      data-testid="qr-view"
    >
      {/* Landepunkt geteilter Links: ohne diesen Weg zurück käme man von hier
          nur über die Adresszeile zum Generator. */}
      <Button type="link" href="/" style={{ alignSelf: "flex-start", padding: 0 }}>
        ← Zurück
      </Button>
      {/* Bewusst ein natives <h1> statt `Typography.Title`: QrView.test.tsx
          durchsucht den UNGERENDERTEN Elementbaum nach `el.type === "h1"`. Ein
          Komponententyp trüge dort den Titel-Text nicht mehr, und die Zusage
          „das Label steht als Überschrift über dem Code" fiele still weg. */}
      {label ? <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{label}</h1> : null}
      <QrDisplay text={data} label={label ?? "qr"} />
      <Typography.Text type="secondary" style={{ textAlign: "center" }}>
        <strong>Helligkeit auf Maximum.</strong> Doppeltippen für Vollbild, lang drücken zum
        Invertieren.
      </Typography.Text>
      {showRawData ? (
        <Typography.Text
          type="secondary"
          data-testid="qr-raw"
          style={{
            display: "block",
            width: "100%",
            maxWidth: 448,
            textAlign: "center",
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 14,
            wordBreak: "break-all",
          }}
        >
          {data}
        </Typography.Text>
      ) : null}
    </div>
  );
}
