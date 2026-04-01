import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { OverviewDashboard } from "@/components/dashboard/OverviewDashboard";

export default async function DashboardPage() {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header title="Overview" />
      <main className="flex-1 overflow-auto p-6">
        <OverviewDashboard token={session!.apiToken} />
      </main>
    </div>
  );
}
