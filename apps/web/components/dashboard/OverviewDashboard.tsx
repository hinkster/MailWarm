"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Flame, TrendingUp, Mail, AlertTriangle, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { createApiClient } from "@/lib/api-client";
import { formatNumber, formatPercent, isoDate } from "@/lib/utils";
import { DomainStatusBadge, WarmingStatusBadge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Props { token: string }

export function OverviewDashboard({ token }: Props) {
  const api = createApiClient(token);
  const [domains, setDomains]         = useState<any[]>([]);
  const [schedules, setSchedules]     = useState<any[]>([]);
  const [metrics, setMetrics]         = useState<any>(null);
  const [timeseries, setTimeseries]   = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [d, s, m, ts] = await Promise.all([
          api.analytics.domains(),
          api.warming.schedules(),
          api.analytics.metrics({ from: isoDate(-7), to: isoDate() }),
          api.analytics.timeseries({ from: isoDate(-7), to: isoDate() }),
        ]);
        setDomains(d.data ?? []);
        setSchedules(s.data ?? []);
        setMetrics(m.data);
        setTimeseries(ts.data ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = [
    { label: "Total Domains",    value: domains.length,               icon: Globe,      color: "from-brand-500 to-accent-purple" },
    { label: "Active Warming",   value: schedules.filter((s: any) => s.status === "ACTIVE").length, icon: Flame, color: "from-orange-500 to-rose-500" },
    { label: "Emails Sent (7d)", value: formatNumber(metrics?.sent ?? 0),  icon: Mail,       color: "from-accent-cyan to-brand-500" },
    { label: "Avg Inbox Rate",   value: metrics ? formatPercent(100 - (metrics.bounceRate ?? 0)) : "—", icon: TrendingUp, color: "from-accent-green to-teal-400" },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-5 h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="glass rounded-2xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-slate-400">{card.label}</p>
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                  <Icon className="w-4.5 h-4.5 text-white" />
                </div>
              </div>
              <p className="text-3xl font-bold text-white">{card.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Chart + domain list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email volume chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 glass rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-white">Email Volume (last 7 days)</h2>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeseries} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Line type="monotone" dataKey="SENT"      stroke="#6366f1" strokeWidth={2} dot={false} name="Sent" />
              <Line type="monotone" dataKey="DELIVERED" stroke="#10b981" strokeWidth={2} dot={false} name="Delivered" />
              <Line type="monotone" dataKey="OPENED"    stroke="#06b6d4" strokeWidth={2} dot={false} name="Opened" />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Metrics summary */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass rounded-2xl p-5"
        >
          <h2 className="font-semibold text-white mb-4">7-Day Summary</h2>
          <div className="space-y-4">
            {[
              { label: "Open Rate",    value: formatPercent(metrics?.openRate ?? 0),   color: "text-brand-400" },
              { label: "Click Rate",   value: formatPercent(metrics?.clickRate ?? 0),  color: "text-accent-cyan" },
              { label: "Bounce Rate",  value: formatPercent(metrics?.bounceRate ?? 0), color: metrics?.bounceRate > 5 ? "text-red-400" : "text-accent-green" },
              { label: "Reply Rate",   value: formatPercent(metrics?.replyRate ?? 0),  color: "text-accent-purple" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{label}</span>
                <span className={`text-sm font-semibold ${color}`}>{value}</span>
              </div>
            ))}
            {metrics?.bounceRate > 5 && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mt-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">High bounce rate detected. Check domain configuration.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Domains table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="font-semibold text-white">Domains</h2>
          <Link href="/domains" className="text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1">
            View all <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {["Domain", "Status", "Warming", "Reputation", "Mailboxes"].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {domains.slice(0, 5).map((d: any) => (
                <tr key={d.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-4">
                    <Link href={`/domains/${d.id}`} className="text-sm font-medium text-white hover:text-brand-400 transition-colors">
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4"><DomainStatusBadge status={d.status} /></td>
                  <td className="px-5 py-4">
                    {d.warmingSchedule
                      ? <WarmingStatusBadge status={d.warmingSchedule.status} />
                      : <span className="text-xs text-slate-600">Not started</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 max-w-[80px]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-green"
                          style={{ width: `${d.reputationScore ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{d.reputationScore ?? 0}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400">{d._count?.mailboxes ?? 0}</td>
                </tr>
              ))}
              {domains.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">
                    No domains yet.{" "}
                    <Link href="/domains" className="text-brand-400 hover:text-brand-300">Add your first domain →</Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
