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
}
