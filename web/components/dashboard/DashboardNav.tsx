"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Zap, LogOut } from "lucide-react";
import { clsx } from "clsx";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/sessions", label: "History" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line-soft bg-surface">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-display font-semibold">
            <span className="w-8 h-8 rounded-lg gradient-primary-btn flex items-center justify-center text-[#1a0f05]">
              <Zap size={16} strokeWidth={2.4} />
            </span>
            <span className="hidden sm:inline">Flux</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "transition-colors",
                  pathname === link.href ? "text-primary font-medium" : "text-ink-soft hover:text-ink"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-ink-faint hover:text-danger transition-colors p-2 rounded-lg hover:bg-canvas-alt"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
