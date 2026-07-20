export type QrPayload =
  | { kind: "url"; value: string }
  | {
      kind: "wifi";
      value: {
        ssid: string;
        password: string;
        encryption: "WPA" | "WEP" | "nopass";
        hidden?: boolean;
      };
    }
  | { kind: "tel"; value: string }
  | {
      kind: "vcard";
      value: { name: string; tel?: string; email?: string; org?: string };
    }
  | { kind: "text"; value: string };

export type QrKind = QrPayload["kind"];

export type Preset = QrPayload & {
  id: string;
  label: string;
  icon?: string;
};

export interface HistoryEntry {
  id: string;
  label: string;
  payload: QrPayload;
  createdAt: number;
  /**
   * Wer den Eintrag erzeugt hat: die User-ID der Sitzung, `null` fuer anonym.
   * Optional, weil Eintraege aus easy-qr das Feld nicht tragen — siehe
   * `history.ts`. Gesetzt wird es ausschliesslich von `addEntry`.
   */
  owner?: string | null;
}
