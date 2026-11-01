import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireSchichtplanHost } from "../../_lib/host";
import { SCHICHTPLAN_NAV } from "../../_lib/nav";
import { requireSchichtplanZugang } from "../../_lib/zugang";

export default async function SchichtplanListeLayout({ children }: { children: React.ReactNode }) {
  requireSchichtplanHost(await headers());
  await requireSchichtplanZugang();
  return <Shell variant="full" moduleKey="schichtplan" nav={SCHICHTPLAN_NAV}>{children}</Shell>;
}
