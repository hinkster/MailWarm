"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Plus, Globe, X, Loader2, Flame, BarChart2 } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { DomainStatusBadge, WarmingStatusBadge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props { token: string }

export function DomainsClient({ token }: Props) {
  const api = createApiClient(token);
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const res = await api.domains.list();
      setDomains(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await api.domains.create(newDomain.trim());
      toast.success(`Domain ${newDomain} added`);
      setNewDomain("");
      setShowAdd(false);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add domain");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Your Domains</h2>
          <p className="text-sm text-slate-400 mt-0.5">{domains.length} domain{domains.length !== 1 ? "s" : ""} connected</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-purple-500 text-white text-sm font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Add domain
        </button>
      </div>

      {/* Add domain modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">Add a domain</h3>
                <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Domain name</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="acme.com"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition-all"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">
                    Enter the root domain only (e.g. <code className="text-brand-400">acme.com</code>)
                  </p>
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="flex-1 py-2.5 rounded-xl glass text-slate-400 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adding}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {adding && <Loader2 className="w-4 h-4 animate-spin" />}
                    Add domain
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Domain grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-36 animate-pulse" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Globe className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 mb-1">No domains connected yet</p>
          <p className="text-sm text-slate-600 mb-4">Add your first domain to start warming</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium"
          >
            Add your first domain
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {domains.map((d: any, i: number) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="glass rounded-2xl p-5 hover:border-white/20 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center">
                    <Globe className="w-4.5 h-4.5 text-brand-400" />
                  </div>
                  <div>
                    <Link
                      href={`/domains/${d.id}`}
                      className="font-semibold text-white hover:text-brand-400 transition-colors"
                    >
                      {d.name}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <DomainStatusBadge status={d.status} />
                      {d.warmingSchedule && <WarmingStatusBadge status={d.warmingSchedule.status} />}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">{d.reputationScore ?? "—"}</p>
                  <p className="text-xs text-slate-500">score</p>
                </div>
              </div>

              {/* Reputation bar */}
              <div className="h-1.5 rounded-full bg-white/10 mb-4">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-green transition-all duration-700"
                  style={{ width: `${d.reputationScore ?? 0}%` }}
                />
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>{d._count?.mailboxes ?? 0} mailboxes</span>
                {d.warmingSchedule && (
                  <span>Day {d.warmingSchedule.currentDay} of warming</span>
                )}
              </div>

              <div className="flex gap-2 mt-4">
                <Link
                  href={`/domains/${d.id}`}
                  className="flex-1 py-2 text-center rounded-lg glass text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Manage
                </Link>
                {!d.warmingSchedule && (
                  <Link
                    href={`/warming?domainId=${d.id}`}
                    className="flex-1 py-2 text-center rounded-lg bg-orange-500/15 border border-orange-500/20 text-xs text-orange-400 hover:bg-orange-500/25 transition-colors flex items-center justify-center gap-1"
                  >
                    <Flame className="w-3.5 h-3.5" /> Start warming
                  </Link>
                )}
                <Link
                  href={`/analytics?domainId=${d.id}`}
                  className="py-2 px-3 rounded-lg glass text-xs text-slate-400 hover:text-white transition-colors"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
