"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, UserPlus, Trash2, ChevronDown, Loader2, Copy, Check } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface Props { token: string }

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-brand-500/20 text-brand-300 border-brand-500/30",
  ADMIN: "bg-accent-purple/20 text-purple-300 border-purple-500/30",
  MEMBER: "bg-white/5 text-slate-400 border-white/10",
};

export function TeamClient({ token }: Props) {
  const api = createApiClient(token);
  const [members, setMembers]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [form, setForm]         = useState({ email: "", role: "MEMBER" });
  const [tempCred, setTempCred] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied]     = useState(false);

  async function load() {
    try {
      const res = await api.team.list();
      setMembers(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await api.team.invite(form.email, form.role);
      toast.success(`${form.email} added to the team`);
      setShowInvite(false);
      setForm({ email: "", role: "MEMBER" });
      if (res.tempPassword) {
        setTempCred({ email: form.email, password: res.tempPassword });
      }
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, role: string) {
    try {
      await api.team.updateRole(memberId, role);
      toast.success("Role updated");
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleRemove(memberId: string, email: string) {
    if (!confirm(`Remove ${email} from the team?`)) return;
    try {
      await api.team.remove(memberId);
      toast.success("Member removed");
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function copyCredentials() {
    if (!tempCred) return;
    navigator.clipboard.writeText(`Email: ${tempCred.email}\nPassword: ${tempCred.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Team Members</h2>
          <p className="text-sm text-slate-400 mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-purple-500 text-white text-sm font-medium transition-all"
        >
          <UserPlus className="w-4 h-4" /> Invite member
        </button>
      </div>

      {/* Temp credentials banner */}
      <AnimatePresence>
        {tempCred && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass rounded-xl p-4 border border-amber-500/30 bg-amber-500/5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-amber-300 mb-1">New account created — share credentials</p>
                <p className="text-xs text-slate-400">This temporary password will not be shown again.</p>
                <div className="mt-2 font-mono text-sm text-slate-300 space-y-0.5">
                  <p>Email: <span className="text-white">{tempCred.email}</span></p>
                  <p>Password: <span className="text-white">{tempCred.password}</span></p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={copyCredentials}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-xs text-slate-400 hover:text-white"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => setTempCred(null)}
                  className="px-3 py-1.5 rounded-lg glass text-xs text-slate-500 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass rounded-2xl p-6 w-full max-w-md"
            >
              <h3 className="text-lg font-bold text-white mb-5">Invite Team Member</h3>
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="colleague@company.com"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/60 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-brand-500/60 transition-all text-sm"
                  >
                    <option value="MEMBER">Member — can view and use features</option>
                    <option value="ADMIN">Admin — can manage domains, mailboxes, and members</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowInvite(false)} className="flex-1 py-2.5 rounded-xl glass text-slate-400 text-sm">Cancel</button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {inviting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Send invite
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Members list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl overflow-hidden">
          <div className="divide-y divide-white/5">
            {members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500/30 to-accent-purple/30 border border-white/10 flex items-center justify-center text-sm font-semibold text-white">
                    {(m.user?.name ?? m.user?.email ?? "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{m.user?.name ?? m.user?.email}</p>
                    {m.user?.name && <p className="text-xs text-slate-500">{m.user?.email}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {m.role === "OWNER" ? (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${ROLE_COLORS.OWNER}`}>Owner</span>
                  ) : (
                    <div className="relative">
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        className={`pl-2.5 pr-7 py-1 rounded-full text-xs font-medium border bg-transparent appearance-none cursor-pointer ${ROLE_COLORS[m.role] ?? ROLE_COLORS.MEMBER}`}
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" />
                    </div>
                  )}

                  {m.role !== "OWNER" && (
                    <button
                      onClick={() => handleRemove(m.id, m.user?.email)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="px-5 py-12 text-center">
                <Users className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No team members yet. Invite your first colleague.</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
