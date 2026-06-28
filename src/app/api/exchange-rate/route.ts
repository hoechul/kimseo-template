import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date (YYYY-MM-DD) parameter required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `https://api.frankfurter.app/${date}?from=USD&to=KRW`
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "환율 정보를 가져올 수 없습니다" },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json({
      rate: data.rates.KRW,
      date: data.date,
    });
  } catch {
    return NextResponse.json({ error: "환율 조회 실패" }, { status: 500 });
  }
}
