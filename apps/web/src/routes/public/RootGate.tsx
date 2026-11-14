import { lazy, Suspense, useSyncExternalStore } from "react";
import { getSession, onSession } from "../../lib/api";
import { Layout } from "../../components/Layout";
import { DemoNotice } from "./DemoNotice";

const Landing = lazy(() => import("./landing/Landing").then((m) => ({ default: m.LandingPage })));

/** En "/" sin sesión se muestra la landing pública; con sesión, la app. */
export function RootGate() {
  const session = useSyncExternalStore(
    (cb) => onSession(cb),
    () => getSession(),
  );
  if (session)
    return (
      <div className="flex h-full flex-col print:block print:h-auto">
        <div className="min-h-0 flex-1 print:h-auto">
          <Layout />
        </div>
        <DemoNotice />
      </div>
    );
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  );
}
