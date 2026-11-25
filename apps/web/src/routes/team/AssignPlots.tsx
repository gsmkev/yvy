/** Diálogo para asignar lotes a un miembro del equipo. */
import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Button, CancelButton, ErrorBox, Modal, Spinner, toast } from "../../components/ui";
import { get, put } from "../../lib/api";
import { fmtHa } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import type { FarmDetail, Member } from "../../lib/types";

/**
 * Elige los lotes de un miembro.
 * @param member miembro a editar.
 */
export function AssignPlots({ member, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient();
  const farms = useFarms();
  const details = useQueries({
    queries: (farms.data ?? []).map((f) => ({
      queryKey: ["farm", f.id],
      queryFn: () => get<FarmDetail>(`/org/farms/${f.id}`),
    })),
  });
  const loaded = details.every((d) => d.data);
  const initial = new Set(
    details.flatMap((d) => d.data?.assignments.filter((a) => a.userId === member.userId).map((a) => a.plotId) ?? []),
  );
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const current = chosen ?? initial;
  const save = useMutation({
    mutationFn: () => put(`/org/members/${member.userId}/plots`, { plotIds: [...current] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farm"] });
      qc.invalidateQueries({ queryKey: ["farms"] });
      toast(t("ui.toast.plotsAssigned"));
      onClose();
    },
  });
  const toggle = (id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };
  return (
    <Modal
      title={`${t("ui.common.assignPlots")} · ${member.fullName}`}
      onClose={onClose}
      footer={
        <>
          <CancelButton />
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {t("ui.common.save")}
          </Button>
        </>
      }
    >
      {!loaded ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-3">
          {details.map(({ data }) => (
            <div key={data!.farm.id}>
              <h3 className="mb-1 text-sm font-semibold">{data!.farm.name}</h3>
              <ul className="grid grid-cols-2 gap-1">
                {data!.plots.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-linea bg-papel p-2 text-sm hover:border-tinta-2/40">
                      <input type="checkbox" checked={current.has(p.id)} onChange={() => toggle(p.id)} />
                      <span className="flex-1">{p.name}</span>
                      <span className="num text-xs text-tinta-2">{fmtHa(p.areaHa)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {save.error && <ErrorBox error={save.error} />}
        </div>
      )}
    </Modal>
  );
}
