import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Everything under /dashboard requires sign-in; landing, login, and the
// public demo widget on the homepage stay accessible without an account.
export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  const isProtectedRoute = req.nextUrl.pathname.startsWith("/dashboard");

  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
