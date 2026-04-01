import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { DomainsClient } from "@/components/domain/DomainsClient";

export default async function DomainsPage() {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header title="Domains" />
      <main className="flex-1 overflow-auto p-6">
        <DomainsClient token={session!.apiToken} />
      </main>
    </div>
  );
}
