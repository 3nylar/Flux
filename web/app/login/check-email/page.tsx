import Link from "next/link";
import { Zap, MailCheck } from "lucide-react";

export default function CheckEmailPage() {
  return (
    <main className="flex-1 flex items-center justify-center gradient-trust px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="inline-flex items-center gap-2 font-display font-semibold text-lg mb-8">
          <span className="w-8 h-8 rounded-lg gradient-primary-btn flex items-center justify-center text-[#1a0f05]">
            <Zap size={17} strokeWidth={2.4} />
          </span>
          Flux
        </Link>
        <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary flex items-center justify-center mx-auto mb-6">
          <MailCheck size={26} />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-3 text-sm text-ink-soft leading-relaxed">
          We&apos;ve sent you a sign-in link. It expires in 15 minutes, and
          only works once.
        </p>
        <Link href="/login" className="inline-block mt-8 text-sm text-primary hover:text-primary/80 transition-colors">
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
