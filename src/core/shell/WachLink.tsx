"use client";

import Link from "next/link";

import { useVerlassenWache } from "@/core/shell/verlassenWache";

/**
 * `next/link` mit Verlassen-Wache (IDA-357, `verlassen.ts`): für einen Rückweg, den auch eine Server
 * Component setzt (`Seitenkopf`) — dort ginge kein `onClickCapture` über die RSC-Grenze (Falle 9).
 */
export function WachLink(props: React.ComponentProps<typeof Link>) {
  const { beiKlick } = useVerlassenWache();
  return <Link {...props} onClickCapture={beiKlick} />;
}
