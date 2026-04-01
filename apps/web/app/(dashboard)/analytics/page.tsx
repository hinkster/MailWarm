import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { AnalyticsClient } from "@/components/analytics/AnalyticsClient";

export default async function AnalyticsPage() {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header title="Analytics" />
      <main className="flex-1 overflow-auto p-6">
        <AnalyticsClient token={session!.apiToken} />
      </main>
    </div>
  );
}
