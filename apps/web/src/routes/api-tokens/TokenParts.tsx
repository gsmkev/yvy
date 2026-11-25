/** Piezas de la pantalla de tokens de la API: aviso del token nuevo y tabla de tokens. */
import { Button, DataTable, EmptyState, toast, type Column } from "../../components/ui";
import { fmtDateTime } from "../../lib/format";
import { t } from "../../lib/i18n";

/** Token de la API pública: se ve solo el prefijo. */
export interface Token {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/** El token completo se muestra una sola vez al crearlo. */
export function FreshToken({ token, onHide }: { token: string; onHide: () => void }) {
  return (
    <div role="status" className="border-l-2 border-soja pl-3 text-sm">
      <p className="font-medium">{t("ui.api.tokenCreated")}</p>
      <code className="mt-1 block break-all">{token}</code>
      <div className="mt-2 flex gap-2">
        <Button
          onClick={() => {
            void navigator.clipboard?.writeText(token);
            toast(t("ui.api.tokenCopied"));
          }}
        >
          {t("ui.api.tokenCopy")}
        </Button>
        <Button variant="quiet" onClick={onHide}>
          {t("ui.api.tokenHide")}
        </Button>
      </div>
    </div>
  );
}

function tokenColumns(onRevoke: (id: string) => void): Column<Token>[] {
  return [
    { id: "name", header: t("ui.api.tokenName"), cell: (k) => k.name },
    { id: "prefix", header: t("ui.api.tokenPrefix"), hideBelow: "sm", cell: (k) => <code className="font-normal">{k.prefix}…</code> },
    { id: "created", header: t("ui.api.tokenCreatedCol"), hideBelow: "md", cell: (k) => <span className="text-tinta-2">{fmtDateTime(k.createdAt)}</span> },
    { id: "used", header: t("ui.api.tokenUsedCol"), cell: (k) => <span className="text-tinta-2">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : t("ui.api.tokenNeverUsed")}</span> },
    {
      id: "revoke",
      header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
      cell: (k) => (
        <div className="flex justify-end">
          <Button size="sm" variant="danger" onClick={() => onRevoke(k.id)}>
            {t("ui.api.tokenRevoke")}
          </Button>
        </div>
      ),
    },
  ];
}

/** Tokens creados, cada uno con su botón para revocarlo. */
export function TokenTable({ rows, onRevoke }: { rows: Token[]; onRevoke: (id: string) => void }) {
  return <DataTable caption={t("ui.api.tokensTitle")} rows={rows} rowKey={(k) => k.id} empty={<EmptyState compact title={t("ui.api.tokensEmpty")} />} columns={tokenColumns(onRevoke)} />;
}
