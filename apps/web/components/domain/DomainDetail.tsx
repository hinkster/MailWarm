"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Globe, RefreshCw, Plus, Trash2, Copy, Check } from "lucide-react";
import Link from "next/link";
import { createApiClient } from "@/lib/api-client";
import { DomainStatusBadge, WarmingStatusBadge } from "@/components/ui/badge";
import { DnsWizard } from "./DnsWizard";
import { ReputationPanel } from "./ReputationPanel";
import { toast } from "sonner";

interface Props { token: string; domainId: string }

export function DomainDetail({ token, domainId }: Props) {
  const api = createApiClient(token);
  const [domain, setDomain] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "mailboxes" | "dns" | "warming" | "reputation">("overview");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const res = await api.domains.get(domainId);
    setDomain(res.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addMailbox() {
    try {
      await api.mailboxes.create(domainId);
      toast.success("Mailbox provisioning started");
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function verifyDomain() {
    try {
      await api.domains.verify(domainId);
      toast.success("Verification check queued");
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return <div className="glass rounded-2xl h-64 animate-pulse" />;
  }

  if (!domain) {
    return <p className="text-slate-400">Domain not found.</p>;
  }

  const tabs = ["overview", "mailboxes", "dns", "warming", "reputation"] as const;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-4">
        <Link href="/domains" className="text-slate-500 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{domain.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <DomainStatusBadge status={domain.status} />
              {domain.warmingSchedule && <WarmingStatusBadge status={domain.warmingSchedule.status} />}
            </div>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {domain.status === "PENDING_VERIFICATION" && (
            <button onClick={verifyDomain} className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-sm text-slate-300 hover:text-white">
              <RefreshCw className="w-3.5 h-3.5" /> Verify
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              tab === t ? "bg-brand-500/20 text-brand-300 border border-brand-500/20" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {tab === "overview" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Reputation Score", value: domain.reputationScore ?? "—" },
              { label: "Mailboxes",        value: domain.mailboxes?.length ?? 0 },
              { label: "DNS Records",      value: domain.dnsConfig?.records?.length ?? 0 },
              { label: "Warming Day",      value: domain.warmingSchedule?.currentDay ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="glass rounded-2xl p-5">
                <p className="text-sm text-slate-400 mb-1">{label}</p>
                <p className="text-3xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "mailboxes" && (
          <div className="glass rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="font-semibold text-white">Mailboxes</h3>
              <button
                onClick={addMailbox}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-300 text-sm hover:bg-brand-500/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Provision mailbox
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Address", "Status", "Role"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {domain.mailboxes?.map((m: any) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3 text-sm font-mono text-slate-300">{m.address}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === "ACTIVE" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}`}>
                        {m.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{m.role.toLowerCase()}</td>
                  </tr>
                ))}
                {(!domain.mailboxes || domain.mailboxes.length === 0) && (
                  <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-slate-500">No mailboxes yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "dns" && (
          <DnsWizard token={token} domain={domain} onRefresh={load} />
        )}

        {tab === "reputation" && (
          <ReputationPanel token={token} domainId={domainId} />
        )}

        {tab === "warming" && (
          <div className="glass rounded-2xl p-6">
            {domain.warmingSchedule ? (
              <div>
                <h3 className="font-semibold text-white mb-4">Warming Schedule</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Status",       value: domain.warmingSchedule.status },
                    { label: "Day",          value: `${domain.warmingSchedule.currentDay}` },
                    { label: "Target/day",   value: domain.warmingSchedule.targetDailyVolume },
                    { label: "Curve",        value: domain.warmingSchedule.rampCurve },
                  ].map(({ label, value }) => (
                    <div key={label} className="glass rounded-xl p-4">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="text-lg font-bold text-white mt-1">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-3">No warming schedule yet</p>
                <Link
                  href={`/warming?domainId=${domain.id}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium"
                >
                  Start warming this domain
                </Link>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
