"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Minus, Zap } from "lucide-react";
import { TIER_PRICING } from "@mailwarm/shared/src/constants/tiers";

const tiers = [
  {
    name: "Starter",
    key: "STARTER",
    description: "For founders and small teams getting started with cold outreach.",
    features: [
      "3 warming domains",
      "2 mailboxes per domain",
      "500 emails/day",
      "Basic deliverability dashboard",
      "1 DNS provider (Azure, Cloudflare, or Route53)",
      "Basic DMARC parsing",
      "REST API",
      "2 team seats",
      "Email support",
    ],
    notIncluded: ["Bounce analytics", "SSO / SAML", "GraphQL API", "Webhooks", "Dedicated IPs"],
    cta: "Start free trial",
    href: "/register?plan=starter",
    highlighted: false,
  },
  {
    name: "Growth",
    key: "GROWTH",
    description: "For growing teams scaling their email outreach operations.",
    features: [
      "10 warming domains",
      "5 mailboxes per domain",
      "5,000 emails/day",
      "Advanced analytics",
      "2 DNS providers",
      "Full DMARC parsing + history",
      "Bounce & spam analytics",
      "REST + GraphQL API",
      "Webhooks (5 endpoints)",
      "5 inbox placement tests/mo",
      "5 team seats",
      "30-day audit log",
      "Email + chat support",
    ],
    notIncluded: ["SSO / SAML", "Custom warming curves", "Dedicated IPs"],
    cta: "Start free trial",
    href: "/register?plan=growth",
    highlighted: false,
  },
  {
    name: "Pro",
    key: "PRO",
    description: "For serious teams that need SSO, full control, and priority support.",
    badge: "Most Popular",
    features: [
      "35 warming domains",
      "15 mailboxes per domain",
      "25,000 emails/day",
      "Full advanced analytics + alerts",
      "All 3 DNS providers",
      "Full DMARC + alert forwarding",
      "Custom warming curves",
      "REST + GraphQL API",
      "Webhooks (20 endpoints)",
      "25 inbox placement tests/mo",
      "SSO / SAML / OIDC",
      "20 team seats",
      "90-day audit log",
      "99.5% SLA",
      "Priority support",
    ],
    notIncluded: ["Dedicated IPs", "White-label", "Dedicated CSM"],
    cta: "Start free trial",
    href: "/register?plan=pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    key: "ENTERPRISE",
    description: "Unlimited scale, dedicated infrastructure, white-label, and SLA guarantees.",
    features: [
      "Unlimited domains",
      "Unlimited mailboxes",
      "Custom send volume",
      "Dedicated IP pools",
      "White-label dashboard",
      "All DNS providers",
      "Full DMARC with forwarding",
      "Custom warming curves",
      "Unlimited webhooks & API keys",
      "Unlimited inbox placement tests",
      "SSO / SAML / OIDC",
      "Unlimited seats",
      "1-year audit log + export",
      "99.9% SLA + credits",
      "Dedicated CSM",
    ],
    notIncluded: [],
    cta: "Talk to sales",
    href: "/contact?plan=enterprise",
    highlighted: false,
  },
];

export function PricingSection() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="py-24 px-6">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3 block">
            Pricing
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Simple,{" "}
            <span className="text-gradient">predictable</span> pricing
          </h2>
          <p className="text-slate-400 text-lg mb-8">
            14-day free trial on all plans. No credit card required.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 glass rounded-full px-4 py-2">
            <button
              onClick={() => setAnnual(false)}
              className={`text-sm px-3 py-1 rounded-full transition-all ${!annual ? "bg-white/10 text-white" : "text-slate-500"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`text-sm px-3 py-1 rounded-full transition-all ${annual ? "bg-white/10 text-white" : "text-slate-500"}`}
            >
              Annual
              <span className="ml-2 text-xs text-accent-green font-medium">Save 20%</span>
            </button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {tiers.map((tier, i) => {
            const price = TIER_PRICING[tier.key as keyof typeof TIER_PRICING];
            const displayPrice = price.monthly === null
              ? null
              : annual
                ? price.annual! / 100
                : price.monthly / 100;

            return (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative flex flex-col rounded-2xl p-6 ${
                  tier.highlighted
                    ? "bg-gradient-to-b from-brand-600/20 to-accent-purple/10 border border-brand-500/50 glow-brand"
                    : "glass"
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-brand-500 to-accent-purple text-white text-xs font-semibold">
                      <Zap className="w-3 h-3" />
                      {tier.badge}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white mb-1">{tier.name}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{tier.description}</p>
                </div>

                <div className="mb-8">
                  {displayPrice !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">${displayPrice}</span>
                      <span className="text-slate-400 text-sm">/mo</span>
                    </div>
                  ) : (
                    <span className="text-4xl font-bold text-gradient">Custom</span>
                  )}
                  {annual && displayPrice !== null && (
                    <p className="text-xs text-slate-500 mt-1">Billed annually</p>
                  )}
                </div>

                <Link
                  href={tier.href}
                  className={`block text-center py-3 px-4 rounded-xl font-semibold text-sm mb-8 transition-all duration-200 ${
                    tier.highlighted
                      ? "bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-purple-500 text-white"
                      : "glass glass-hover text-white border border-white/10 hover:border-white/20"
                  }`}
                >
                  {tier.cta}
                </Link>

                <ul className="space-y-3 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <Check className="w-4 h-4 text-accent-green flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                  {tier.notIncluded.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                      <Minus className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
