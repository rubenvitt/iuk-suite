"use client";
import { useState } from "react";
import { Button } from "antd";
import { SPACE } from "@/core/theme/tokens";

/**
 * DIE AUSWAHL-INSEL DES ETIKETTENBOGENS (Spec §8.4).
 *
 * WAS AUSDRUECKLICH NICHT GEAENDERT WIRD: die Interaktion (Alle / Keine /
 * Drucken mit Zaehler), der leere Zustand im Wortlaut, und dass alles zu Beginn
 * ausgewaehlt ist.
 *
 * DAS KONTROLLKAESTCHEN BLEIBT NACKT — kein antd-Checkbox (§6.10.2, Punkt 1).
 * Ein antd-Checkbox rendert an dieser Stelle KEIN nacktes <input> auf der
 * erwarteten Ebene, sondern eine .ant-checkbox-wrapper-Struktur: die Druckregel
 * liefe ins Leere und die Kaestchen stuenden MIT auf dem Papier. Still, weil es
 * erst am Ausdruck auffaellt (Falle 5). Und die Kachel ist ohnehin als Ganzes
 * klickbar — das Kaestchen ist Anzeige.
 *
 * `lb-nichtDrucken` sitzt auf dem KAESTCHEN, nie auf dem <label>: auf dem Label
 * saesse die Regel auf dem ganzen Etikett und druckte ein leeres Blatt.
 *
 * KEIN ZEICHEN AM KNOPF. Der Bestand setzt dort <Printer/> aus `lucide-react`
 * (EtikettenBogen.tsx:3,34) — das Paket fuehrt die Suite gar nicht, und ein
 * direkter @ant-design/icons-Import ist modulweit verboten, auch in
 * Client-Inseln (§6.5.1). Der verbleibende Weg waere ein Name aus
 * `_ui/ikonen.tsx` — die Zeichenquelle des Moduls ist dort seit der
 * Icon-Migration die Union `IkonName` mit der Tabelle `ZEICHEN` (nicht mehr
 * `PFADE`). Text ist hier billiger und ehrlicher.
 *
 * KEIN `size` am Button: controlHeight ist 56 und damit schon das richtige Mass;
 * `size="large"` waere 72px (Falle 4).
 *
 * Das SVG kommt per dangerouslySetInnerHTML herein — dieselbe Stelle und
 * dieselbe Begruendung wie src/app/m/qr/QrDisplay.tsx:16-21: das Markup stammt
 * aus dem SVG-Serializer von `qrcode`, die Nutzlast landet als Modulkoordinaten
 * im d-Attribut, nie als Text im Markup.
 */

type A = { id: string; name: string; fach: string; qr: string };
type T = { code: string; label: string; qr: string };

export function EtikettenBogen({ artikel, tokens }: { artikel: A[]; tokens: T[] }) {
  const keys = [...artikel.map((a) => `a:${a.id}`), ...tokens.map((t) => `t:${t.code}`)];
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set(keys));

  function umschalten(k: string) {
    setGewaehlt((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  function etikett(k: string, qr: string, titel: string, sub: string) {
    return (
      <label className={`lb-etikett${gewaehlt.has(k) ? "" : " lb-etikettAbgewaehlt"}`} key={k}>
        <input
          type="checkbox"
          className="lb-etikettWahl lb-nichtDrucken"
          checked={gewaehlt.has(k)}
          onChange={() => umschalten(k)}
          aria-label={`${titel} drucken`}
        />
        <span className="lb-etikettQr" dangerouslySetInnerHTML={{ __html: qr }} />
        <span className="lb-etikettText">
          <span className="lb-etikettTitel">{titel}</span>
          <span className="lb-etikettSub">{sub}</span>
        </span>
      </label>
    );
  }

  // 1:1 aus EtikettenBogen.tsx:27, Wortlaut unveraendert.
  if (keys.length === 0) {
    return <p className="lb-nichtDrucken">Keine aktiven Artikel oder Token.</p>;
  }

  return (
    <>
      <div
        className="lb-nichtDrucken"
        style={{ display: "flex", gap: SPACE.sm, marginBottom: SPACE.md }}
      >
        <Button data-testid="lb-alle" onClick={() => setGewaehlt(new Set(keys))}>
          Alle
        </Button>
        <Button data-testid="lb-keine" onClick={() => setGewaehlt(new Set())}>
          Keine
        </Button>
        {/* Primaeraktion — zulaessig, weil der Knopf eine HANDLUNG ist und keine
            Datenflaeche. Rot traegt im Etikettenbogen an keiner Stelle Bedeutung
            (Falle 3). */}
        <Button data-testid="lb-drucken" type="primary" onClick={() => window.print()}>
          Drucken ({gewaehlt.size})
        </Button>
      </div>
      <div className="lb-etikettbogen">
        {artikel.map((a) => etikett(`a:${a.id}`, a.qr, a.name, a.fach))}
        {tokens.map((t) => etikett(`t:${t.code}`, t.qr, t.label, t.code))}
      </div>
    </>
  );
}
