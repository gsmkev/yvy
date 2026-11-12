import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isFieldRole } from "@yvy/shared";
import { del, get, post } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { t } from "../lib/i18n";
import { useMe, useMembers } from "../lib/queries";
import { Button, ErrorBox, Select, Spinner } from "./ui";

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string;
  createdAt: number;
}

/** T-08: comentarios de un registro. Para mencionar se elige a la persona; "@Nombre" queda en el texto. */
export function RecordComments({ recordId }: { recordId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const canMention = !!me.data && !isFieldRole(me.data.role);
  const members = useMembers(canMention);
  const list = useQuery({
    queryKey: ["comments", recordId],
    queryFn: () => get<Comment[]>(`/org/records/${recordId}/comments`),
  });
  const [text, setText] = useState("");
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map());
  const send = useMutation({
    mutationFn: () =>
      post(`/org/records/${recordId}/comments`, {
        body: text,
        // solo los que siguen escritos como @Nombre
        mentions: [...mentioned].filter(([, name]) => text.includes(`@${name}`)).map(([id]) => id),
      }),
    onSuccess: () => {
      setText("");
      setMentioned(new Map());
      qc.invalidateQueries({ queryKey: ["comments", recordId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", recordId] }),
  });
  const others = (members.data ?? []).filter((m) => m.userId !== me.data?.user.id);
  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="eyebrow mb-2">{t("ui.comments")}</h3>
      {list.isPending && <Spinner />}
      {list.data && !list.data.length && <p className="text-sm text-tinta-2">{t("ui.commentNone")}</p>}
      <ul className="flex flex-col gap-2">
        {list.data?.map((c) => (
          <li key={c.id} className="rounded-md bg-surco/[0.04] p-2 text-sm">
            <div className="flex items-center gap-2 text-xs text-tinta-2">
              <strong className="text-surco">{c.authorName}</strong>
              <span className="num">{fmtDateTime(c.createdAt)}</span>
              {(c.authorId === me.data?.user.id || me.data?.role === "owner" || me.data?.role === "admin") && (
                <button className="ml-auto cursor-pointer underline" onClick={() => remove.mutate(c.id)}>
                  {t("ui.delete")}
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate();
        }}
      >
        <textarea
          aria-label={t("ui.comments")}
          className="min-h-16 w-full rounded-md border border-linea bg-papel px-3 py-2 text-sm"
          placeholder={t("ui.commentPlaceholder")}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center gap-2">
          {canMention && others.length > 0 && (
            <Select
              aria-label={t("ui.commentMention")}
              value=""
              onChange={(e) => {
                const m = others.find((x) => x.userId === e.target.value);
                if (!m) return;
                setMentioned(new Map(mentioned).set(m.userId, m.fullName));
                setText((x) => `${x}${x && !x.endsWith(" ") ? " " : ""}@${m.fullName} `);
              }}
              options={[
                { value: "", label: t("ui.commentMention") },
                ...others.map((m) => ({ value: m.userId, label: m.fullName })),
              ]}
            />
          )}
          <Button type="submit" variant="primary" disabled={send.isPending || !text.trim()}>
            {t("ui.commentSend")}
          </Button>
        </div>
        {send.error && <ErrorBox error={send.error} />}
      </form>
    </section>
  );
}
