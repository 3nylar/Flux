import { MeterWidget } from "@/components/MeterWidget";
import { Zap, ShieldCheck, Code2, RefreshCw } from "lucide-react";

const FLUX_API_URL = process.env.NEXT_PUBLIC_FLUX_API_URL || "http://localhost:8081";

export default function HomePage() {
  return (
    <>
      <header className="border-b border-line-soft">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold text-lg">
            <span className="w-8 h-8 rounded-lg gradient-primary-btn flex items-center justify-center text-[#1a0f05]">
              <Zap size={16} strokeWidth={2.4} />
            </span>
            Flux
          </div>
          <a
            href={`${FLUX_API_URL}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-ink-soft hover:text-ink transition-colors"
          >
            API Reference ↗
          </a>
        </div>
      </header>

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
              <Feature
                icon={RefreshCw}
                title="Real streaming payments"
                text="One Lightning keysend payment per tick interval, for as long as you let it run."
              />
              <Feature
                icon={ShieldCheck}
                title="Stop is instant"
                text="Server-side state re-checked before every payment — nothing sent after stop."
              />
              <Feature
                icon={Code2}
                title="Fully documented API"
                text="REST + WebSocket, API keys, webhooks, idempotency. See the reference."
              />
              <Feature
                icon={Zap}
                title="Zero setup to try"
                text="Runs on a simulated Lightning backend by default — no node required."
              />
            </div>

            <p className="mt-10 text-sm text-ink-faint">
              This page is a reference client of the{" "}
              <a
                href={`${FLUX_API_URL}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Flux API
              </a>{" "}
              — it calls a server-side proxy so the API key never reaches
              your browser, exactly the pattern a real integration should
              follow.
            </p>
          </div>

          <div className="flex justify-center md:justify-end md:sticky md:top-24">
            <MeterWidget />
          </div>
        </div>
      </main>

      <footer className="border-t border-line-soft">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-ink-faint">
          Educational reference implementation. Runs on a simulated
          Lightning backend by default — no real sats are ever involved
          unless you explicitly connect a real node.
        </div>
      </footer>
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
