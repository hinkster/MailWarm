"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, AlertCircle, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { toast } from "sonner";

const PROVIDERS = [
  { value: "AZURE",      label: "Azure DNS",      logo: "🔵" },
  { value: "CLOUDFLARE", label: "Cloudflare",      logo: "🟠" },
  { value: "ROUTE53",    label: "AWS Route 53",    logo: "🟡" },
  { value: "MANUAL",     label: "Manual / Other",  logo: "⚙️" },
];

interface Props {
  token: string;
  domain: any;
  onRefresh: () => void;
}

export function DnsWizard({ token, domain, onRefresh }: Props) {
  const api = createApiClient(token);
  const [step, setStep] = useState<"provider" | "credentials" | "records" | "done">("provider");
  const [provider, setProvider] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [previewRecords, setPreviewRecords] = useState<any[]>([]);
  const [existingConfig, setExistingConfig] = useState<any>(null);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (domain.dnsConfig) {
      setExistingConfig(domain.dnsConfig);
      setStep("records");
    }
    // Load preview records
    api.dns.preview(domain.id).then((res) => setPreviewRecords(res.data ?? []));
  }, []);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      await api.dns.connect({ domainId: domain.id, provider, zoneId });
      toast.success(provider === "MANUAL" ? "DNS records generated" : "DNS records being provisioned...");
      setStep("records");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function handleVerify() {
    try {
      await api.dns.verify(domain.id);
      toast.success("Verification check queued — may take a few minutes");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const records = existingConfig?.records ?? previewRecords;

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-6">
        {["provider", "credentials", "records"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
              step === s ? "border-brand-500 bg-brand-500/20 text-brand-300" :
              ["records", "done"].includes(step) && i < 2 ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" :
              "border-white/10 bg-white/5 text-slate-500"
            }`}>
              {["records", "done"].includes(step) && i < 2 ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span className={`text-sm capitalize ${step === s ? "text-white" : "text-slate-500"}`}>{s}</span>
            {i < 2 && <div className="w-8 h-px bg-white/10" />}
          </div>
        ))}
      </div>

      {step === "provider" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <h3 className="font-semibold text-white">Select your DNS provider</h3>
          <div className="grid grid-cols-2 gap-3">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                onClick={() => setProvider(p.value)}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                  provider === p.value
                    ? "border-brand-500/60 bg-brand-500/10 text-white"
                    : "border-white/10 bg-white/3 text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                <span className="text-2xl">{p.logo}</span>
                <span className="text-sm font-medium">{p.label}</span>
              </button>
            ))}
          </div>
          {provider && (
            <button
              onClick={() => setStep(provider === "MANUAL" ? "records" : "credentials")}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white font-medium text-sm"
            >
              Continue with {PROVIDERS.find((p) => p.value === provider)?.label}
            </button>
          )}
        </motion.div>
      )}

      {step === "credentials" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <h3 className="font-semibold text-white">Connect {PROVIDERS.find((p) => p.value === provider)?.label}</h3>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              {provider === "CLOUDFLARE" ? "Zone ID" : provider === "ROUTE53" ? "Hosted Zone ID" : "DNS Zone Name"}
            </label>
            <input
              type="text"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              placeholder={provider === "CLOUDFLARE" ? "abc123..." : provider === "ROUTE53" ? "Z1234567890" : domain.name}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/60 transition-all text-sm font-mono"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep("provider")} className="flex-1 py-2.5 rounded-xl glass text-slate-400 text-sm">Back</button>
            <button
              onClick={handleConnect}
              disabled={connecting || !zoneId}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {connecting && <Loader2 className="w-4 h-4 animate-spin" />}
              Provision records
            </button>
          </div>
        </motion.div>
      )}

      {(step === "records" || existingConfig) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">DNS Records</h3>
            <button
              onClick={handleVerify}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-xs text-slate-400 hover:text-white"
            >
              <Loader2 className="w-3 h-3" /> Re-verify
            </button>
          </div>

          {provider === "MANUAL" && (
            <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-sm text-brand-300">
              Add these records to your DNS provider manually, then click Re-verify.
            </div>
          )}

          <div className="space-y-3">
            {records.map((record: any, i: number) => (
              <div key={i} className="glass rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300">{record.type}</span>
                    <span className="text-sm font-medium text-white">{record.name || record.description?.split(" ")[0]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.status === "VERIFIED" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {record.status === "PENDING"   && <Clock className="w-4 h-4 text-amber-400" />}
                    {record.status === "FAILED"    && <AlertCircle className="w-4 h-4 text-red-400" />}
                    <button
                      onClick={() => copy(record.value, `record-${i}`)}
                      className="text-slate-500 hover:text-white transition-colors"
                    >
                      {copied === `record-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <p className="text-xs font-mono text-slate-400 break-all leading-relaxed bg-white/3 rounded-lg p-2">
                  {record.value}
                </p>
                {record.description && (
                  <p className="text-xs text-slate-600 mt-1.5">{record.description}</p>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
