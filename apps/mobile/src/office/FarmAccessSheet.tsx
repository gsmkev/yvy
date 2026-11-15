/** Estancias a las que entra una persona de oficina (funciones 107/108): solo el dueño. GET /org/farm-access, PUT /org/members/:id/farms. */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { t, type FarmAccessLevel } from "@yvy/shared";
import { getDb } from "../lib/db";
import { showToast } from "../lib/toast";
import { useLocal } from "../lib/useLocal";
import { Button, Row, Sheet, Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { Segmented } from "./ui";
import { useOnline } from "./useOnline";
import { useOnlineMutation } from "./useOnlineMutation";
import type { Member } from "./team";

type Access = { userId: string; farmId: string; level: FarmAccessLevel }[];

/** Los roles que se limitan por estancia: capataz (sin ninguna no ve nada), administrador y agrónomo (sin ninguna ven todas). */
export const isScopedRole = (r: string) => r === "supervisor" || r === "admin" || r === "agronomist";

export function FarmAccessSheet({ m, visible, onClose }: { m: Member; visible: boolean; onClose: () => void }) {
  const farms = useLocal(() => getDb().farms());
  const access = useOnline<Access>(visible ? "/org/farm-access" : null, { cache: false });
  const [chosen, setChosen] = useState<Map<string, FarmAccessLevel> | null>(null);
  const save = useOnlineMutation<{ farms: { farmId: string; level: FarmAccessLevel }[] }, unknown>("PUT", `/org/members/${m.userId}/farms`, { invalidate: ["/org/farm-access"] });
  useEffect(() => {
    if (!visible) return setChosen(null);
    save.reset();
  }, [visible]);
  useEffect(() => {
    if (visible && access.data && !chosen) setChosen(new Map(access.data.filter((a) => a.userId === m.userId).map((a) => [a.farmId, a.level])));
  }, [visible, access.data]);
  const set = (id: string, level: FarmAccessLevel | null) =>
    setChosen((c) => {
      const n = new Map(c ?? []);
      if (level) n.set(id, level);
      else n.delete(id);
      return n;
    });
  const submit = async () => {
    const r = await save.mutate({ farms: [...(chosen ?? [])].map(([farmId, level]) => ({ farmId, level })) });
    if (r.ok) {
      showToast(t("ui.farmAccessSaved"));
      onClose();
    }
  };
  return (
    <Sheet visible={visible} title={`${t("office.teamFarmsTitle")} · ${m.fullName}`} onClose={onClose}>
      {!chosen ? (
        <Text style={T.small}>{access.error ?? t("ui.loading")}</Text>
      ) : (
        <>
          <Text style={T.small}>{m.role === "supervisor" ? t("ui.farmAccessHintSupervisor") : t("ui.farmAccessHintOther")}</Text>
          {farms.map((f) => {
            const level = chosen.get(f.id);
            return (
              <View key={f.id}>
                <Row choice="checkbox" title={f.name} selected={!!level} onPress={() => set(f.id, level ? null : "edit")} right={level ? <Text style={[T.bodyMedium, { color: C.accionOscuro }]}>✓</Text> : undefined} />
                {level ? (
                  <View style={{ marginBottom: 8 }}>
                    <Segmented<FarmAccessLevel> options={[{ value: "edit", label: t("ui.farmAccess_edit") }, { value: "view", label: t("ui.farmAccess_view") }]} value={level} onChange={(v) => set(f.id, v)} />
                  </View>
                ) : null}
              </View>
            );
          })}
          {save.error ? <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 12 }]}>{save.error}</Text> : null}
          <Button title={t("ui.save")} loading={save.pending} onPress={() => void submit()} style={{ marginTop: 16 }} />
        </>
      )}
    </Sheet>
  );
}
