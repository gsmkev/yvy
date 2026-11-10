import { lazy, Suspense, useSyncExternalStore } from "react";
import { getSession, onSession } from "../../lib/api";
import { Layout } from "../../components/Layout";

const Landing = lazy(() => import("./landing").then((m) => ({ default: m.LandingPage })));

/** En "/" sin sesión se muestra la landing pública; con sesión, la app. */
export function RootGate() {
  const session = useSyncExternalStore(
    (cb) => onSession(cb),
    () => getSession(),
  );
  if (session) return <Layout />;
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  );
}
