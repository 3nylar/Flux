import { MeterWidget } from "@/components/MeterWidget";
import { Navbar } from "@/components/landing/Navbar";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";
import { ShieldCheck, Code2, RefreshCw, Zap } from "lucide-react";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main className="flex-1 gradient-trust">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-16 items-start">
          <div>
            <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-[1.08]">
              A taxi meter for money on Lightning.
            </h1>
            <p className="mt-5 text-lg text-ink-soft leading-relaxed max-w-lg">
              Flux streams sats continuously to a receiver — one keysend
              payment per tick — for as long as a session runs. Stop it at
              any instant and billing halts within one tick, guaranteed.
            </p>

            <div className="mt-10 grid sm:grid-cols-2 gap-5">
              <Feature icon={RefreshCw} title="Real streaming payments" text="One Lightning keysend payment per tick interval, for as long as you let it run." />
              <Feature icon={ShieldCheck} title="Stop is instant" text="Server-side state re-checked before every payment — nothing sent after stop." />
              <Feature icon={Code2} title="Fully documented API" text="REST + WebSocket, API keys, webhooks, idempotency. See the reference." />
              <Feature icon={Zap} title="Zero setup to try" text="Runs on a simulated Lightning backend by default — no node required." />
            </div>

            <p className="mt-10 text-sm text-ink-faint">
              This page is a reference client of the Flux API — it calls a
              server-side proxy so the API key never reaches your browser.{" "}
              <a href="/login" className="text-primary hover:underline">
                Sign in
              </a>{" "}
              to save your sessions to a real history.
            </p>
          </div>

          <div className="flex justify-center md:justify-end md:sticky md:top-24">
            <MeterWidget />
          </div>
        </div>

        <HowItWorks />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div>
      <div className="w-9 h-9 rounded-lg bg-primary-soft text-primary flex items-center justify-center mb-3">
        <Icon size={16} strokeWidth={2.2} />
      </div>
      <h3 className="font-display font-semibold text-sm">{title}</h3>
      <p className="mt-1 text-sm text-ink-faint leading-relaxed">{text}</p>
    </div>
  );
}
