/**
 * WIE EIN MODUL SEINE WERKZEUGE BEITRÄGT (IDA-367). Jedes Modul legt unter `<modul>/_mcp/` ein `McpModul` ab und
 * bekommt eine Zeile in `MCP_MODULE` (`module.ts`). Der Server fragt je Anfrage jedes Modul, welche Werkzeuge die
 * Person sehen darf; ein Werkzeug prüft beim Aufruf trotzdem selbst, mit den Riegeln der App (`aktionFuer` o. ä.),
 * denn zwischen Auflisten und Aufrufen können sich Rechte ändern.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Session } from "next-auth";
import { suiteAdminGroup } from "@/core/groups";
import type { McpPerson } from "./token";

export interface McpModul {
  /** Der Modul-Schlüssel aus `core/registry`; Werkzeuge heißen `<key>_<name>`. */
  key: string;
  /** Meldet die Werkzeuge an, die diese Person sehen darf — keine, wenn sie das Modul nicht nutzen darf. */
  registriere(server: McpServer, person: McpPerson): void;
}

/** Die Person, wie die Riegel der Module sie aus der App kennen (`session.user`). */
export function alsViewer(person: McpPerson): Session["user"] {
  return {
    id: person.sub,
    name: person.name,
    email: person.email,
    image: null,
    groups: person.groups,
    // Fachgruppen löst die App aus der Datenbank des Moduls `feedback` auf; noch kein MCP-Modul braucht sie.
    fachgruppen: [],
    isAdmin: person.groups.includes(suiteAdminGroup()),
  };
}

/** Eine Antwort als JSON-Text — so liest sie jedes Modell, ohne ein Schema zu kennen. */
export function antwortJson(wert: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(wert, null, 2) }] };
}

/** Eine erwartbare Ablehnung (Rechte, Eingabe) — `isError`, damit das Modell sie nicht für Erfolg hält. */
export function antwortFehler(text: string, felder?: Record<string, string>): CallToolResult {
  return { isError: true, content: [{ type: "text", text: felder ? `${text}\n${JSON.stringify(felder, null, 2)}` : text }] };
}

/** Der Wurf eines Riegels (`Forbidden`) wird zur Antwort; alles andere fliegt weiter. */
export async function mitRiegel(arbeit: () => Promise<CallToolResult> | CallToolResult): Promise<CallToolResult> {
  try {
    return await arbeit();
  } catch (e) {
    if (e instanceof Error && e.message === "Forbidden") return antwortFehler("Dafür fehlen dir die Rechte.");
    throw e;
  }
}
