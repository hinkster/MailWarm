"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Shield, Lock, ExternalLink } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { TIER_LIMITS } from "@mailwarm/shared/src/constants/tiers";
import type { TierName } from "@mailwarm/database";

interface Props { token: string }

export function SsoClient({ token }: Props) {
  const api = createApiClient(token);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.billing.subscription().then((r) => { setSub(r.data); setLoading(false); });
  }, []);

  const tier = (sub?.tier ?? "STARTER") as TierName;
  const hasSso = TIER_LIMITS[tier]?.sso ?? false;

  if (loading) return <div className="glass rounded-2xl h-48 animate-pulse" />;

  if (!hasSso) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl">
        <div className="glass rounded-2xl p-8 text-center border border-amber-500/20">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">SSO requires Pro or Enterprise</h2>
          <p className="text-slate-400 mb-6">
            Single Sign-On via SAML 2.0 or OIDC is available on the Pro plan and above. Upgrade to enable Okta, Azure AD, Google Workspace and more.
          </p>
          <a
            href="/settings/billing"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white font-semibold text-sm"
          >
            Upgrade to Pro <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Single Sign-On (SSO)</h2>
        <p className="text-sm text-slate-400 mt-0.5">Configure SAML 2.0 or OIDC for your organisation via WorkOS</p>
      </div>

      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <p className="font-semibold text-white">Configure SSO Connection</p>
            <p className="text-xs text-slate-400">Powered by WorkOS — supports Okta, Azure AD, Google, SAML, OIDC</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Allowed email domain</label>
            <input
              type="text"
              placeholder="acme.com"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/60 transition-all text-sm"
            />
            <p className="text-xs text-slate-500 mt-1.5">Users with this domain will be auto-matched to your SSO connection</p>
          </div>

          <div className="p-4 rounded-xl bg-white/3 border border-white/5 text-sm text-slate-400 space-y-2">
            <p className="font-medium text-slate-300">WorkOS setup steps:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Create an organisation in your WorkOS dashboard</li>
              <li>Add your IdP connection (Okta, Azure AD, Google, etc.)</li>
              <li>Enter the Organisation ID below and click Connect</li>
            </ol>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">WorkOS Organisation ID</label>
            <input
              type="text"
              placeholder="org_01234..."
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/60 transition-all text-sm font-mono"
            />
          </div>

          <button className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-600 to-accent-purple text-white font-semibold text-sm">
            Save SSO configuration
          </button>
        </div>
      </div>

      <a
        href="https://workos.com/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300"
      >
        <ExternalLink className="w-4 h-4" />
        WorkOS documentation
      </a>
    </motion.div>
  );
}
