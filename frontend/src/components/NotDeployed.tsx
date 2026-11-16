export default function NotDeployed() {
  return (
    <div className="card warn">
      <strong>Contracts are not configured yet.</strong>
      <p className="small">
        Deploy the contracts (see <code>docs/demo-runbook.md</code>) and set the addresses in <code>frontend/.env.local</code>{" "}
        (template: <code>.env.example</code>). Nothing on this page is simulated: until then there is no data to show.
      </p>
    </div>
  );
}
