import { getSession } from "@/lib/session";
import { Header } from "@/components/dashboard/Header";
import { BillingClient } from "@/components/settings/BillingClient";

export default async function BillingPage() {
  const session = await getSession();
  return (
    <div className="flex flex-col h-full">
      <Header title="Billing" />
      <main className="flex-1 overflow-auto p-6">
        <BillingClient token={session!.apiToken} />
      </main>
    </div>
  );
}
