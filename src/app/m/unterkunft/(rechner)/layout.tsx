import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireUnterkunftHost } from "../_lib/host";
import { UNTERKUNFT_NAV } from "../_lib/nav";
import { requireUnterkunftSitzung } from "../_lib/zugang";

export default async function UnterkunftRechnerLayout({ children }: { children: React.ReactNode }) {
  requireUnterkunftHost(await headers());
  await requireUnterkunftSitzung();
  return <Shell variant="full" moduleKey="unterkunft" nav={UNTERKUNFT_NAV}>{children}</Shell>;
}
