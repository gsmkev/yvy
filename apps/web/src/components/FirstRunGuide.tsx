import { Link } from "@tanstack/react-router";
import { isFieldRole } from "@yvy/shared";
import type { ReactNode } from "react";
import { t } from "../lib/i18n";
import type { FarmSummary, Member } from "../lib/types";

export interface GuideStep {
  done: boolean;
  title: string;
  hint: string;
  action: ReactNode;
}

/** Estado de los 4 pasos a partir de lo que ya se consulta (estancias y equipo). */
export function guideSteps(farms: FarmSummary[], members: Member[]): GuideStep[] {
  const first = farms[0];
  const cls = "text-sm font-medium text-accion hover:underline";
  return [
    {
      done: farms.length > 0,
      title: t("ui.guideStep1"),
      hint: t("ui.guideStep1Hint"),
      action: (
        <Link to="/estancias/nueva" className={cls}>
          {t("ui.guideDo")}
        </Link>
      ),
    },
    {
      done: farms.some((f) => f.plots > 0),
      title: t("ui.guideStep2"),
      hint: t("ui.guideStep2Hint"),
      action: first && (
        <Link to="/estancias/$farmId" params={{ farmId: first.id }} className={cls}>
          {t("ui.guideDo")}
        </Link>
      ),
    },
    {
      done: members.some((m) => isFieldRole(m.role)),
      title: t("ui.guideStep3"),
      hint: t("ui.guideStep3Hint"),
      action: (
        <Link to="/equipo" className={cls}>
          {t("ui.guideDo")}
        </Link>
      ),
    },
    {
      done: farms.some((f) => f.lastRecordAt !== null),
      title: t("ui.guideStep4"),
      hint: t("ui.guideStep4Hint"),
      action: (
        <a href="/descargar-app" className={cls}>
          {t("ui.downloadApp")}
        </a>
      ),
    },
  ];
}

export function FirstRunGuide({ steps, onDismiss }: { steps: GuideStep[]; onDismiss: () => void }) {
  return (
    <section aria-label={t("ui.guideTitle")}>
      <div className="flex items-end justify-between gap-3 border-b border-linea pb-2">
        <h2 className="font-serif text-xl font-semibold">{t("ui.guideTitle")}</h2>
        <button
          className="cursor-pointer text-sm text-tinta-2 underline-offset-4 hover:text-surco hover:underline"
          onClick={onDismiss}
        >
          {t("ui.guideDismiss")}
        </button>
      </div>
      <ol className="divide-y divide-linea">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-4 py-3.5">
            <span className={`num font-serif text-2xl leading-none ${s.done ? "text-soja" : "text-tinta-2"}`}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${s.done ? "text-tinta-2 line-through" : ""}`}>{s.title}</p>
              {!s.done && <p className="mt-0.5 text-sm text-tinta-2">{s.hint}</p>}
            </div>
            {s.done ? <span className="text-sm text-accion">{t("ui.guideDone")}</span> : s.action}
          </li>
        ))}
      </ol>
    </section>
  );
}
