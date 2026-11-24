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

/** I-01: tokens de la API pública (solo el dueño). El token completo se muestra una sola vez. */
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
  if (me.data && !owner) return <div className="p-6">{t("ui.apiOwnerOnly")}</div>;
  return (
    <Page width="read" back={{ to: "/equipo", label: t("ui.teamTitle") }} title={t("ui.apiTokensTitle")}>
      <p className="-mt-2 text-sm text-tinta-2">
        {t("ui.apiTokensIntro")}{" "}
        <Link to="/api-docs" className="underline underline-offset-4">
          {t("ui.apiDocsTitle")}
        </Link>
      </p>
      {fresh && (
        <div role="status" className="border-l-2 border-soja pl-3 text-sm">
          <p className="font-medium">{t("ui.apiTokenCreated")}</p>
          <code className="mt-1 block break-all">{fresh}</code>
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(fresh);
                toast(t("ui.apiTokenCopied"));
              }}
            >
              {t("ui.apiTokenCopy")}
            </Button>
            <Button variant="quiet" onClick={() => setFresh(null)}>{t("ui.apiTokenHide")}</Button>
          </div>
        </div>
      )}
      {list.data && (
        <DataTable
          caption={t("ui.apiTokensTitle")}
          rows={list.data}
          rowKey={(k) => k.id}
          empty={<EmptyState compact title={t("ui.apiTokensEmpty")} />}
          columns={[
            { id: "name", header: t("ui.apiTokenName"), cell: (k) => k.name },
            { id: "prefix", header: t("ui.apiTokenPrefix"), hideBelow: "sm", cell: (k) => <code className="font-normal">{k.prefix}…</code> },
            { id: "created", header: t("ui.apiTokenCreatedCol"), hideBelow: "md", cell: (k) => <span className="text-tinta-2">{fmtDateTime(k.createdAt)}</span> },
            {
              id: "used",
              header: t("ui.apiTokenUsedCol"),
              cell: (k) => <span className="text-tinta-2">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : t("ui.apiTokenNeverUsed")}</span>,
            },
            {
              id: "revoke",
              header: <span className="sr-only">{t("ui.rowActionsHeader")}</span>,
              cell: (k) => (
                <div className="flex justify-end">
                  <Button size="sm" variant="danger" onClick={() => revoke.mutate(k.id)}>
                    {t("ui.apiTokenRevoke")}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
      <Form className="flex items-end gap-2" onSubmit={() => create.mutate()}>
        <Field label={t("ui.apiTokenName")}>
          <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {t("ui.apiTokenCreate")}
        </Button>
      </Form>
      {(create.error || revoke.error || list.error) && <ErrorBox error={create.error ?? revoke.error ?? list.error} />}
    </Page>
  );
}
