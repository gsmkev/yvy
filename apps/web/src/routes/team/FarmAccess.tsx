import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FarmAccessLevel } from "@yvy/shared";
import { Button, CancelButton, ErrorBox, Modal, Select, Spinner, toast } from "../../components/ui";
import { get, put } from "../../lib/api";
import { t, tk } from "../../lib/i18n";
import { useFarms } from "../../lib/queries";
import type { Member } from "../../lib/types";

/** Estancias de un supervisor, administrador o agrónomo (solo el dueño). Sin ninguna marcada: supervisor no ve nada; el resto ve todas. */
export function FarmAccess({ member, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient();
  const farms = useFarms();
  const access = useQuery({
    queryKey: ["farm-access"],
    queryFn: () => get<{ userId: string; farmId: string; level: FarmAccessLevel }[]>("/org/farm-access"),
  });
  const [chosen, setChosen] = useState<Map<string, FarmAccessLevel> | null>(null);
  const initial = new Map((access.data ?? []).filter((a) => a.userId === member.userId).map((a) => [a.farmId, a.level]));
  const current = chosen ?? initial;
  const save = useMutation({
    mutationFn: () =>
      put(`/org/members/${member.userId}/farms`, { farms: [...current].map(([farmId, level]) => ({ farmId, level })) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farm-access"] });
      toast(t("ui.farm.accessSaved"));
      onClose();
    },
  });
  const set = (id: string, level: FarmAccessLevel | null) => {
    const next = new Map(current);
    if (level) next.set(id, level);
    else next.delete(id);
    setChosen(next);
  };
  return (
    <Modal
      title={`${t("ui.farm.access")}: ${member.fullName}`}
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
      {!farms.data || !access.data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tinta-2">
            {member.role === "supervisor" ? t("ui.farm.accessHintSupervisor") : t("ui.farm.accessHintOther")}
          </p>
          <ul className="flex flex-col gap-1">
            {farms.data.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-md border border-linea bg-papel p-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={f.name}
                  checked={current.has(f.id)}
                  onChange={(e) => set(f.id, e.target.checked ? "edit" : null)}
                />
                <span className="flex-1">{f.name}</span>
                {current.has(f.id) && (
                  <Select
                    value={current.get(f.id)!}
                    onChange={(e) => set(f.id, e.target.value as FarmAccessLevel)}
                    options={(["edit", "view"] as const).map((l) => ({ value: l, label: tk(`ui.farm.access_${l}`) }))}
                  />
                )}
              </li>
            ))}
          </ul>
          {save.error && <ErrorBox error={save.error} />}
        </div>
      )}
    </Modal>
  );
}
