"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Mail, Loader2, AlertTriangle } from "lucide-react";

export function EmailSignIn({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setError(null);
    try {
      const result = await signIn("nodemailer", { email, redirect: false, callbackUrl });
      if (result?.error) {
        throw new Error("We couldn't send that link. Double-check your email and try again.");
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl bg-success-soft text-success text-sm p-4 text-center leading-relaxed">
        Check <span className="font-medium">{email}</span> for a sign-in link.
        It expires in 15 minutes.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-line bg-canvas-alt text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={status === "sending"}>
        {status === "sending" && <Loader2 size={16} className="animate-spin" />}
        {status === "sending" ? "Sending link..." : "Continue with email"}
      </Button>
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-soft text-danger text-sm p-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}
