import { headers } from "next/headers";
import { getDb } from "../_db/client";
import { alleVeranstaltungen } from "../_lib/daten";
import { listeZugaenge } from "../_lib/schluessel";
import { requireVeranstaltungenHost } from "../_lib/host";
import { darfVeranstaltungLoeschen, requireVeranstaltungenZugang } from "../_lib/zugang";
import { Veranstaltungsliste } from "../_ui/Veranstaltungsliste";

export const dynamic = "force-dynamic";

/** Alle Veranstaltungen, kommende zuerst; anlegen und ändern im Flyin. */
export default async function VeranstaltungenStart() {
  requireVeranstaltungenHost(await headers());
  const viewer = await requireVeranstaltungenZugang();
  const admin = darfVeranstaltungLoeschen(viewer.groups);
  // Abruf-Zugänge (LLH-2097) sehen nur Modul-Admins; alle anderen bekommen die Liste gar nicht erst.
  return <Veranstaltungsliste liste={alleVeranstaltungen(getDb())} darfLoeschen={admin} zugaenge={admin ? listeZugaenge(getDb()) : null} jetzt={new Date().getTime()} />;
}

export const metadata = { title: "Veranstaltungen" };
