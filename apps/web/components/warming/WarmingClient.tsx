"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Flame, Pause, Play, X, Loader2, ChevronDown } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { WarmingStatusBadge } from "@/components/ui/badge";
import { formatNumber, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface Props { token: string }

export function WarmingClient({ token }: Props) {
  const api = createApiClient(token);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [domains, setDomains]     = useState<any[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]   = useState(false);
  const [form, setForm] = useState({
    domainId: "", targetDailyVolume: 1000, rampCurve: "EXPONENTIAL",
    startDate: new Date().toISOString().slice(0, 10),
    autoReply: true, autoOpen: true, autoClick: false,
  });

  async function load() {
    try {
      const [s, d] = await Promise.all([api.warming.schedules(), api.domains.list()]);
      setSchedules(s.data ?? []);
      setDomains(d.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!form.targetDailyVolume || !form.rampCurve) return;
    api.warming.preview(form.rampCurve, form.targetDailyVolume, 30)
      .then((res) => setPreviewData(res.data ?? []));
  }, [form.targetDailyVolume, form.rampCurve]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.warming.create({
        ...form,
        startDate: new Date(form.startDate).toISOString(),
      });
      toast.success("Warming schedule created");
      setShowCreate(false);
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handlePause(id: string) {
    await api.warming.pause(id);
    toast.success("Warming paused");
    load();
  }

  async function handleResume(id: string) {
    await api.warming.resume(id);
    toast.success("Warming resumed");
    load();
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Warming Schedules</h2>
          <p className="text-sm text-slate-400 mt-0.5">{schedules.length} schedule{schedules.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 text-white text-sm font-medium transition-all"
        >
          <Plus className="w-4 h-4" /> New schedule
        </button>
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">Create Warming Schedule</h3>
                <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Domain</label>
                    <select
                      required
                      value={form.domainId}
                      onChange={(e) => setForm((f) => ({ ...f, domainId: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-brand-500/60 transition-all text-sm [&>option]:bg-slate-900 [&>option]:text-white"
                    >
                      <option value="">Select a domain...</option>
                      {domains.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Ramp Curve</label>
                    <select
                      value={form.rampCurve}
                      onChange={(e) => setForm((f) => ({ ...f, rampCurve: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/10 text-white focus:outline-none focus:border-brand-500/60 transition-all text-sm [&>option]:bg-slate-900 [&>option]:text-white"
                    >
                      <option value="EXPONENTIAL">Exponential (recommended for new domains)</option>
                      <option value="LINEAR">Linear (steady growth)</option>
                      <option value="AGGRESSIVE">Aggressive (existing domains)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Target daily volume</label>
                    <input
                      type="number"
                      required
                      min={10}
                      value={form.targetDailyVolume}
                      onChange={(e) => setForm((f) => ({ ...f, targetDailyVolume: parseInt(e.target.value) }))}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-brand-500/60 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Start date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-brand-500/60 transition-all text-sm"
                    />
                  </div>
                </div>

                {/* Ramp preview chart */}
                {previewData.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-2">30-day ramp preview</p>
                    <div className="glass rounded-xl p-3">
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={previewData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} interval={4} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                            formatter={(v: any) => [formatNumber(v), "emails"]}
                          />
                          <Bar dataKey="volume" fill="url(#warmGradient)" radius={[2, 2, 0, 0]} />
                          <defs>
                            <linearGradient id="warmGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f97316" />
                              <stop offset="100%" stopColor="#e11d48" stopOpacity={0.7} />
                            </linearGradient>
                          </defs>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Auto-behaviour toggles */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-300">Seed behaviour</p>
                  {[
                    { key: "autoReply", label: "Auto-reply to warming emails" },
                    { key: "autoOpen",  label: "Auto-open (inbox placement signal)" },
                    { key: "autoClick", label: "Auto-click links (advanced)" },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <div
                        onClick={() => setForm((f) => ({ ...f, [key]: !(f as any)[key] }))}
                        className={`w-9 h-5 rounded-full transition-colors ${(form as any)[key] ? "bg-brand-500" : "bg-white/10"} relative`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${(form as any)[key] ? "left-4" : "left-0.5"}`} />
                      </div>
                      <span className="text-sm text-slate-300">{label}</span>
                    </label>
                  ))}
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl glass text-slate-400 text-sm">Cancel</button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create schedule
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schedule list */}
      {loading ? (
        <div className="space-y-4">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="glass rounded-2xl h-40 animate-pulse" />)}</div>
      ) : schedules.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Flame className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 mb-4">No warming schedules yet</p>
          <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-white text-sm font-medium">
            Create your first schedule
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((s: any, i: number) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-white">{s.domain?.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <WarmingStatusBadge status={s.status} />
                    <span className="text-xs text-slate-500">Day {s.currentDay} · {formatNumber(s.targetDailyVolume)} target/day · {s.rampCurve.toLowerCase()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {s.status === "ACTIVE" && (
                    <button onClick={() => handlePause(s.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-xs text-slate-400 hover:text-white">
                      <Pause className="w-3.5 h-3.5" /> Pause
                    </button>
                  )}
                  {s.status === "PAUSED" && (
                    <button onClick={() => handleResume(s.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/30 text-xs text-orange-400 hover:bg-orange-500/30">
                      <Play className="w-3.5 h-3.5" /> Resume
                    </button>
                  )}
                </div>
              </div>

              {/* Mini progress bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Day {s.currentDay} of 30</span>
                  <span>{Math.round((s.currentDay / 30) * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500 transition-all"
                    style={{ width: `${Math.min((s.currentDay / 30) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Last 7 days mini chart */}
              {s.dailyLogs?.length > 0 && (
                <ResponsiveContainer width="100%" height={60}>
                  <BarChart data={s.dailyLogs.slice(-7)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <Bar dataKey="actualSent" fill="rgba(249,115,22,0.6)" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="targetVolume" fill="rgba(255,255,255,0.05)" radius={[2, 2, 0, 0]} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any, name: string) => [formatNumber(v), name === "actualSent" ? "Sent" : "Target"]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
