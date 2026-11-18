import ActivityMonitor from "@/components/ActivityMonitor";
import NotDeployed from "@/components/NotDeployed";
import { isDeployed } from "@/lib/config";

export default function Activity() {
  return (
    <>
      <h1>Activity</h1>
      <p className="small">
        Every intent, the escrow&apos;s decision and the vault outcome, each linked to its transaction. &quot;Pending&quot; or &quot;Not found&quot; means no
        matching event exists on-chain yet; nothing here is estimated.
      </p>
      {isDeployed ? <ActivityMonitor /> : <NotDeployed />}
    </>
  );
}
