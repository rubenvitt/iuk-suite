/**
 * Die Module im MCP-Server der Suite (IDA-367). Ein neues Modul legt `<modul>/_mcp/werkzeuge.ts` mit einem
 * `McpModul` an und bekommt hier eine Zeile; `module.test.ts` prüft, dass jeder Schlüssel ein Modul der Registry
 * ist und jedes Werkzeug mit `<key>_` beginnt.
 */
import { wartungMcp } from "@/app/m/wartung/_mcp/werkzeuge";
import type { McpModul } from "./modul";

export const MCP_MODULE: readonly McpModul[] = [wartungMcp];
