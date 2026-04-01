"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  return (
    <section className="py-24 px-6">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative rounded-3xl overflow-hidden"
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-brand-600/40 via-accent-purple/30 to-accent-cyan/20" />
          <div className="absolute inset-0 bg-gradient-mesh" />

          {/* Animated orbs */}
          <div className="absolute top-[-50%] right-[-20%] w-80 h-80 rounded-full bg-brand-500/20 blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-[-50%] left-[-10%] w-64 h-64 rounded-full bg-accent-purple/20 blur-3xl animate-pulse-slow" style={{ animationDelay: "2s" }} />

          <div className="relative text-center px-8 py-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Your competitors are<br />
              already warming.{" "}
              <span className="text-gradient">Are you?</span>
            </h2>
            <p className="text-slate-300 text-lg mb-10 max-w-xl mx-auto">
              Start your 14-day free trial today. No credit card required.
              Set up in under 5 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-slate-900 font-bold text-lg hover:bg-slate-100 transition-all duration-200 hover:scale-105"
              >
                Start free trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/contact"
                className="px-8 py-4 rounded-xl glass border-white/20 hover:border-white/40 text-white font-semibold text-lg transition-all"
              >
                Talk to sales
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
