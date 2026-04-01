"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Head of Growth",
    company: "Accel Portfolio Co.",
    avatar: "SC",
    quote:
      "We went from 23% inbox placement to 97% in 18 days. Our outbound pipeline revenue doubled the next quarter. MailWarm is the first tool I install at every company.",
    stars: 5,
    color: "from-brand-500 to-accent-purple",
  },
  {
    name: "Marcus Reid",
    role: "Founder",
    company: "ReachFlow.io",
    avatar: "MR",
    quote:
      "The automated DMARC setup saved us from a spoofing attack we didn't even know was happening. The DKIM/SPF wizard is the best I've seen — took 90 seconds.",
    stars: 5,
    color: "from-orange-500 to-rose-500",
  },
  {
    name: "Priya Nair",
    role: "Email Infrastructure Lead",
    company: "Series C SaaS",
    avatar: "PN",
    quote:
      "We manage 140 domains across 3 product lines. The multi-tenant setup with SSO was the only reason we chose MailWarm over competitors. Worth every penny of Pro.",
    stars: 5,
    color: "from-accent-cyan to-brand-500",
  },
  {
    name: "Tom Vasquez",
    role: "CTO",
    company: "Outbound Labs",
    avatar: "TV",
    quote:
      "The GraphQL API is clean, typed, and actually documented. We built our own warming dashboard on top in two days. Enterprise tier was a no-brainer.",
    stars: 5,
    color: "from-accent-green to-teal-400",
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-24 px-6">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-brand-400 text-sm font-semibold uppercase tracking-widest mb-3 block">
            Trusted by senders
          </span>
          <h2 className="text-4xl md:text-5xl font-bold">
            Don&apos;t take our{" "}
            <span className="text-gradient">word for it</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass rounded-2xl p-7 hover:border-white/20 transition-all duration-300"
            >
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: t.stars }).map((_, s) => (
                  <Star key={s} className="w-4 h-4 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <blockquote className="text-slate-300 leading-relaxed mb-6 text-[15px]">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}
                >
                  {t.avatar}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{t.name}</p>
                  <p className="text-slate-500 text-xs">{t.role} · {t.company}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
