import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { ApiKeysClient } from "@/components/settings/ApiKeysClient";

export default async function ApiKeysPage() {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header title="API Keys" />
      <main className="flex-1 overflow-auto p-6">
        <ApiKeysClient token={session!.apiToken} />
      </main>
    </div>
  );
}
