import { useQuery } from "@tanstack/react-query";
import { SectionHead, Stat } from "../../components/ui";
import { get } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { t, tk } from "../../lib/i18n";

interface FunnelData {
  days: number;
  steps: { name: string; orgs: number }[];
  views: { name: string; n: number }[];
  daily: { day: string; n: number }[];
}

/** P-03: embudo de activación (organizaciones nuevas de los últimos 90 días) y pantallas más usadas. */
export function Funnel() {
  const q = useQuery({ queryKey: ["admin-funnel"], queryFn: () => get<FunnelData>("/admin/funnel") });
  if (!q.data) return null;
  const first = q.data.steps[0]?.orgs ?? 0;
  return (
    <section>
      <SectionHead title={t("ui.internal.funnel", { days: q.data.days })} />
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-5">
        {q.data.steps.map((st) => (
          <Stat key={st.name} label={tk(`ui.funnel.${st.name}`)} value={st.orgs} note={first ? `${Math.round((100 * st.orgs) / first)} %` : "—"} size="lg" />
        ))}
      </div>
      {q.data.views.length > 0 && (
        <>
          <div className="mt-6"><SectionHead title={t("ui.internal.views")} /></div>
          <p className="text-xs text-tinta-2">{t("ui.internal.viewsNote")}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {q.data.views.map((v) => (
              <li key={v.name} className="num">
                {v.name.replace("view:", "")} · {fmtNum(v.n)}
              </li>
            ))}
          </ul>
        </>
      )}
      {q.data.daily.length > 0 && (
        <>
          <div className="mt-6"><SectionHead title={t("ui.internal.viewsDaily")} /></div>
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-sm">
            {q.data.daily.map((d) => (
              <li key={d.day} className="num">
                {d.day.slice(5)} · {fmtNum(d.n)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
