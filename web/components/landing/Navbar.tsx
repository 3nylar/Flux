import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Zap } from "lucide-react";

export function Navbar() {
  const FLUX_API_URL = process.env.NEXT_PUBLIC_FLUX_API_URL || "http://localhost:8081";
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-canvas/85 border-b border-line-soft">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-display font-semibold text-lg">
          <span className="w-8 h-8 rounded-lg gradient-primary-btn flex items-center justify-center text-[#1a0f05]">
            <Zap size={16} strokeWidth={2.4} />
          </span>
          Flux
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-ink-soft">
          <a href="#how-it-works" className="hover:text-ink transition-colors">How it works</a>
          <a href="#faq" className="hover:text-ink transition-colors">FAQ</a>
          <a href={`${FLUX_API_URL}/docs`} target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">
            API Reference ↗
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login"><Button variant="secondary" size="sm">Log in</Button></Link>
          <Link href="/dashboard"><Button variant="primary" size="sm">Dashboard</Button></Link>
        </div>
      </div>
    </header>
  );
}
