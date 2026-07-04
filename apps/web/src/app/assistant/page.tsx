import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { aiReady, getAiConfig } from "@/lib/ai";
import AssistantView from "@/components/AssistantView";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const user = await requireUser();
  if (!aiReady(await getAiConfig(user.id))) redirect("/settings/ai");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="pt-safe sticky top-0 z-20 flex items-center gap-3 bg-brand px-4 py-3 text-white shadow-md">
        <Link href="/" className="text-2xl leading-none" aria-label="Back">
          ‹
        </Link>
        <h1 className="text-lg font-bold">💬 Ask your data</h1>
      </header>
      <AssistantView />
    </div>
  );
}
