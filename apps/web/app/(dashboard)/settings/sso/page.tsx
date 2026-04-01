import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { SsoClient } from "@/components/settings/SsoClient";

export default async function SsoPage() {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header title="Single Sign-On" />
      <main className="flex-1 overflow-auto p-6">
        <SsoClient token={session!.apiToken} />
      </main>
    </div>
  );
}
