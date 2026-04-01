"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldX, RefreshCw, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Props {
  token:    string;
  domainId: string;
}

function ScoreGauge({ score }: { score: number }) {
  const color =
    score >= 80 ? "#10b981" :
    score >= 60 ? "#06b6d4" :
    score >= 40 ? "#f59e0b" :
                  "#ef4444";

  const label =
    score >= 80 ? "Excellent" :
    score >= 60 ? "Good" :
    score >= 40 ? "Fair" :
                  "Poor";

  // SVG arc gauge (180° sweep)
  const r = 60;
  const cx = 80;
  const cy = 80;
  const startAngle = 180;
  const sweepAngle = 180 * (score / 100);

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(startAngle + sweepAngle));
  const y2 = cy + r * Math.sin(toRad(startAngle + sweepAngle));
  const largeArc = sweepAngle > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="100" viewBox="0 0 160 100">
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round"
        />
        {/* Score arc */}
        {score > 0 && (
          <path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          />
        )}
        {/* Score text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="28" fontWeight="700">
          {score}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b" fontSize="11">
          / 100
        </text>
      </svg>
      <span className="text-sm font-semibold mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

function SignalRow({ label, present, valid, value }: {
  label:   string;
  present: boolean;
  valid:   boolean;
  value:   string | null;
}) {
  const icon = !present
    ? <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
    : valid
    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
    : <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />;

  const statusText = !present ? "Missing" : valid ? "Valid" : "Present (weak policy)";
  const statusColor = !present ? "text-red-400" : valid ? "text-emerald-400" : "text-amber-400";

  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-white">{label}</span>
          <span className={`text-xs font-medium ${statusColor}`}>{statusText}</span>
        </div>
        {value && (
          <p className="text-xs font-mono text-slate-500 mt-1 truncate" title={value}>{value}</p>
        )}
      </div>
    </div>
  );
}

function BlacklistRow({ name, listed }: { name: string; listed: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-slate-400">{name}</span>
      {listed ? (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
          <XCircle className="w-3.5 h-3.5" /> Listed
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> Clean
        </span>
      )}
    </div>
  );
}

export function ReputationPanel({ token, domainId }: Props) {
  const api = createApiClient(token);
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  async function load() {
    try {
      const res = await api.reputation.get(domainId);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function triggerCheck() {
    setChecking(true);
    try {
      await api.reputation.check(domainId);
      toast.success("Reputation check queued — results will appear in ~30 seconds");
      // Poll for the result
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const res = await api.reputation.get(domainId);
        const latest = res.data?.latest;
        if (latest && (!data?.latest || latest.checkedAt > data.latest.checkedAt)) {
          setData(res.data);
          setChecking(false);
          clearInterval(poll);
          toast.success(`Reputation check complete — score: ${latest.score}/100`);
        }
        if (attempts >= 12) { clearInterval(poll); setChecking(false); }
      }, 5000);
    } catch (err: any) {
      toast.error(err.message);
      setChecking(false);
    }
  }

  const signals = data?.latest?.signals;
  const allBlacklists = signals
    ? [...(signals.ipBlacklists ?? []), ...(signals.domainBlacklists ?? [])]
    : [];
  const listedCount = allBlacklists.filter((b: any) => b.listed).length;

  // Chart data — last 30 checks ordered ascending
  const chartData = [...(data?.history ?? [])]
    .reverse()
    .map((h: any) => ({
      date:  new Date(h.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: h.score,
    }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Domain Reputation</h3>
          {data?.latest && (
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last checked {formatDate(data.latest.checkedAt)}
            </p>
          )}
        </div>
        <button
          onClick={triggerCheck}
          disabled={checking}
          className="flex items-center gap-2 px-3 py-2 rounded-xl glass text-sm text-slate-400 hover:text-white disabled:opacity-60 transition-colors"
        >
          {checking
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
          {checking ? "Checking..." : "Run check"}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-48 animate-pulse" />
          ))}
        </div>
      ) : !data?.latest ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-12 text-center"
        >
          <ShieldCheck className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 mb-4">No reputation data yet</p>
          <button
            onClick={triggerCheck}
            disabled={checking}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium flex items-center gap-2 mx-auto disabled:opacity-60"
          >
            {checking && <Loader2 className="w-4 h-4 animate-spin" />}
            Run first check
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Score gauge */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5">
            <h4 className="text-sm font-semibold text-white mb-4">Overall Score</h4>
            <div className="flex flex-col items-center">
              <ScoreGauge score={data.latest.score} />
              <div className="mt-4 w-full grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-slate-500">Blacklists</p>
                  <p className={`text-sm font-bold mt-0.5 ${listedCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {listedCount > 0 ? `${listedCount} listed` : "Clean"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">DNS Health</p>
                  <p className={`text-sm font-bold mt-0.5 ${
                    signals?.spf?.present && signals?.dkim?.present && signals?.dmarc?.present
                      ? "text-emerald-400" : "text-amber-400"
                  }`}>
                    {[signals?.spf?.present, signals?.dkim?.present, signals?.dmarc?.present].filter(Boolean).length}/3
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Bounce Rate</p>
                  <p className={`text-sm font-bold mt-0.5 ${
                    (signals?.metrics?.bounceRate ?? 0) > 5 ? "text-red-400" :
                    (signals?.metrics?.bounceRate ?? 0) > 2 ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {signals?.metrics?.bounceRate?.toFixed(1) ?? "0"}%
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Score history chart */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass rounded-2xl p-5">
            <h4 className="text-sm font-semibold text-white mb-4">Score History</h4>
            {chartData.length >= 2 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                    labelStyle={{ color: "#94a3b8" }}
                    formatter={(v: any) => [`${v}/100`, "Score"]}
                  />
                  <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40">
                <p className="text-sm text-slate-600">Run more checks to see trends</p>
              </div>
            )}
          </motion.div>

          {/* DNS records */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-5">
            <h4 className="text-sm font-semibold text-white mb-2">DNS Authentication</h4>
            <SignalRow label="SPF"   present={signals?.spf?.present}   valid={signals?.spf?.valid}   value={signals?.spf?.value} />
            <SignalRow label="DKIM"  present={signals?.dkim?.present}  valid={signals?.dkim?.valid}  value={signals?.dkim?.value} />
            <SignalRow label="DMARC" present={signals?.dmarc?.present} valid={signals?.dmarc?.valid} value={signals?.dmarc?.value} />
            {signals?.mxIp && (
              <div className="pt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">MX IP checked</span>
                <span className="font-mono text-slate-400">{signals.mxIp}</span>
              </div>
            )}
          </motion.div>

          {/* Blacklists */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-white">Blacklist Status</h4>
              {listedCount > 0 ? (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <ShieldX className="w-3.5 h-3.5" /> {listedCount} listing{listedCount > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" /> All clean
                </span>
              )}
            </div>
            <div className="max-h-52 overflow-y-auto pr-1">
              {allBlacklists.map((bl: any) => (
                <BlacklistRow key={bl.name} name={bl.name} listed={bl.listed} />
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
