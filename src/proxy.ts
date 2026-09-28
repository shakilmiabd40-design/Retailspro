import { NextResponse, type NextRequest } from "next/server";

/**
 * First line of defence: pages need a session cookie, otherwise the visitor is sent to /login.
 * This only checks that a cookie exists — the API validates the session itself on every request,
 * so a forged or stale cookie gets nothing but an empty shell that bounces back to /login.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/")) return NextResponse.next();

  if (!req.cookies.has("rp_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map|txt)$).*)"],
};
