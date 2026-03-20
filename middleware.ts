import { NextResponse, NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const country = req.geo?.country;

  // Block traffic from Russia
  if (country === "RU") {
    return new NextResponse("Access Denied", { status: 403 });
  }

  // Allow all other requests
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};