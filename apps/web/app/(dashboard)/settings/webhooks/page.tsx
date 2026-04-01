import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { WebhooksClient } from "@/components/settings/WebhooksClient";

export default async function WebhooksPage() {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header title="Webhooks" />
      <main className="flex-1 overflow-auto p-6">
        <WebhooksClient token={session!.apiToken} />
      </main>
    </div>
  );
}
