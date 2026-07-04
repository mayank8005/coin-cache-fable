import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { userCount } from "@/lib/data";
import { AuthForm } from "@/components/AuthForm";
import { loginAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if ((await userCount()) === 0) redirect("/setup");
  if (await getSession()) redirect("/");
  return (
    <AuthForm
      action={loginAction}
      title="Welcome back"
      subtitle="Sign in to your family wallet"
      submitLabel="Sign in"
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
    />
  );
}
