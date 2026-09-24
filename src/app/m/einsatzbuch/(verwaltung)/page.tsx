import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { requireEinsatzbuchHost } from "../_lib/host";
import { requireEinsatzbuchZugang } from "../_lib/zugang";

export default async function EinsatzbuchUebersicht() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  return (
    <Seitenkopf
      titel="Einsatzbuch"
      beschreibung="Hier pflegst du bald Fahrzeuge, Personal und Alarmstichworte für den Einsatzbuch-Rechner und öffnest exportierte Einsatzdateien."
    />
  );
}
