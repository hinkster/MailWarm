"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Webhook, Plus, Trash2, ChevronDown, ChevronUp, Loader2, Copy, Check, Lock } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface Props { token: string }

const ALL_EVENTS = [
  { value: "email.sent",       label: "Email Sent" },
  { value: "email.delivered",  label: "Email Delivered" },
  { value: "email.opened",     label: "Email Opened" },
  { value: "email.clicked",    label: "Email Clicked" },
  { value: "email.bounced",    label: "Email Bounced" },
  { value: "email.complained", label: "Spam Complaint" },
  { value: "warming.started",  label: "Warming Started" },
  { value: "warming.paused",   label: "Warming Paused" },
  { value: "warming.completed",label: "Warming Completed" },
  { value: "domain.verified",  label: "Domain Verified" },
];

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "text-emerald-400",
  FAILED:  "text-red-400",
  PENDING: "text-amber-400",
};

export function WebhooksClient({ token }: Props) {
  const api = createApiClient(token);
  const [hooks, setHooks]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tierBlocked, setTierBlocked] = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [creating, setCreating]       = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [deliveries, setDeliveries]   = useState<Record<string, any[]>>({});
  const [secret, setSecret]           = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);
  const [form, setForm] = useState({ url: "", events: ["*"] });

  async function load() {
    try {
      const res = await api.webhooks.list();
      setHooks(res.data ?? []);
    } catch (err: any) {
      if (err.status === 403) setTierBlocked(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (form.events.length === 0) {
      toast.error("Select at least one event");
      return;
    }
    setCreating(true);
    try {
      const res = await api.webhooks.create(form.url, form.events);
      toast.success("Webhook endpoint created");
      if (res.secret) setSecret(res.secret);
      setShowCreate(false);
      setForm({ url: "", events: ["*"] });
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function loadDeliveries(webhookId: string) {
    if (deliveries[webhookId]) return;
    const res = await api.webhooks.deliveries(webhookId);
    setDeliveries((d) => ({ ...d, [webhookId]: res.data ?? [] }));
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadDeliveries(id);
    }
  }

  async function handleDelete(id: string, url: string) {
    if (!confirm(`Remove webhook endpoint ${url}?`)) return;
    try {
      await api.webhooks.delete(id);
      toast.success("Webhook removed");
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function toggleEvent(value: string) {
    if (value === "*") {
      setForm((f) => ({ ...f, events: ["*"] }));
      return;
    }
    setForm((f) => {
      const without = f.events.filter((e) => e !== "*" && e !== value);
      const add = !f.events.includes(value);
      return { ...f, events: add ? [...without, value] : without };
    });
  }

  function copySecret() {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (tierBlocked) {
    return (
      <div className="max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-brand-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Webhooks require Growth or higher</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
            Upgrade your plan to receive real-time HTTP notifications for email and warming events.
          </p>
          <a href="/settings/billing" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium">
            Upgrade plan
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Webhook Endpoints</h2>
          <p className="text-sm text-slate-400 mt-0.5">{hooks.length} endpoint{hooks.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-purple-500 text-white text-sm font-medium transition-all"
        >
          <Plus className="w-4 h-4" /> Add endpoint
        </button>
      </div>

      {/* Signing secret banner */}
      <AnimatePresence>
        {secret && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass rounded-xl p-4 border border-amber-500/30 bg-amber-500/5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-300 mb-1">Signing secret — save it now</p>
                <p className="text-xs text-slate-400 mb-2">This will not be shown again. Use it to verify webhook payloads.</p>
                <p className="font-mono text-xs text-white break-all bg-white/5 rounded-lg px-3 py-2">{secret}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={copySecret} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-xs text-slate-400 hover:text-white">
                  {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button onClick={() => setSecret(null)} className="px-3 py-1.5 rounded-lg glass text-xs text-slate-500 hover:text-white">
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              className="glass rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold text-white mb-5">Add Webhook Endpoint</h3>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Endpoint URL</label>
                  <input
                    type="url"
                    required
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="https://your-app.com/webhooks/mailwarm"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/60 transition-all text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Events to subscribe</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2.5 rounded-xl glass cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.events.includes("*")}
                        onChange={() => toggleEvent("*")}
                        className="accent-brand-500"
                      />
                      <span className="text-xs text-slate-300 font-medium">All events</span>
                    </label>
                    {ALL_EVENTS.map((evt) => (
                      <label key={evt.value} className="flex items-center gap-2 p-2.5 rounded-xl glass cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.events.includes("*") || form.events.includes(evt.value)}
                          onChange={() => toggleEvent(evt.value)}
                          disabled={form.events.includes("*")}
                          className="accent-brand-500"
                        />
                        <span className="text-xs text-slate-400">{evt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl glass text-slate-400 text-sm">Cancel</button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create endpoint
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Endpoint list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="glass rounded-2xl h-20 animate-pulse" />)}
        </div>
      ) : hooks.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-12 text-center">
          <Webhook className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-4">No webhook endpoints yet</p>
          <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium">
            Add your first endpoint
          </button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {hooks.map((h: any, i: number) => (
            <motion.div key={h.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono text-slate-300 truncate">{h.url}</p>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                    {(h.events as string[]).slice(0, 4).map((evt) => (
                      <span key={evt} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-500 font-mono">{evt}</span>
                    ))}
                    {h.events.length > 4 && (
                      <span className="text-xs text-slate-600">+{h.events.length - 4} more</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <span className={`text-xs ${h.enabled ? "text-emerald-400" : "text-slate-500"}`}>
                    {h.enabled ? "Active" : "Disabled"}
                  </span>
                  <button
                    onClick={() => toggleExpand(h.id)}
                    className="p-1.5 rounded-lg glass text-slate-500 hover:text-white transition-colors"
                  >
                    {expandedId === h.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(h.id, h.url)}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Delivery log */}
              <AnimatePresence>
                {expandedId === h.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-white/5 overflow-hidden"
                  >
                    <div className="p-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent Deliveries</p>
                      {(deliveries[h.id] ?? []).length === 0 ? (
                        <p className="text-xs text-slate-600 text-center py-4">No deliveries yet</p>
                      ) : (
                        <div className="space-y-2">
                          {(deliveries[h.id] ?? []).slice(0, 10).map((d: any) => (
                            <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-semibold ${STATUS_COLORS[d.status] ?? "text-slate-400"}`}>{d.status}</span>
                                <span className="text-xs text-slate-500 font-mono">{d.eventType}</span>
                              </div>
                              <div className="flex items-center gap-3 text-right">
                                {d.responseStatus && (
                                  <span className={`text-xs font-mono ${d.responseStatus < 300 ? "text-emerald-400" : "text-red-400"}`}>
                                    HTTP {d.responseStatus}
                                  </span>
                                )}
                                <span className="text-xs text-slate-600">{new Date(d.createdAt).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
