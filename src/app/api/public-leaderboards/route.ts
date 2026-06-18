import { NextResponse } from "next/server";

import { getPublicLeaderboardData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const data = await getPublicLeaderboardData();

  return NextResponse.json(data);
}
