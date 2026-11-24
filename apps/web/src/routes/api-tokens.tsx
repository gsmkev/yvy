/** Tokens de la API pública (solo el dueño). El token completo se muestra una sola vez. */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { Button, DataTable, EmptyState, ErrorBox, Field, Form, Input, Page, toast } from "../components/ui";

interface Token {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/** Tokens de la API pública (solo el dueño). El token completo se muestra una sola vez. */
export function ApiTokensPage() {
  const me = useMe();
  const qc = useQueryClient();
  const owner = me.data?.role === "owner";
  const list = useQuery({ enabled: owner, queryKey: ["api-tokens"], queryFn: () => get<Token[]>("/org/api-tokens") });
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => post<{ token: string }>("/org/api-tokens", { name }),
    onSuccess: (r) => {
      setFresh(r.token);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/org/api-tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-tokens"] }),
  });
  if (me.data && !owner) return <div className="p-6">{t("ui.api.ownerOnly")}</div>;
  return (
    <Page width="read" back={{ to: "/equipo", label: t("ui.team.title") }} title={t("ui.api.tokensTitle")}>
      <p className="-mt-2 text-sm text-tinta-2">
        {t("ui.api.tokensIntro")}{" "}
        <Link to="/api-docs" className="underline underline-offset-4">
          {t("ui.api.docsTitle")}
        </Link>
      </p>
      {fresh && (
        <div role="status" className="border-l-2 border-soja pl-3 text-sm">
          <p className="font-medium">{t("ui.api.tokenCreated")}</p>
          <code className="mt-1 block break-all">{fresh}</code>
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(fresh);
                toast(t("ui.api.tokenCopied"));
              }}
            >
              {t("ui.api.tokenCopy")}
            </Button>
            <Button variant="quiet" onClick={() => setFresh(null)}>{t("ui.api.tokenHide")}</Button>
          </div>
        </div>
      )}
      {list.data && (
        <DataTable
          caption={t("ui.api.tokensTitle")}
          rows={list.data}
          rowKey={(k) => k.id}
          empty={<EmptyState compact title={t("ui.api.tokensEmpty")} />}
          columns={[
            { id: "name", header: t("ui.api.tokenName"), cell: (k) => k.name },
            { id: "prefix", header: t("ui.api.tokenPrefix"), hideBelow: "sm", cell: (k) => <code className="font-normal">{k.prefix}…</code> },
            { id: "created", header: t("ui.api.tokenCreatedCol"), hideBelow: "md", cell: (k) => <span className="text-tinta-2">{fmtDateTime(k.createdAt)}</span> },
            {
              id: "used",
              header: t("ui.api.tokenUsedCol"),
              cell: (k) => <span className="text-tinta-2">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : t("ui.api.tokenNeverUsed")}</span>,
            },
            {
              id: "revoke",
              header: <span className="sr-only">{t("ui.row.actionsHeader")}</span>,
              cell: (k) => (
                <div className="flex justify-end">
                  <Button size="sm" variant="danger" onClick={() => revoke.mutate(k.id)}>
                    {t("ui.api.tokenRevoke")}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
      <Form className="flex items-end gap-2" onSubmit={() => create.mutate()}>
        <Field label={t("ui.api.tokenName")}>
          <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {t("ui.api.tokenCreate")}
        </Button>
      </Form>
      {(create.error || revoke.error || list.error) && <ErrorBox error={create.error ?? revoke.error ?? list.error} />}
    </Page>
  );
}
