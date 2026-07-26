import type { CSSProperties } from "react";
import { Button, Card, Space } from "antd";
import { resolveHost } from "@/core/routing";
import { T } from "./typo";
import { KopierZeile } from "./KopierZeile";

/**
 * ZONE a — TEILNAHME (Entwurf §2.4). Der Daseinsgrund des Werkzeugs.
 *
 * Die Zusage, die den Wochenaufwand von „QR erzeugen" auf „nichts" senkt: der
 * Code hängt an der GRUPPE, nicht am Abend. Die öffentliche Route löst immer die
 * gerade aktive Umfrage auf — der Code ist damit ein permanentes Druckstück.
 * Genau das sagt die Karte auch wörtlich, sonst druckt jemand jede Woche neu.
 *
 * Deshalb ist die Zone in allen vier Belegungen IDENTISCH und steht auch dann
 * da, wenn keine Umfrage läuft. Einzige Variante: Belegung A (Gruppe ganz neu)
 * trägt als erste Zeile den Hinweis, dass man schon vorher drucken kann.
 *
 * SERVER COMPONENT. Kein Compound-Zugriff auf antd (§4.13), Kartentitel als
 * String, `Space` mit `wrap` (und nie `direction` — antd 6 nennt es
 * `orientation`). Interaktiv ist genau eine Insel: `KopierZeile`.
 *
 * WARUM HIER KEIN „QR-CODE GROSS ZEIGEN": §2.4 sagt es ausdrücklich — „Der
 * zeitkritische Handgriff im Gruppenraum ist NICHT diese Karte, sondern
 * ‚QR-Code groß zeigen' in der Lagekarte — in jedem Zustand ein Tipp weit oben
 * (J-B-2)." Die zweite Client-Insel des Zonen-Konzepts (`QrGross`) hängt also an
 * `Lagekarte.tsx`, nicht hier: ein zweiter, identischer Knopf 20 cm daneben wäre
 * genau die Doppelung, gegen die J-B-2 argumentiert.
 *
 * KEIN TOTLAUF-HINWEIS („jemand scannt an einem Abend ohne laufendes Feedback"):
 * das ist gelöst, und zwar in der öffentlichen Ansicht (Zustand C, „Der QR-Code
 * bleibt gültig …"). Eine Warnung auf der Admin-Karte wäre eine zweite Wahrheit.
 */

/**
 * DIE EINE HERLEITUNG DER ÖFFENTLICHEN ADRESSE.
 *
 * NICHT über `moduleUrl("feedback")`: die Registry führt `feedback` mit
 * `prodHosts: []`, `moduleUrl` liefert in Prod also `null`. NICHT über eine
 * Anfrage-URL: nach dem Host-Rewrite der Middleware (proxy.ts/decideRoute) zeigt
 * sie auf die interne next-Adresse — ein gedruckter QR-Code würde dann auf eine
 * unerreichbare Adresse zeigen, und das fällt erst AN DER WAND auf.
 *
 * Der Host kommt deshalb aus den Headern, und die Vorrangregel
 * (`x-forwarded-host` vor `host`, bei Kommaliste der erste Wert) kommt aus
 * `core/routing.resolveHost` — WIEDERVERWENDET, weil eine zweite Auflösung genau
 * der Ort wäre, an dem beide auseinanderlaufen. Dieselbe Regel nutzt die
 * `qr.png`-Route schon.
 *
 * Das Protokoll folgt derselben Beobachtung: `x-forwarded-proto`, sonst `http`.
 * Der Rückfall ist nicht geraten, sondern der beobachtbare Wert der
 * `qr.png`-Route — deren Rückfall `new URL(req.url).protocol` ist, und `req.url`
 * trägt nach dem Rewrite immer die interne (http-)Adresse.
 */
export function teilnahmeUrlAus(headers: Headers, token: string): string {
  const host = resolveHost(headers);
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${proto}://${host}/f/${token}`;
}

/**
 * Kartenstil aus §2.1 — dort ausdrücklich „Kartenstil (ALLE Zonen)", also
 * derselbe Stil wie in der Lagekarte und in „Letzter Abend", nicht ein eigener.
 * Das Polster steht als VARIABLE, nicht als 20: derselbe Abschnitt verlangt
 * „mobil `body.padding: 16`", und `styles.body` ist bei antd ein Inline-Style —
 * eine Klasse mit Medienabfrage verliert dagegen. Der Wert und sein mobiler
 * Zwilling liegen in `feedback.css` (`--fb-kartenpolster`).
 *
 * `paddingInline: 20` im Kopf bleibt eine Zahl: §2.1 gibt genau diesen Wert
 * wörtlich vor, der mobile Zwilling gilt nur für `body.padding`.
 */
const KARTE = {
  header: { ...T.kicker, minHeight: 40, paddingInline: 20, borderBottomColor: "var(--fb-split)" },
  body: { padding: "var(--fb-kartenpolster)" },
} satisfies Record<string, CSSProperties>;

const HAARLINIE: CSSProperties = {
  border: 0,
  borderTop: "1px solid var(--fb-split)",
  margin: "16px 0",
};

export type TeilnahmeProps = {
  /** Die vollständige Teilnahme-Adresse — GEBAUT IN DER SEITE, hier nur gezeigt. */
  url: string;
  /** `{slug}-{secret}` — die Bild- und Download-Quelle bleibt ein relativer Pfad. */
  token: string;
  groupId: number;
  /** Belegung A (Gruppe ganz neu): eine zusätzliche erste Zeile (§2.4). */
  erststart: boolean;
};

export function Teilnahme({ url, token, groupId, erststart }: TeilnahmeProps) {
  const qrPfad = `/f/${token}/qr.png`;

  return (
    <Card variant="outlined" title="DAUERHAFTER ZUGANG" styles={KARTE}>
      {erststart && (
        <p style={{ ...T.meta, margin: "0 0 12px" }}>
          Du kannst den Aushang schon vor dem ersten Abend drucken.
        </p>
      )}

      {/*
       * DER KASTEN IST HART `#ffffff`, auch im Dunkelmodus: ein QR auf dunklem
       * Grund ist von vielen Scannern nicht lesbar (§2.4). `--fb-card` wäre hier
       * falsch — im Dunkelmodus ist das `#141414`.
       *
       * 200px bleiben auch auf 390px: ein 350px-Code liest sich nicht besser und
       * drückt die Adresse unter die Falz.
       */}
      <div
        data-fb="qr-kasten"
        style={{
          background: "#ffffff",
          padding: 12,
          borderRadius: 8,
          border: "1px solid var(--fb-line)",
          width: 224,
          margin: "0 auto",
        }}
      >
        {/*
         * `alt=""`: der Code ist keine Information, die man vorlesen kann — die
         * zugängliche Entsprechung ist die Klartext-Adresse direkt darunter
         * (§4.14). `next/image` hilft nicht: die Quelle ist ein Route Handler je
         * Gruppe, und §2.4 schreibt `<img>` ausdrücklich vor.
         */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrPfad} width={200} height={200} alt="" style={{ display: "block" }} />
      </div>

      {/*
       * Die Adresse als eigener Block, `userSelect: all` — markieren mit einem
       * Klick, auch ohne JavaScript. 13px mono: der Wert steht wörtlich in §2.4
       * und liegt bewusst neben der Typo-Leiter (§4.7 kennt kein 13) — die Zeile
       * muss in eine 9-Spalten-Spalte passen, ohne dreimal zu brechen.
       */}
      <p
        data-fb="teilnahme-url"
        style={{
          background: "var(--fb-tint)",
          padding: "8px 12px",
          borderRadius: 6,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 13,
          wordBreak: "break-all",
          userSelect: "all",
          margin: "12px 0 0",
        }}
      >
        {url}
      </p>

      <Space wrap className="fb-knopfzeile" style={{ marginTop: 12 }}>
        <KopierZeile url={url} />
        {/* `download`: der Knopf ist ein Anker, kein Formular (§2.4). */}
        <Button href={qrPfad} download className="fb-block-mobil">
          PNG
        </Button>
        {/*
         * Neuer Tab, weil das Cockpit die Arbeitsseite bleibt: der Aushang wird
         * gedruckt und weggelegt, nicht navigiert.
         */}
        <Button type="text" href={`/m/feedback/aushang/${groupId}`} target="_blank" rel="noreferrer">
          Aushang drucken
        </Button>
      </Space>

      <hr style={HAARLINIE} />
      {/*
       * NICHT gedämpft (§2.4): das ist die Kernaussage der Zone, nicht ihr
       * Kleingedrucktes. Wer sie überliest, druckt jede Woche neu.
       */}
      <p style={{ ...T.body, margin: 0 }}>
        Einmal ausdrucken reicht. Der Code bleibt für alle künftigen Dienstabende gültig — er hängt
        an der Gruppe, nicht am Abend.
      </p>
    </Card>
  );
}
