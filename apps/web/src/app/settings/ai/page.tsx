import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AiSettingsView from "@/components/AiSettingsView";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const user = await requireUser();
  const row = await prisma.aiSettings.findUnique({ where: { userId: user.id } });

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-12">
      <header className="pt-safe sticky top-0 z-20 flex items-center gap-3 bg-brand px-4 py-3 text-white shadow-md">
        <Link href="/settings" className="text-2xl leading-none" aria-label="Back to settings">
          ‹
        </Link>
        <h1 className="text-lg font-bold">AI features</h1>
      </header>
      <AiSettingsView
        current={
          row
            ? {
                provider: row.provider,
                baseUrl: row.baseUrl,
                hasKey: !!row.apiKeyEnc,
                model: row.model,
              }
            : null
        }
      />
    </div>
  );
}
