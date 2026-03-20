import { NextResponse, NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  try {
    const country = req.geo?.country || "UNKNOWN";

    // Block Russia
    if (country === "RU") {
      return new NextResponse("Access Denied", { status: 403 });
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Middleware error:", error);

    // Always fail-safe
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};