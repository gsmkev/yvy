import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { Button, ErrorBox, Field, Input, toast } from "../components/ui";

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
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-1 text-xl font-semibold">{t("ui.apiTokensTitle")}</h1>
      <p className="mb-3 text-sm text-tinta-2">
        {t("ui.apiTokensIntro")}{" "}
        <Link to="/api-docs" className="underline underline-offset-4">
          {t("ui.apiDocsTitle")}
        </Link>
      </p>
      {fresh && (
        <div role="status" className="mb-4 rounded-md border border-soja/50 bg-soja/10 p-3 text-sm">
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
            <Button onClick={() => setFresh(null)}>{t("ui.apiTokenHide")}</Button>
          </div>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-linea text-sm">
        {list.data?.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="flex-1">
              <strong>{k.name}</strong> · <code>{k.prefix}…</code> · {fmtDateTime(k.createdAt)}
              {k.lastUsedAt ? ` · ${t("ui.apiTokenLastUsed", { date: fmtDateTime(k.lastUsedAt) })}` : ` · ${t("ui.apiTokenNeverUsed")}`}
            </span>
            <Button variant="danger" onClick={() => revoke.mutate(k.id)}>
              {t("ui.apiTokenRevoke")}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label={t("ui.apiTokenName")}>
          <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {t("ui.apiTokenCreate")}
        </Button>
      </form>
      {(create.error || revoke.error || list.error) && <ErrorBox error={create.error ?? revoke.error ?? list.error} />}
    </div>
  );
}
