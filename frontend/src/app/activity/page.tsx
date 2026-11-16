import ActivityMonitor from "@/components/ActivityMonitor";
import NotDeployed from "@/components/NotDeployed";
import { isDeployed } from "@/lib/config";

export default function Activity() {
  return (
    <>
      <h1>Reactive activity</h1>
      <p className="small">
        Every intent, the escrow&apos;s decision, and the vault outcome, each linked to its transaction on the block explorer.
      </p>
      {isDeployed ? <ActivityMonitor /> : <NotDeployed />}
    </>
  );
}
