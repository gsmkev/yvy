/** URLs que reciben un POST firmado con cada aviso o registro nuevo. Solo dueño y administrador. */
import { t } from "../lib/i18n";
import { EmptyState, SectionHead } from "./ui";
import { useWebhooks } from "./webhooks/useWebhooks";
import { HooksTable, NewHookForm, SecretNotice } from "./webhooks/WebhookParts";

/** Webhooks de la organización: lista, estado del último envío y alta. */
export function WebhooksPanel() {
  const w = useWebhooks();
  const rows = w.list.data ?? [];
  return (
    <section id="webhooks" className="scroll-mt-4">
      <SectionHead title={t("ui.webhooks.title")} />
      <p className="mt-3 text-tinta-2">{t("ui.webhooks.intro")}</p>
      {w.secret && <SecretNotice secret={w.secret} onDone={() => w.setSecret(null)} />}
      {rows.length > 0 && <HooksTable w={w} rows={rows} />}
      {w.list.isSuccess && rows.length === 0 && <EmptyState compact title={t("ui.webhooks.empty")} />}
      <NewHookForm w={w} />
    </section>
  );
}
