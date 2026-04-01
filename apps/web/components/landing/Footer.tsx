import Link from "next/link";
import { Zap } from "lucide-react";

const links = {
  Product: ["Features", "Pricing", "Changelog", "Roadmap"],
  Docs: ["API Reference", "GraphQL", "Webhooks", "SDKs"],
  Company: ["About", "Blog", "Careers", "Contact"],
  Legal: ["Privacy Policy", "Terms of Service", "Security", "GDPR"],
};

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-16 px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold">Mail<span className="text-gradient">Warm</span></span>
            </Link>
            <p className="text-sm text-slate-500 leading-relaxed">
              Domain warming and email deliverability intelligence for serious senders.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <h4 className="text-sm font-semibold text-white mb-4">{group}</h4>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item}>
                    <Link href="#" className="text-sm text-slate-500 hover:text-white transition-colors">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            © {new Date().getFullYear()} MailWarm, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span>🔒 SOC 2 Type II</span>
            <span>🇪🇺 GDPR Compliant</span>
            <span>☁️ Hosted on Azure</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
