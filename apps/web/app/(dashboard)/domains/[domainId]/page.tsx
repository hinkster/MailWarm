import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { DomainDetail } from "@/components/domain/DomainDetail";

export default async function DomainDetailPage({ params }: { params: { domainId: string } }) {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header />
      <main className="flex-1 overflow-auto p-6">
        <DomainDetail token={session!.apiToken} domainId={params.domainId} />
      </main>
    </div>
  );
}
