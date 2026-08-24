import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Broker connectivity is disabled. Buddies OS v2 supports paper trading only." },
    { status: 410 },
  );
}
