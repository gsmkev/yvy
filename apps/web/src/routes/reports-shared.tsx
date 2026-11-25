/** Resumen público de solo lectura de una estancia: /compartido/:token, sin sesión ni menú. */
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Spinner } from "../components/ui";
import { t } from "../lib/i18n";
import { NotFound } from "../components/NotFound";
import { SharedBody, type SharedSummary } from "./reports-shared/SharedBody";

class SharedError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(reason ?? String(status));
  }
}

async function fetchShared(token: string): Promise<SharedSummary> {
  const res = await fetch(`/public/shared/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    throw new SharedError(res.status, body.reason ?? null);
  }
  return (await res.json()) as SharedSummary;
}

/** Qué decirle a quien abre un enlace vencido, revocado o inexistente. */
function missingMessage(error: unknown) {
  const reason = error instanceof SharedError ? error.reason : null;
  if (reason === "expired") return t("ui.shared.expiredMsg");
  return reason === "revoked" ? t("ui.shared.revokedMsg") : t("ui.notfound.sharedBody");
}

/** Resumen público de solo lectura al que se llega con el enlace compartido. */
export function SharedPage() {
  const { token } = useParams({ from: "/compartido/$token" });
  const q = useQuery({ queryKey: ["shared", token], queryFn: () => fetchShared(token), retry: false });
  if (q.error) return <NotFound message={missingMessage(q.error)} />;
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 lg:px-10">
      <p className="font-serif text-2xl font-semibold">{t("ui.app.name")}</p>
      {q.isLoading && <Spinner rows={4} h={72} />}
      {q.data && <SharedBody d={q.data} />}
    </main>
  );
}
