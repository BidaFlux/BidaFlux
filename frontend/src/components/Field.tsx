import { useId, type ReactNode } from "react";

/** A label tied to its input, so screen readers announce it and clicking the label focuses the field. */
export default function Field({ label, children }: { label: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </>
  );
}
