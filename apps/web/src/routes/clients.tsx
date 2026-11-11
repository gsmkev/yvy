import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BRAND } from "@yvy/shared";
import { FarmMap } from "../components/FarmMap";
import { Empty, ErrorBox, Spinner } from "../components/ui";
import { get, getSession, post, setSession, type Session } from "../lib/api";
import { fmtDate, fmtHa } from "../lib/format";
import { t, tk } from "../lib/i18n";

interface ClientFarm {
  id: string;
  name: string;
  department: string | null;
  areaHa: number;
  centroidLon: number;
  centroidLat: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  activeAlerts: number;
  lastRecordAt: number | null;
}
interface Client {
  organization: { id: string; name: string; role: string };
  farms: ClientFarm[];
  alerts: { id: string; farmId: string; kind: string; severity: string; summary: string }[];
}

/** K-02: todos los clientes del agrónomo en un mapa, con sus avisos. Un clic cambia de organización y abre la estancia. */
export function ClientsPage() {
  const q = useQuery({ queryKey: ["clients"], queryFn: () => get<{ clients: Client[]; truncated: boolean }>("/me/clients") });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const current = getSession()?.organization.id;

  const points = useMemo(
    () =>
      (q.data?.clients ?? []).flatMap((c) =>
        c.farms.map((f) => ({
          id: `${c.organization.id}|${f.id}`,
          lon: f.centroidLon,
          lat: f.centroidLat,
          color: f.activeAlerts > 0 ? BRAND.alerta : BRAND.soja,
        })),
      ),
    [q.data],
  );
  const bounds = useMemo<[number, number, number, number] | null>(() => {
    const farms = (q.data?.clients ?? []).flatMap((c) => c.farms);
    if (!farms.length) return null;
    const pad = 0.05;
    return [
      Math.min(...farms.map((f) => f.minLon)) - pad,
      Math.min(...farms.map((f) => f.minLat)) - pad,
      Math.max(...farms.map((f) => f.maxLon)) + pad,
      Math.max(...farms.map((f) => f.maxLat)) + pad,
    ];
  }, [q.data]);

  // Cambia de organización con el mismo endpoint del selector del encabezado
  const open = async (orgId: string, farmId?: string) => {
    setBusy(orgId);
    setError(null);
    try {
      if (orgId !== current) {
        setSession(await post<Session>("/auth/switch", { organizationId: orgId, deviceId: "web" }));
        qc.clear(); // todo lo cacheado era de la otra organización
      }
      if (farmId) navigate({ to: "/estancias/$farmId", params: { farmId } });
      else navigate({ to: "/" });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  if (q.isLoading)
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  if (q.error)
    return (
      <div className="p-6">
        <ErrorBox error={q.error} />
      </div>
    );
  const clients = q.data!.clients;
  const nAlerts = clients.reduce((a, c) => a + c.farms.reduce((b, f) => b + f.activeAlerts, 0), 0);

  return (
    <div className="flex h-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="relative h-72 lg:h-full">
        <FarmMap
          points={points}
          bounds={bounds}
          onPointClick={(id) => {
            const [orgId, farmId] = id.split("|");
            if (orgId && farmId) open(orgId, farmId);
          }}
        />
      </div>
      <section className="flex min-h-0 flex-col gap-5 overflow-auto border-l border-linea p-6 *:shrink-0">
        <header>
          <h1 className="text-[28px] leading-tight">{t("ui.clientsTitle")}</h1>
          <p className="num mt-1 text-sm text-tinta-2">
            {t("ui.clientsSummary", { orgs: clients.length, alerts: nAlerts })}
          </p>
          {q.data!.truncated && <p className="mt-1 text-sm text-tinta-2">{t("ui.clientsTruncated")}</p>}
        </header>
        {error ? <ErrorBox error={error} /> : null}
        {!clients.length && <Empty title={t("ui.clientsNone")} />}
        {clients.map((c) => (
          <section key={c.organization.id} className="border-t border-linea pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl font-semibold">{c.organization.name}</h2>
              <button
                className="cursor-pointer text-sm text-tinta-2 underline-offset-4 hover:text-surco hover:underline disabled:cursor-wait"
                disabled={!!busy}
                onClick={() => open(c.organization.id)}
              >
                {c.organization.id === current ? t("ui.orgCurrent") : t("ui.clientsOpenOrg")}
              </button>
            </div>
            {!c.farms.length && <p className="mt-2 text-sm text-tinta-2">{t("ui.clientsNoFarms")}</p>}
            <ul className="mt-1 divide-y divide-linea">
              {c.farms.map((f) => {
                const alerts = c.alerts.filter((a) => a.farmId === f.id);
                return (
                  <li key={f.id} className="py-2.5">
                    <button
                      className="flex w-full cursor-pointer flex-col text-left disabled:cursor-wait"
                      disabled={!!busy}
                      onClick={() => open(c.organization.id, f.id)}
                    >
                      <span className="font-medium hover:underline">{f.name}</span>
                      <span className="num text-xs text-tinta-2">
                        {fmtHa(f.areaHa)}
                        {f.department ? ` · ${f.department}` : ""} ·{" "}
                        {f.lastRecordAt
                          ? `${t("ui.lastRecord").toLowerCase()} ${fmtDate(f.lastRecordAt)}`
                          : t("ui.neverRecorded").toLowerCase()}
                      </span>
                    </button>
                    {alerts.map((a) => (
                      <p key={a.id} className="mt-1 text-xs font-medium text-peligro">
                        {tk(`ui.alertKind_${a.kind}`)}: {a.summary}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>
    </div>
  );
}
