import { Link, useParams } from "@tanstack/react-router";
import { PageHeader, Page } from "../components/ui";
import { t, tk } from "../lib/i18n";
import { Animals, Hail, Infra, Stand, Weeds } from "./labs/fieldTools";
import { Advice, Yield } from "./labs/cropTools";
import { Ask, Summary } from "./labs/aiTools";

type ToolId = "animals" | "stand" | "weeds" | "ask" | "summary" | "rust" | "hail" | "infra" | "yield" | "advice";

const TOOLS: ToolId[] = ["animals", "stand", "weeds", "ask", "summary", "rust", "hail", "infra", "yield", "advice"];

/** Aviso fijo: toda pantalla del Laboratorio dice que es una vista previa con datos de muestra. */
function PreviewNotice() {
  return <p className="border-l-2 border-trigo pl-3 text-sm text-tinta-2">{t("ui.labs.notice")}</p>;
}

export function LabsPage() {
  return (
    <Page width="data">
      <PageHeader title={t("ui.labs.title")} />
      <PreviewNotice />
      <ul className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((id) => (
          <li key={id}>
            <Link
              to="/laboratorio/$tool"
              params={{ tool: id }}
              className="flex h-full flex-col gap-1 rounded-lg border border-linea bg-papel p-4 transition-colors hover:border-tinta-2/40"
            >
              <span className="font-medium">{tk(`ui.labs.tool_${id}_name`)}</span>
              <span className="text-sm text-tinta-2">{tk(`ui.labs.tool_${id}_desc`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}

export function LabsToolPage() {
  const { tool } = useParams({ strict: false }) as { tool: string };
  const id = TOOLS.find((x) => x === tool);
  return (
    <Page width="data" className="gap-4" back={{ to: "/laboratorio", label: t("ui.labs.back") }}>
      {!id ? (
        <p>{t("ui.labs.unknownTool")}</p>
      ) : (
        <>
          <div>
            <PageHeader title={tk(`ui.labs.tool_${id}_name`)} />
            <p className="text-sm text-tinta-2">{tk(`ui.labs.tool_${id}_desc`)}</p>
          </div>
          <PreviewNotice />
          <ToolBody id={id} />
        </>
      )}
    </Page>
  );
}

function ToolBody({ id }: { id: ToolId }) {
  switch (id) {
    case "animals":
      return <Animals />;
    case "stand":
      return <Stand />;
    case "weeds":
      return <Weeds />;
    case "ask":
      return <Ask />;
    case "summary":
      return <Summary />;
    case "hail":
      return <Hail />;
    case "infra":
      return <Infra />;
    case "yield":
      return <Yield />;
    case "advice":
      return <Advice />;
    case "rust":
      return <p className="border-b border-linea pb-4">{t("ui.labs.rustBody")}</p>;
  }
}
