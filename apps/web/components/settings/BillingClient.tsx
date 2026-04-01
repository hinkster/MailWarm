"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, Zap, Check, ExternalLink, Loader2 } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { TIER_PRICING } from "@mailwarm/shared/src/constants/tiers";
import { toast } from "sonner";

interface Props { token: string }

const TIERS = [
  { name: "Starter",    key: "STARTER",    features: ["3 domains", "500 emails/day", "REST API"] },
  { name: "Growth",     key: "GROWTH",     features: ["10 domains", "5,000 emails/day", "GraphQL + Webhooks"] },
  { name: "Pro",        key: "PRO",        features: ["35 domains", "25,000 emails/day", "SSO / SAML"], highlight: true },
  { name: "Enterprise", key: "ENTERPRISE", features: ["Unlimited", "Dedicated IPs", "White-label"] },
];

export function BillingClient({ token }: Props) {
  const api = createApiClient(token);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    api.billing.subscription().then((r) => { setSub(r.data); setLoading(false); });
  }, []);

  async function handleUpgrade(tier: string) {
    if (tier === "ENTERPRISE") {
      window.location.href = "/contact?plan=enterprise";
      return;
    }
    setUpgrading(tier);
    try {
      const res = await api.billing.checkout(tier);
      window.location.href = res.url;
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpgrading(null);
    }
  }

  async function handlePortal() {
    setOpeningPortal(true);
    try {
      const res = await api.billing.portal();
      window.location.href = res.url;
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setOpeningPortal(false);
    }
  }

  if (loading) return <div className="glass rounded-2xl h-48 animate-pulse" />;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Current plan */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Current plan</p>
              <p className="text-xl font-bold text-white">{sub?.tier ?? "Starter"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              sub?.status === "ACTIVE"   ? "bg-emerald-500/20 text-emerald-400" :
              sub?.status === "TRIALING" ? "bg-brand-500/20 text-brand-400" :
              "bg-amber-500/20 text-amber-400"
            }`}>
              {sub?.status?.toLowerCase() ?? "trialing"}
            </span>
            {sub?.stripeCustomerId && (
              <button
                onClick={handlePortal}
                disabled={openingPortal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-sm text-slate-400 hover:text-white"
              >
                {openingPortal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                Manage billing
              </button>
            )}
          </div>
        </div>
        {sub?.currentPeriodEnd && (
          <p className="text-xs text-slate-500 mt-3">
            {sub.cancelAtPeriodEnd ? "Cancels" : "Renews"} on {new Date(sub.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
        {sub?.status === "TRIALING" && sub?.trialEndsAt && (
          <div className="mt-3 p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-sm text-brand-300">
            Your free trial ends on {new Date(sub.trialEndsAt).toLocaleDateString()}. Upgrade now to keep access.
          </div>
        )}
      </motion.div>

      {/* Upgrade options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TIERS.map((tier, i) => {
          const price = TIER_PRICING[tier.key as keyof typeof TIER_PRICING];
          const isCurrent = sub?.tier === tier.key;

          return (
            <motion.div
              key={tier.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`relative rounded-2xl p-5 flex flex-col ${
                tier.highlight ? "bg-gradient-to-b from-brand-600/20 to-accent-purple/10 border border-brand-500/40" : "glass"
              } ${isCurrent ? "ring-1 ring-brand-500/50" : ""}`}
            >
              {tier.highlight && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-purple text-white text-xs font-semibold">
                    <Zap className="w-3 h-3" /> Popular
                  </span>
                </div>
              )}

              <h3 className="font-bold text-white mb-1">{tier.name}</h3>
              <div className="mb-3">
                {price.monthly ? (
                  <p className="text-2xl font-bold text-white">${price.monthly / 100}<span className="text-sm text-slate-400">/mo</span></p>
                ) : (
                  <p className="text-2xl font-bold text-gradient">Custom</p>
                )}
              </div>

              <ul className="space-y-1.5 mb-4 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-400">
                    <Check className="w-3 h-3 text-accent-green flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade(tier.key)}
                disabled={isCurrent || !!upgrading}
                className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                  isCurrent ? "glass text-slate-500 cursor-not-allowed" :
                  tier.highlight ? "bg-gradient-to-r from-brand-600 to-accent-purple hover:from-brand-500 hover:to-purple-500 text-white" :
                  "glass text-slate-300 hover:text-white hover:border-white/20"
                }`}
              >
                {upgrading === tier.key && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isCurrent ? "Current plan" : tier.key === "ENTERPRISE" ? "Contact sales" : "Upgrade"}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
