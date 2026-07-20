import Link from "next/link";
import { Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-line-soft">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-ink-faint">
        <div className="flex items-center gap-2 font-display font-semibold text-ink">
          <span className="w-6 h-6 rounded-md gradient-primary-btn flex items-center justify-center text-[#1a0f05]">
            <Zap size={12} strokeWidth={2.4} />
          </span>
          Flux
        </div>
        <p className="text-center">Educational reference implementation. Runs on a simulated Lightning backend by default.</p>
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="hover:text-ink transition-colors">Dashboard</Link>
          <Link href="/login" className="hover:text-ink transition-colors">Log in</Link>
        </div>
      </div>
    </footer>
  );
}
