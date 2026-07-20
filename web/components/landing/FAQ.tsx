const faqs = [
  {
    q: "Is this real money?",
    a: "By default, no — Flux runs on a simulated Lightning backend with no real node required. The operator can connect a real LND node, in which case sessions send real keysend payments; check the account/settings page for which mode is active.",
  },
  {
    q: "What happens to my sessions if I don't sign in?",
    a: "You can still try the live demo on the homepage without an account. It's tagged as a public demo session and won't appear in any personal history, since there's no account to attach it to.",
  },
  {
    q: "Can I really stop a session at any moment?",
    a: "Yes — the server re-checks session state immediately before every single payment. Once a stop is acknowledged, no further payment is ever sent, even if one was about to fire.",
  },
  {
    q: "Can I build my own product on top of Flux?",
    a: "That's the point. The full REST + WebSocket API is documented and open — see the API Reference link above.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="max-w-3xl mx-auto px-6 py-24">
      <h2 className="font-display text-3xl font-semibold tracking-tight mb-10 text-center">Common questions</h2>
      <div className="space-y-6">
        {faqs.map((item) => (
          <div key={item.q} className="border-b border-line-soft pb-6">
            <h3 className="font-display font-semibold">{item.q}</h3>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
