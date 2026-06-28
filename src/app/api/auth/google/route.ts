import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function GET() {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const url = getAuthUrl(user.id);
  return NextResponse.redirect(url);
}
