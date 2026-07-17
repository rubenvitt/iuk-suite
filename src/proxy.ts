import { NextResponse } from "next/server";
import { auth } from "@/core/auth";
import { decideRoute } from "@/core/routing";

export default auth((req) => {
  const host = req.headers.get("host") ?? "";
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
