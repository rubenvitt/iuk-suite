"use server";

import { auth } from "@/core/auth";
import { widerrufeAlleSitzungen } from "@/core/konto/widerruf";

/**
 * Macht alle Sitzungen DIESER Suite fuer die angemeldete Person ungueltig.
 *
 * OHNE PARAMETER, und das ist die Zusage: der `sub` kommt aus `auth()`. Ein
 * entgegengenommener Parameter waere eine fremde Sitzung, die man abschieszen
 * kann — dieselbe Regel, die `assertGroupAccess` im Modul `feedback` durchsetzt.
 *
 * Das eigene Geraet meldet der Aufrufer danach selbst ab (`signOut` in
 * `ProfilAnsicht`): serverseitig ist die Sitzung zwar schon tot, aber der
 * Browser hielte sonst bis zur naechsten Anfrage ein Cookie, das nichts mehr
 * oeffnet — und die Sitzung beim Identitaetsanbieter liefe weiter.
 */
export async function alleSitzungenAbmelden(): Promise<void> {
  const session = await auth();
  const sub = session?.user?.id;
  if (!sub) return;
  widerrufeAlleSitzungen(sub);
}
