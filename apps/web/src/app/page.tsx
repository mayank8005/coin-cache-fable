import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getAccountsWithBalances,
  getCategories,
  getDashboard,
  getSettings,
  userCount,
} from "@/lib/data";
import { todayInTz, type Period, PERIODS } from "@/lib/periods";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if ((await userCount()) === 0) redirect("/setup");
  const user = await requireUser();
  const sp = await searchParams;

  const period = (PERIODS.some((p) => p.id === sp.period) ? sp.period : "month") as Period;
  const offset = Math.max(-1200, Math.min(1200, parseInt(String(sp.offset ?? "0"), 10) || 0));
  const accountId = typeof sp.account === "string" && sp.account !== "" ? sp.account : null;

  const settings = await getSettings(user.id);
  const [dashboard, accounts, categories] = await Promise.all([
    getDashboard({ userId: user.id, period, offset, accountId }),
    getAccountsWithBalances(user.id),
    getCategories(user.id),
  ]);

  return (
    <Dashboard
      userName={user.name}
      isAdmin={user.role === "ADMIN"}
      currency={settings.currency}
      locale={settings.locale}
      todayIso={todayInTz(settings.timezone)}
      period={period}
      offset={offset}
      accountId={accountId}
      accounts={accounts}
      categories={categories}
      data={dashboard}
    />
  );
}
