import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

const protectedPaths = ["/chat", "/settings"];
const authPaths = [
  "/login",
  "/cadastro",
  "/esqueci-a-senha",
  "/redefinir-senha",
];

export async function proxy(request: NextRequest) {
  const demoMode = process.env.HANIRA_DEMO_MODE === "true";
  if (demoMode) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  const protectedRoute = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  let sessionResult;
  try {
    sessionResult = await updateSupabaseSession(request);
  } catch {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "supabase_unavailable");
    return NextResponse.redirect(loginUrl);
  }
  const { response, user } = sessionResult;

  if (protectedRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    loginUrl.searchParams.set("error", "session_expired");
    return NextResponse.redirect(loginUrl);
  }

  if (user && authPaths.includes(pathname)) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/chat/:path*",
    "/settings/:path*",
    "/login",
    "/cadastro",
    "/esqueci-a-senha",
    "/redefinir-senha",
  ],
};
