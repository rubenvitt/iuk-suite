import { MangelAmGeraet } from "../../../../_ui/telefon/MangelAmGeraet";
import { geraetOeffentlich } from "../laden";

export const dynamic = "force-dynamic";

export default async function MangelSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g, viewer } = await geraetOeffentlich(params);
  return <MangelAmGeraet geraetId={g.id} geraetName={g.name} mitName={viewer === null} />;
}

export const metadata = { title: "Mangel melden" };
