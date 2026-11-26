import { STATUS_LABEL, type AuctionStatus } from "@/lib/status";

export default function StatusBadge({ status }: { status: AuctionStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
