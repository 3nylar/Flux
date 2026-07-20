import Link from "next/link";
import { Zap, ShieldCheck } from "lucide-react";
import { EmailSignIn } from "@/components/auth/EmailSignIn";
import { Card } from "@/components/ui/Card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || "/dashboard";

  return (
    <main className="flex-1 flex items-center justify-center gradient-trust px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <Link href="/" className="flex items-center gap-2 font-display font-semibold text-lg mb-6">
            <span className="w-8 h-8 rounded-lg gradient-primary-btn flex items-center justify-center text-[#1a0f05]">
              <Zap size={17} strokeWidth={2.4} />
            </span>
            Flux
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in to Flux</h1>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed">
            Track your streaming sessions, view your full payment history,
            and manage your account.
          </p>
        </div>

        <Card className="p-6">
          <EmailSignIn callbackUrl={callbackUrl} />
        </Card>

        <div className="mt-6 flex items-start gap-2 text-xs text-ink-faint leading-relaxed justify-center text-center">
          <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-success" />
          <span>
            You can still try the live demo on the homepage without an
            account — signing in just saves your sessions to a real history.
          </span>
        </div>
      </div>
    </main>
  );
}
