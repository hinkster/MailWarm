"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Shield, TrendingUp, Zap } from "lucide-react";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-5xl mx-auto text-center"
      >
        {/* Badge */}
        <motion.div variants={itemVariants} className="inline-flex items-center gap-2 mb-8">
          <span className="px-4 py-1.5 rounded-full glass border border-brand-500/40 text-brand-300 text-sm font-medium">
            <span className="mr-2">🔥</span>
            Now with automated SPF, DKIM & DMARC setup
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={itemVariants}
          className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
        >
          Land in the inbox.{" "}
          <span className="relative inline-block">
            <span className="text-gradient">Every. Single. Time.</span>
            <motion.span
              className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-accent-purple rounded-full"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
            />
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          variants={itemVariants}
          className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          MailWarm automatically warms your domains, provisions real mailboxes, and
          configures your DNS authentication — so your emails reach customers, not spam folders.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
        >
          <Link
            href="/register"
            className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-purple-500 text-white font-semibold text-lg transition-all duration-300 glow-brand hover:scale-105"
          >
            Start warming for free
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="#how-it-works"
            className="flex items-center gap-2 px-8 py-4 rounded-xl glass glass-hover text-slate-300 font-semibold text-lg"
          >
            See how it works
          </Link>
        </motion.div>

        {/* Trust signals */}
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500"
        >
          {[
            { icon: Shield, label: "SOC 2 Type II" },
            { icon: Zap, label: "14-day free trial" },
            { icon: TrendingUp, label: "No credit card required" },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <Icon className="w-4 h-4 text-brand-400" />
              {label}
            </span>
          ))}
        </motion.div>

        {/* Hero visual — animated dashboard mockup */}
        <motion.div
          variants={itemVariants}
          className="mt-20 relative mx-auto max-w-4xl"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10 pointer-events-none rounded-2xl" />
          <div className="glass rounded-2xl border border-white/10 p-6 glow-brand overflow-hidden">
            {/* Mock dashboard header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Domain Health</p>
                <p className="text-2xl font-bold text-white mt-0.5">acme.com</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-accent-green/20 text-accent-green text-sm font-medium border border-accent-green/30">
                Warming Active
              </span>
            </div>

            {/* Mock chart bars */}
            <div className="flex items-end gap-2 h-32 mb-4">
              {[15, 28, 42, 58, 71, 85, 91, 88, 94, 97, 99, 100].map((h, i) => (
                <motion.div
                  key={i}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-brand-600 to-accent-purple opacity-90"
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ delay: 0.5 + i * 0.07, duration: 0.5, ease: "easeOut" }}
                />
              ))}
            </div>

            {/* Mock stats row */}
            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-white/10">
              {[
                { label: "Inbox Rate", value: "98.2%", color: "text-accent-green" },
                { label: "Sent Today", value: "847", color: "text-brand-400" },
                { label: "Replies", value: "234", color: "text-accent-cyan" },
                { label: "Day", value: "22/30", color: "text-accent-purple" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
