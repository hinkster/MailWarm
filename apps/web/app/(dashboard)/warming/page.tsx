import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { WarmingClient } from "@/components/warming/WarmingClient";

export default async function WarmingPage() {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header title="Warming" />
      <main className="flex-1 overflow-auto p-6">
        <WarmingClient token={session!.apiToken} />
      </main>
    </div>
  );
}
