import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { TeamClient } from "@/components/settings/TeamClient";

export default async function TeamPage() {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header title="Team" />
      <main className="flex-1 overflow-auto p-6">
        <TeamClient token={session!.apiToken} />
      </main>
    </div>
  );
}
