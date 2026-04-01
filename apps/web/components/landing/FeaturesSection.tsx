"use client";

import { motion } from "framer-motion";
import {
  Flame, Shield, BarChart3, Globe, Key, Users,
  Mail, RefreshCw, Bell, Lock,
} from "lucide-react";

const features = [
  {
    icon: Flame,
    title: "Intelligent Domain Warming",
    description:
      "Exponential, linear, or aggressive ramp curves automatically calibrated to your domain age and target volume. Real mailboxes. Real replies.",
    color: "from-orange-500 to-rose-500",
    glow: "rgba(249,115,22,0.25)",
  },
  {
    icon: Shield,
    title: "One-Click DNS Authentication",
    description:
      "SPF, DKIM, and DMARC records automatically generated and deployed to Azure DNS, Cloudflare, or Route 53 — with live verification.",
    color: "from-brand-500 to-accent-purple",
    glow: "rgba(99,102,241,0.25)",
  },
  {
    icon: BarChart3,
    title: "Deliverability Intelligence",
    description:
      "Real-time inbox placement scores, open rates, click rates, bounce analytics, and spam complaints — all in one dashboard.",
    color: "from-accent-cyan to-brand-500",
    glow: "rgba(6,182,212,0.25)",
  },
  {
    icon: Globe,
    title: "DMARC Report Parsing",
    description:
      "Aggregate DMARC reports automatically collected, parsed, and visualised. Instant alerts when spoofing attempts are detected.",
    color: "from-accent-purple to-pink-500",
    glow: "rgba(168,85,247,0.25)",
  },
  {
    icon: Key,
    title: "SSO / SAML / OIDC (Pro+)",
    description:
      "Enterprise-grade Single Sign-On via WorkOS. Connect Okta, Azure AD, Google Workspace, or any SAML 2.0 provider in minutes.",
    color: "from-amber-400 to-orange-500",
    glow: "rgba(251,191,36,0.25)",
  },
  {
    icon: Users,
    title: "Multi-Tenant Architecture",
    description:
      "Full organisation isolation, role-based access control, team seats, audit logs, and per-tenant API keys.",
    color: "from-accent-green to-teal-400",
    glow: "rgba(16,185,129,0.25)",
  },
  {
    icon: Mail,
    title: "Real Mailbox Provisioning",
    description:
      "We spin up live SMTP mailboxes on your domain via our own MTA stack (ports 587/465/993) — no third-party ESP dependency.",
    color: "from-blue-400 to-brand-500",
    glow: "rgba(96,165,250,0.25)",
  },
  {
    icon: RefreshCw,
    title: "Auto-Reply Engine",
    description:
      "Seed mailboxes read, reply, and engage with warmup emails intelligently — mimicking real human behaviour across all major providers.",
    color: "from-rose-400 to-pink-600",
    glow: "rgba(251,113,133,0.25)",
  },
  {
    icon: Bell,
    title: "Webhooks & API",
    description:
      "REST and GraphQL APIs with typed SDKs. Webhooks for every deliverability event. Build your own workflows on top.",
    color: "from-accent-purple to-brand-600",
    glow: "rgba(139,92,246,0.25)",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3 block">
            Everything you need
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Built for serious{" "}
            <span className="text-gradient">email senders</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            From solo founders sending cold outreach to enterprise teams managing
            hundreds of domains — MailWarm has you covered.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.1, duration: 0.6 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group glass rounded-2xl p-6 cursor-default"
                style={{ "--glow-color": feature.glow } as React.CSSProperties}
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                  style={{ boxShadow: `0 0 20px ${feature.glow}` }}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
