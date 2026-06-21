import { NextResponse, type NextRequest } from "next/server";

import { getPublicHomeData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const subjects = request.nextUrl.searchParams.getAll("subject");
  const queryCode = request.nextUrl.searchParams.get("code") ?? "";
  const data = await getPublicHomeData(query, subjects, {
    includeLeaderboards: false,
    queryCode
  });

  return NextResponse.json(data);
}
