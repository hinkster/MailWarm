"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Key, Plus, Trash2, Copy, Check, X, Loader2, AlertTriangle } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface Props { token: string }

export function ApiKeysClient({ token }: Props) {
  const api = createApiClient(token);
  const [keys, setKeys]         = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName]         = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey]     = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);

  async function load() {
    const res = await api.apiKeys.list();
    setKeys(res.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.apiKeys.create(name);
      setNewKey(res.key);
      setName("");
      setShowCreate(false);
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await api.apiKeys.revoke(id);
      toast.success("API key revoked");
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">API Keys</h2>
          <p className="text-sm text-slate-400 mt-0.5">Use these keys to authenticate REST and GraphQL API requests</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Create key
        </button>
      </div>

      {/* Newly created key banner */}
      <AnimatePresence>
        {newKey && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass rounded-xl p-4 border border-emerald-500/30 bg-emerald-500/5"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white mb-1">Save your API key now</p>
                <p className="text-xs text-slate-400 mb-3">This key will not be shown again.</p>
                <div className="flex items-center gap-2 font-mono text-sm text-slate-300 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                  <span className="flex-1 truncate">{newKey}</span>
                  <button onClick={() => copy(newKey)} className="text-slate-500 hover:text-white flex-shrink-0">
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button onClick={() => setNewKey(null)} className="text-slate-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create form modal */}
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
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="glass rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">Create API Key</h3>
                <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Key name</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Production integration"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/60 transition-all text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl glass text-slate-400 text-sm">Cancel</button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create key
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keys list */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />)}
          </div>
        ) : keys.length === 0 ? (
          <div className="p-10 text-center">
            <Key className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No API keys yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {["Name", "Key", "Last used", "Created", ""].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {keys.map((k: any) => (
                <tr key={k.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3 text-sm text-white font-medium">{k.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-400">{k.keyPrefix}••••••••</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{k.lastUsedAt ? formatDate(k.lastUsedAt) : "Never"}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDate(k.createdAt)}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                      title="Revoke key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
