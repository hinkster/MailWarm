"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SsoCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      // Store token and redirect to dashboard
      localStorage.setItem("mw_token", token);
      router.replace("/");
    } else {
      router.replace("/login?error=sso_failed");
    }
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400 mx-auto mb-3" />
        <p className="text-slate-400">Completing sign-in...</p>
      </div>
    </div>
  );
}
