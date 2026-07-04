import { NextRequest, NextResponse } from "next/server";

// Fast cookie-presence gate at the edge; real session validation (DB lookup)
// happens in server components / actions via getSession().
const PUBLIC_PATHS = ["/login", "/setup"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (!req.cookies.get("cc_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons|manifest.webmanifest|sw.js|favicon.ico|offline).*)",
  ],
};
