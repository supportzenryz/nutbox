// First gate only — every page and action re-checks authorization server-side.
import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const toLogin = () => {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  };
  if (pathname.startsWith("/admin")) {
    if (!session) return toLogin();
    if (session.role !== "ADMIN" && session.role !== "STAFF") return NextResponse.redirect(new URL("/", req.url));
  }
  if ((pathname.startsWith("/account") || pathname.startsWith("/checkout") || pathname.startsWith("/invoice")) && !session) return toLogin();
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/account/:path*", "/checkout", "/invoice/:path*"] };
