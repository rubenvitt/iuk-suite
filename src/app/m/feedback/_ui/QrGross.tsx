"use client";

import { useState } from "react";
import { Button, Modal } from "antd";
import { T } from "./typo";

/**
 * „QR-CODE GROSS ZEIGEN" (Entwurf §2.3-Tabelle, §2.4 J-B-2, §4.13).
 *
 * Der zeitkritische Handgriff im Gruppenraum: am Ende des Dienstabends muss der
 * Code aus zwei Metern lesbar sein — auf dem Beamer, auf dem hochgehaltenen
 * Laptop, notfalls auf dem Handy. Die 200px-Vorschau der Teilnahme-Zone leistet
 * das nicht, und die Zone steht auf 390px an DOM-Position 3. Deshalb hängt
 * dieser Knopf an der LAGEKARTE, in jedem Zustand ein Tipp weit oben.
 *
 * `darstellung` deckt genau die zwei Rollen aus der §2.3-Tabelle ab, damit die
 * Lagekarte keinen zweiten Knopf-Typ erfindet:
 * - `primaer` — Belegungen C/D: dort ist „QR-Code groß zeigen" die laute Aktion,
 *   „Feedback jetzt beenden" die Nebenaktion.
 * - `sekundaer` — Belegungen A/B: dort ist „Feedback starten" der EINE
 *   Primärknopf der Seite (§2.6), dieser hier also `default`.
 *
 * DER KASTEN UM DEN CODE IST HART `#ffffff`, auch im Dunkelmodus — ein QR auf
 * dunklem Grund ist von vielen Scannern nicht lesbar (§2.4, dieselbe Regel wie
 * in `QrDisplay`). `--fb-card` wäre hier falsch: im Dunkelmodus `#141414`.
 *
 * `?w=1024`: der Endpunkt liefert ohne Parameter 512px (§3.5) — im Vollbild
 * sieht man das.
 */

export type QrGrossDarstellung = "primaer" | "sekundaer";

export type QrGrossProps = {
  /** Die vollständige Teilnahme-Adresse — `${proto}://${host}/f/${token}`. */
  url: string;
  gruppenname: string;
  darstellung: QrGrossDarstellung;
};

export function QrGross({ url, gruppenname, darstellung }: QrGrossProps) {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <Button
        type={darstellung === "primaer" ? "primary" : "default"}
        onClick={() => setOffen(true)}
        className="fb-block-mobil"
      >
        QR-Code groß zeigen
      </Button>
      {/*
       * `footer={null}`: das Modal hat genau eine Handlung — wieder zumachen.
       * ESC und der Klick daneben bringen antd mit, `centered` hält den Code auf
       * Augenhöhe statt am Seitenanfang.
       */}
      <Modal
        open={offen}
        onCancel={() => setOffen(false)}
        footer={null}
        centered
        width="min(90vw, 560px)"
        title={gruppenname}
      >
        <div
          data-fb="qr-kasten"
          style={{
            background: "#ffffff",
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--fb-line)",
          }}
        >
          {/*
           * eslint-disable-next-line @next/next/no-img-element — `next/image`
           * hilft hier nicht: die Quelle ist ein Route Handler, der den Code je
           * Gruppe erzeugt, und die Größe steht in CSS. Der Entwurf schreibt
           * `<img>` ausdrücklich vor (§2.4).
           */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${url}/qr.png?w=1024`}
            alt=""
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        </div>
        {/*
         * Die Adresse steht als Text darunter: wer nicht scannen kann, tippt sie
         * ab — und sie ist gleichzeitig die zugängliche Entsprechung zum `alt=""`
         * des Codes (§4.14).
         */}
        <p
          style={{
            ...T.body,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            wordBreak: "break-all",
            userSelect: "all",
            margin: "12px 0 0",
            textAlign: "center",
          }}
        >
          {url}
        </p>
      </Modal>
    </>
  );
}
