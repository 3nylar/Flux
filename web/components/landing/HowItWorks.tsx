import { LogIn, Zap, RefreshCw } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: LogIn,
    title: "Sign in with email",
    description: "No wallet, no setup. Your account is how Flux knows which sessions are yours.",
  },
  {
    number: "02",
    icon: Zap,
    title: "Start a streaming session",
    description: "Pick a rate and tick interval. Flux begins sending one keysend payment per tick immediately.",
  },
  {
    number: "03",
    icon: RefreshCw,
    title: "Watch it, stop it, review it",
    description: "Stop instantly whenever you like. Every session and payment stays in your history afterward.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-24">
      <div className="max-w-xl mb-14">
        <h2 className="font-display text-3xl font-semibold tracking-tight">How it works</h2>
        <p className="mt-3 text-ink-soft leading-relaxed">
          Everything you see here runs against the real Flux API — the same one you&apos;d integrate into your own product.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-8">
        {steps.map((step) => (
          <div key={step.number} className="relative">
            <span className="font-display text-5xl font-semibold text-primary-soft select-none">{step.number}</span>
            <div className="mt-3 w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
              <step.icon size={18} strokeWidth={2.2} />
            </div>
            <h3 className="mt-4 font-display font-semibold text-lg">{step.title}</h3>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
