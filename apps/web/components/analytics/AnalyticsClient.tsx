"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createApiClient } from "@/lib/api-client";
import { formatPercent, formatNumber, isoDate } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

interface Props { token: string }

const RANGES = [
  { label: "7 days",  days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

const LINE_COLORS = { SENT: "#6366f1", DELIVERED: "#10b981", OPENED: "#06b6d4", CLICKED: "#a855f7", BOUNCED: "#ef4444" };

export function AnalyticsClient({ token }: Props) {
  const api = createApiClient(token);
  const [range, setRange]         = useState(7);
  const [metrics, setMetrics]     = useState<any>(null);
  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [dmarcReports, setDmarc]  = useState<any[]>([]);
  const [tab, setTab]             = useState<"deliverability" | "dmarc">("deliverability");
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const from = isoDate(-range);
      const to   = isoDate();
      const [m, ts, dr] = await Promise.all([
        api.analytics.metrics({ from, to }),
        api.analytics.timeseries({ from, to }),
        api.analytics.dmarc(),
      ]);
      setMetrics(m.data);
      setTimeseries(ts.data ?? []);
      setDmarc(dr.data ?? []);
      setLoading(false);
    }
    load();
  }, [range]);

  const dmarcPassFail = dmarcReports.reduce(
    (acc, r) => ({ pass: acc.pass + r.passCount, fail: acc.fail + r.failCount }),
    { pass: 0, fail: 0 }
  );

  return (
    <div className="max-w-6xl space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 glass rounded-xl p-1">
          {["deliverability", "dmarc"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                tab === t ? "bg-brand-500/20 text-brand-300 border border-brand-500/20" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {t === "dmarc" ? "DMARC" : "Deliverability"}
            </button>
          ))}
        </div>

        <div className="flex gap-1 glass rounded-xl p-1">
          {RANGES.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => setRange(days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                range === days ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "deliverability" && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Sent",       value: formatNumber(metrics?.sent ?? 0),            color: "text-brand-400" },
              { label: "Open Rate",  value: formatPercent(metrics?.openRate ?? 0),       color: "text-accent-cyan" },
              { label: "Click Rate", value: formatPercent(metrics?.clickRate ?? 0),      color: "text-accent-purple" },
              { label: "Bounce Rate",value: formatPercent(metrics?.bounceRate ?? 0),     color: metrics?.bounceRate > 5 ? "text-red-400" : "text-accent-green" },
              { label: "Reply Rate", value: formatPercent(metrics?.replyRate ?? 0),      color: "text-amber-400" },
            ].map(({ label, value, color }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-xl p-4"
              >
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </motion.div>
            ))}
          </div>

          {/* Timeseries chart */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-5"
          >
            <h2 className="font-semibold text-white mb-4">Email Volume Over Time</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={timeseries} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                {Object.entries(LINE_COLORS).map(([key, color]) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} name={key.charAt(0) + key.slice(1).toLowerCase()} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </>
      )}

      {tab === "dmarc" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pass/fail pie */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-5"
            >
              <h2 className="font-semibold text-white mb-4">DMARC Pass / Fail</h2>
              {dmarcPassFail.pass + dmarcPassFail.fail > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Pass", value: dmarcPassFail.pass },
                        { name: "Fail", value: dmarcPassFail.fail },
                      ]}
                      cx="50%" cy="50%" outerRadius={80} dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1e293b", borderRadius: 8 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 text-sm text-center py-10">No DMARC reports yet</p>
              )}
            </motion.div>

            {/* Summary */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-5"
            >
              <h2 className="font-semibold text-white mb-4">Summary</h2>
              <div className="space-y-3">
                {[
                  { label: "Reports received",  value: dmarcReports.length },
                  { label: "Total PASS",         value: formatNumber(dmarcPassFail.pass),  color: "text-emerald-400" },
                  { label: "Total FAIL",         value: formatNumber(dmarcPassFail.fail),  color: dmarcPassFail.fail > 0 ? "text-red-400" : "text-slate-400" },
                  { label: "Pass rate",          value: formatPercent(dmarcPassFail.pass + dmarcPassFail.fail > 0 ? (dmarcPassFail.pass / (dmarcPassFail.pass + dmarcPassFail.fail)) * 100 : 0), color: "text-emerald-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-slate-400">{label}</span>
                    <span className={`text-sm font-semibold ${color ?? "text-white"}`}>{value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Reports table */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/5">
              <h2 className="font-semibold text-white">Recent Reports</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Reporting Org", "Domain", "Date Range", "Pass", "Fail"].map((h) => (
                      <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dmarcReports.map((r: any) => (
                    <tr key={r.id} className="hover:bg-white/3 transition-colors">
                      <td className="px-5 py-3 text-sm text-slate-300">{r.reportingOrg}</td>
                      <td className="px-5 py-3 text-sm font-mono text-slate-400">{r.domain}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{new Date(r.dateRangeBegin).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-sm text-emerald-400 font-semibold">{r.passCount}</td>
                      <td className="px-5 py-3 text-sm font-semibold">{r.failCount > 0 ? <span className="text-red-400">{r.failCount}</span> : <span className="text-slate-600">0</span>}</td>
                    </tr>
                  ))}
                  {dmarcReports.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">No DMARC reports received yet. Set up your DMARC record first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
