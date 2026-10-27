import { NextResponse, type NextRequest } from "next/server";
import { normalizeCanonicalHost } from "@/lib/canonicalHost";

export function middleware(request: NextRequest) {
  // Keep APIs/assets directly accessible, including from old-origin recovery
  // windows. Only navigation is moved to the stable browser-storage origin.
  if ((request.method !== "GET" && request.method !== "HEAD")
    || !request.headers.get("accept")?.includes("text/html")
    || /^\/migrate-local-projects\/?$/.test(request.nextUrl.pathname)) return NextResponse.next();

  const canonicalHost = normalizeCanonicalHost(process.env.KERCAD_CANONICAL_HOST ?? process.env.NEXT_PUBLIC_KERCAD_CANONICAL_HOST);
  if (!canonicalHost) return NextResponse.next();
  const currentAddress = new URL(`${request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`);
  if (currentAddress.hostname.toLowerCase() === canonicalHost) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.hostname = canonicalHost;
  destination.port = currentAddress.port;
  const response = NextResponse.redirect(destination, 307);
  // The DNS setting can change; do not leave a permanent redirect in browsers.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|assets/|occt/|icon\\.svg|favicon\\.ico).*)"],
};
