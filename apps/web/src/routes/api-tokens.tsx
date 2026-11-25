/** Tokens de la API pública: se crean y se revocan acá (solo el dueño). */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, post } from "../lib/api";
import { t } from "../lib/i18n";
import { useMe } from "../lib/queries";
import { Button, ErrorBox, Field, Form, Input, Page } from "../components/ui";
import { FreshToken, TokenTable, type Token } from "./api-tokens/TokenParts";

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
  const revoke = useMutation({ mutationFn: (id: string) => del(`/org/api-tokens/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["api-tokens"] }) });
  if (me.data && !owner) return <div className="p-6">{t("ui.api.ownerOnly")}</div>;
  return (
    <Page width="read" back={{ to: "/equipo", label: t("ui.team.title") }} title={t("ui.api.tokensTitle")}>
      <p className="-mt-2 text-sm text-tinta-2">
        {t("ui.api.tokensIntro")}{" "}
        <Link to="/api-docs" className="underline underline-offset-4">
          {t("ui.api.docsTitle")}
        </Link>
      </p>
      {fresh && <FreshToken token={fresh} onHide={() => setFresh(null)} />}
      {list.data && <TokenTable rows={list.data} onRevoke={revoke.mutate} />}
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
