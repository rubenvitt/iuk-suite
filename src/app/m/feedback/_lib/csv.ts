/**
 * RFC-4180-CSV. Anders als die Alt-App (export.go:92-102), die String-Arrays
 * per json.Marshal in ein Feld schrieb (Doppel-JSON), joinen wir Freitexte
 * sauber lesbar — bereinigter Port.
 */
export function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function joinTexts(values: string[]): string {
  return values.join(" | ");
}
