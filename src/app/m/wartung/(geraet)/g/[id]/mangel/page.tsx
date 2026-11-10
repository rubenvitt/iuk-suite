import { turnstileSiteKey } from "@/core/turnstile/server";
import { MangelAmGeraet } from "../../../../_ui/telefon/MangelAmGeraet";
import { geraetOeffentlich } from "../laden";

export const dynamic = "force-dynamic";

export default async function MangelSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g, viewer, zugang } = await geraetOeffentlich(params);
  // IDA-341: Turnstile nur ohne Modulzugang — die Route prüft dann genauso (`mangel/senden`).
  return <MangelAmGeraet geraetId={g.id} geraetName={g.name} mitName={viewer === null} turnstile={zugang ? null : turnstileSiteKey()} />;
}

export const metadata = { title: "Mangel melden" };
