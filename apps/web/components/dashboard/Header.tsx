"use client";

import { signOut, useSession } from "next-auth/react";
import { Bell, LogOut, User, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="h-16 border-b border-white/5 bg-slate-900/40 backdrop-blur flex items-center justify-between px-6 flex-shrink-0">
      <div>
        {title && <h1 className="text-lg font-semibold text-white">{title}</h1>}
        {session?.tenant && (
          <p className="text-xs text-slate-500">{session.tenant.name}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button className="w-8 h-8 rounded-lg glass flex items-center justify-center text-slate-400 hover:text-white transition-colors relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand-500" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass hover:bg-white/8 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center text-white text-xs font-bold">
              {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <span className="text-sm text-slate-300 hidden sm:block max-w-[120px] truncate">
              {session?.user?.name ?? session?.user?.email}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 glass rounded-xl border border-white/10 py-1 z-50">
              <div className="px-3 py-2 border-b border-white/5">
                <p className="text-xs text-slate-400 truncate">{session?.user?.email}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
