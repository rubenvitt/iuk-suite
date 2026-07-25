import { NextResponse } from "next/server";
import { auth } from "@/core/auth";
import { decideRoute, resolveHost } from "@/core/routing";

export default auth((req) => {
  // Nicht `req.headers.get("host")`: hinter dem Reverse-Proxy und bei der
  // internen Render-Anfrage nach einem `redirect()` steht der echte Host nur in
  // `x-forwarded-host`. Siehe resolveHost.
  const host = resolveHost(req.headers);
  const { nextUrl } = req;
  const groups = req.auth?.user?.groups ?? null;

  const decision = decideRoute({ host, pathname: nextUrl.pathname, groups });

  switch (decision.action) {
    case "next":
      return NextResponse.next();
    case "rewrite": {
      const url = nextUrl.clone();
      url.pathname = decision.target;
      return NextResponse.rewrite(url);
    }
    case "login": {
      const url = nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", decision.callbackUrl);
      return NextResponse.redirect(url);
    }
    case "forbidden":
      return new NextResponse("Forbidden", { status: 403 });
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
