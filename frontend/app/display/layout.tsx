/**
 * TV display segment: no dashboard chrome, no admin controls.
 * Pages here authenticate with device credentials only.
 */
export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#000", minHeight: "100vh" }}>{children}</div>;
}
