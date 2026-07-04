import { redirect } from "next/navigation";
import { userCount } from "@/lib/data";
import { AuthForm } from "@/components/AuthForm";
import { setupAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await userCount()) > 0) redirect("/login");
  return (
    <AuthForm
      action={setupAction}
      title="Set up CoinCache"
      subtitle="Create the first (admin) account. Default categories and a Cash account will be created for you."
      submitLabel="Create account"
      fields={[
        { name: "name", label: "Your name", type: "text", autoComplete: "name" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password (min 8 characters)", type: "password", autoComplete: "new-password" },
      ]}
    />
  );
}
