"use client";

import { motion } from "framer-motion";
import { Globe, Flame, BarChart3, CheckCircle } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Globe,
    title: "Connect your domain",
    description:
      "Add your domain and connect your DNS provider (Azure DNS, Cloudflare, or Route 53). We generate your SPF, DKIM, and DMARC records and apply them automatically.",
    color: "from-brand-500 to-accent-purple",
    details: ["Paste your API credentials once", "Records deployed in under 60 seconds", "Live verification status"],
  },
  {
    number: "02",
    icon: Flame,
    title: "We spin up real mailboxes",
    description:
      "MailWarm provisions live sending mailboxes on your domain using our own SMTP infrastructure. Our seed pool sends, opens, replies, and engages — just like real humans.",
    color: "from-orange-500 to-rose-500",
    details: ["SMTP on port 587 (STARTTLS)", "IMAP on port 993 for receiving", "Natural reply cadence & timing"],
  },
  {
    number: "03",
    icon: BarChart3,
    title: "Watch your reputation grow",
    description:
      "Your daily send volume ramps along your chosen curve. Real-time metrics show inbox placement, opens, bounces, and spam rates climbing in the right direction.",
    color: "from-accent-cyan to-brand-500",
    details: ["Exponential, linear, or custom ramps", "Hourly metrics updates", "DMARC report parsing"],
  },
  {
    number: "04",
    icon: CheckCircle,
    title: "Send with confidence",
    description:
      "Once warmed, your domain has the reputation it needs to land in the inbox — not the spam folder. Keep MailWarm running for ongoing health monitoring.",
    color: "from-accent-green to-teal-400",
    details: ["Ongoing inbox placement tests", "Instant anomaly alerts", "Continuous DMARC monitoring"],
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3 block">
            How it works
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Up and running in{" "}
            <span className="text-gradient">under 5 minutes</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            No engineers needed. No complex configuration. Just results.
          </p>
        </motion.div>

        <div className="relative">
          {/* Connector line */}
          <div className="absolute left-8 top-12 bottom-12 w-px bg-gradient-to-b from-brand-500/50 via-accent-purple/50 to-accent-green/50 hidden md:block" />

          <div className="space-y-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, duration: 0.6 }}
                  className="relative flex gap-6 md:gap-10"
                >
                  {/* Step icon */}
                  <div className="flex-shrink-0 relative z-10">
                    <div
                      className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center`}
                      style={{ boxShadow: "0 0 30px rgba(99,102,241,0.2)" }}
                    >
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 glass rounded-2xl p-6 hover:border-white/20 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-xs font-mono text-slate-500 mb-1 block">{step.number}</span>
                        <h3 className="text-xl font-bold text-white">{step.title}</h3>
                      </div>
                    </div>
                    <p className="text-slate-400 mb-4 leading-relaxed">{step.description}</p>
                    <ul className="flex flex-wrap gap-2">
                      {step.details.map((d) => (
                        <li
                          key={d}
                          className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400"
                        >
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
