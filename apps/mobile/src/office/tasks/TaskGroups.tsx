/** Lista de tareas agrupada por persona, con el menú de tres puntos en cada fila. */
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { MoreVertical } from "lucide-react-native";
import { isOverdue, t } from "@yvy/shared";
import type { Task } from "../../db/store/core";
import { Row, SectionHeader } from "../../ui/kit";
import { C } from "../../ui/theme";
import { taskSubtitle, type Clock } from "./model";

interface Props {
  groups: Map<string, Task[]>;
  clock: Clock;
  nameOf: (id: string) => string;
  farmName: Map<string, string>;
  plotName: Map<string, string>;
  onMenu: (x: Task) => void;
}

function TaskRow({ x, clock, farmName, plotName, onMenu }: Omit<Props, "groups" | "nameOf"> & { x: Task }) {
  const over = isOverdue(x, clock.today, clock.nowTime);
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row
          title={x.title}
          subtitle={taskSubtitle(x, clock, { farm: farmName.get(x.farmId), plot: x.plotId ? plotName.get(x.plotId) : null })}
          tone={over ? "danger" : undefined}
          chevron={false}
          onPress={() => router.push({ pathname: "/task/[id]", params: { id: x.id } })}
        />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("office.task.more")} onPress={() => onMenu(x)} style={{ width: 48, height: 56, alignItems: "center", justifyContent: "center", marginTop: 8 }}>
        <MoreVertical size={22} color={C.tinta2} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

/** Una sección por persona con sus tareas. */
export function TaskGroups({ groups, nameOf, clock, farmName, plotName, onMenu }: Props) {
  return [...groups.entries()].map(([id, list], i) => (
    <View key={id}>
      <SectionHeader title={`${nameOf(id)}, ${list.length}`} first={i === 0} />
      {list.map((x) => (
        <TaskRow key={x.id} x={x} clock={clock} farmName={farmName} plotName={plotName} onMenu={onMenu} />
      ))}
    </View>
  ));
}
