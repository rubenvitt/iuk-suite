/**
 * RFC-4180-CSV. Anders als die Alt-App (export.go:92-102), die String-Arrays
 * per json.Marshal in ein Feld schrieb (Doppel-JSON), joinen wir Freitexte
 * sauber lesbar — bereinigter Port.
 */
export function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

/**
 * Verhindert CSV/Formula-Injection (OWASP): Der Export wird u.a. aus
 * anonymem, öffentlichem Teilnehmer-Freitext gespeist (Umfrage-Antworten).
 * Beginnt ein Feld mit `=`, `+`, `-`, `@`, Tab oder CR, interpretiert
 * Excel/LibreOffice es beim Öffnen als Formel und führt sie aus. Ein
 * vorangestelltes `'` neutralisiert das, ohne den Inhalt sonst zu verändern.
 */
function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function csvField(value: string): string {
  const neutralized = neutralizeFormula(value);
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function joinTexts(values: string[]): string {
  return values.join(" | ");
}
