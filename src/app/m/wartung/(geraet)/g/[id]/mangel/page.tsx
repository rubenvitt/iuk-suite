import { MangelAmGeraet } from "../../../../_ui/telefon/MangelAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function MangelSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g } = await geraetOder404(params);
  return <MangelAmGeraet geraetId={g.id} geraetName={g.name} />;
}
