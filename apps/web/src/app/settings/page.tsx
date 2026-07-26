import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAccountsWithBalances, getCategories, getSettings } from "@/lib/data";
import SettingsView from "@/components/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [accounts, categories, settings, users] = await Promise.all([
    getAccountsWithBalances(user.id),
    getCategories(user.id),
    getSettings(user.id),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-12">
      <header className="pt-safe sticky top-0 z-20 flex items-center gap-2 glass-header px-4 py-2 text-white shadow-md">
        <Link
          href="/"
          className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-3xl leading-none active:bg-white/20"
          aria-label="Back"
        >
          ‹
        </Link>
        <h1 className="text-lg font-bold">Settings</h1>
      </header>
      <SettingsView
        accounts={accounts}
        categories={categories}
        users={users}
        currency={settings.currency}
        locale={settings.locale}
        timezone={settings.timezone}
        isAdmin={user.role === "ADMIN"}
        currentUserId={user.id}
      />
    </div>
  );
}
