import { Link } from "@tanstack/react-router";
import { LIMITS } from "@yvy/shared";
import { t, type MessageKey } from "../../lib/i18n";
import { PublicShell } from "./PublicShell";

const ENDPOINTS: { path: string; params: string; text: MessageKey }[] = [
  { path: "/v1/farms", params: "", text: "ui.apiDocsFarms" },
  { path: "/v1/plots", params: "farmId", text: "ui.apiDocsPlots" },
  { path: "/v1/records", params: "farmId, plotId, kind, from, to (ms), limit, cursor", text: "ui.apiDocsRecords" },
  { path: "/v1/alerts", params: "farmId, active=1", text: "ui.apiDocsAlerts" },
];

const Code = ({ children }: { children: string }) => (
  <pre className="mt-2 overflow-x-auto rounded-md border border-linea bg-surco/[0.04] p-3 text-xs">
    <code>{children}</code>
  </pre>
);

/** I-01: documentación pública de la API de solo lectura. */
export function ApiDocsPage() {
  return (
    <PublicShell>
      <article className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <Link to="/" className="text-sm text-accion underline-offset-4 hover:underline">
          {t("ui.legalBack")}
        </Link>
        <h1 className="mt-6 text-[32px] leading-tight">{t("ui.apiDocsTitle")}</h1>
        <p className="mt-3 text-tinta-2">{t("ui.apiDocsIntro")}</p>

        <h2 className="mt-8 font-serif text-xl font-semibold">{t("ui.apiDocsAuthTitle")}</h2>
        <p className="mt-2">{t("ui.apiDocsAuth")}</p>
        <Code>{`curl https://TU-DOMINIO/v1/farms \\\n  -H "Authorization: Bearer yvy_..."`}</Code>

        <h2 className="mt-8 font-serif text-xl font-semibold">{t("ui.apiDocsEndpoints")}</h2>
        <ul className="mt-2 flex flex-col gap-4">
          {ENDPOINTS.map((e) => (
            <li key={e.path}>
              <code className="font-semibold">GET {e.path}</code>
              {e.params && <span className="text-sm text-tinta-2"> · {t("ui.apiDocsParams")}: {e.params}</span>}
              <p className="mt-1 text-sm">{t(e.text)}</p>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 font-serif text-xl font-semibold">{t("ui.apiDocsPagingTitle")}</h2>
        <p className="mt-2">{t("ui.apiDocsPaging", { max: LIMITS.api.maxPageSize })}</p>
        <Code>{`{ "data": [ ... ], "nextCursor": "1767225600000.0193..." }`}</Code>

        <h2 className="mt-8 font-serif text-xl font-semibold">{t("ui.apiDocsLimitsTitle")}</h2>
        <p className="mt-2">{t("ui.apiDocsLimits", { n: LIMITS.api.perMinute })}</p>
        <ul className="mt-2 list-disc pl-5 text-sm">
          <li>401: {t("ui.apiDocsE401")}</li>
          <li>405: {t("ui.apiDocsE405")}</li>
          <li>429: {t("ui.apiDocsE429")}</li>
        </ul>
        <p className="mt-6 text-sm text-tinta-2">{t("ui.apiDocsTokens")}</p>
      </article>
    </PublicShell>
  );
}
