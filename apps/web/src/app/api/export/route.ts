import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const [settings, records] = await Promise.all([
    getSettings(session.user.id),
    prisma.record.findMany({
      where: { userId: session.user.id },
      include: { account: true, category: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const lines = ["date,account,category,amount,currency,converted amount,currency,description"];
  for (const r of records) {
    const amount = (Number(r.amountMinor) / 100) * (r.type === "EXPENSE" ? -1 : 1);
    const iso = r.date.toISOString().slice(0, 10);
    lines.push(
      [
        iso,
        csvCell(r.account.name),
        csvCell(r.category.name),
        amount.toFixed(2),
        settings.currency,
        amount.toFixed(2),
        settings.currency,
        csvCell(r.note),
      ].join(","),
    );
  }

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="coincache-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
