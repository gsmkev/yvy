/**
 * Calendario: la semana en vertical, un bloque por día (solo los días con tareas y hoy), desde la base
 * local. Lógica de fechas en src/office/calendar.ts (copia de la web).
 */
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { addDays, localDate, t, type MessageKey, tasksByDay, weekDays, weekStart } from "@yvy/shared";
import { getDb } from "../../src/lib/db";
import { memberNames } from "../../src/lib/members";
import { tap } from "../../src/lib/haptics";
import { useLocal } from "../../src/lib/useLocal";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { Button, EmptyState, Row, Text } from "../../src/ui/kit";
import { C, F, RADIUS, T } from "../../src/ui/theme";

const day = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

function Nav({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => (tap(), onPress())} style={({ pressed }) => ({ width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: RADIUS, borderWidth: 1.5, borderColor: C.lineaFuerte, backgroundColor: C.blanco, opacity: pressed ? 0.7 : 1 })}>
      {children}
    </Pressable>
  );
}

/** Calendario de tareas. */
export default function Calendar() {
  const today = localDate(Date.now());
  const [monday, setMonday] = useState(weekStart(today));
  const data = useLocal(() => {
    const db = getDb();
    return { tasks: db.allTasks(), plots: db.plots(), names: memberNames(db) };
  });
  const days = useMemo(() => weekDays(monday), [monday]);
  const grouped = tasksByDay(data.tasks, days);
  const plotName = new Map(data.plots.map((p) => [p.id, p.name]));
  const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);
  const thisWeek = monday === weekStart(today);
  const shownDays = days.filter((d) => (grouped.get(d)?.length ?? 0) > 0 || d === today);

  return (
    <OfficeScreen title={t("ui.calendar.title")} subtitle={t("office.calendar.weekOf", { from: day(days[0]!), to: day(days[6]!) })}>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 16, alignItems: "center" }}>
        <Nav label={t("ui.calendar.prev")} onPress={() => setMonday(addDays(monday, -7))}>
          <ChevronLeft size={24} color={C.tinta} strokeWidth={2} />
        </Nav>
        <Nav label={t("ui.calendar.next")} onPress={() => setMonday(addDays(monday, 7))}>
          <ChevronRight size={24} color={C.tinta} strokeWidth={2} />
        </Nav>
        {!thisWeek ? <Button kind="secondary" title={t("ui.calendar.today")} onPress={() => setMonday(weekStart(today))} style={{ flex: 1 }} /> : null}
      </View>
      {total === 0 ? <EmptyState title={t("ui.calendar.empty")} /> : null}
      {total > 0 || thisWeek
        ? shownDays.map((d) => {
            const list = grouped.get(d) ?? [];
            const isToday = d === today;
            const i = days.indexOf(d);
            return (
              <View key={d} style={{ marginTop: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingBottom: 6, borderBottomWidth: isToday ? 2 : 1, borderBottomColor: isToday ? C.accion : C.linea }}>
                  <Text style={[T.heading, isToday && { color: C.accionOscuro }]}>{t(`ui.weekday.${i}` as MessageKey)} {d.slice(8)}</Text>
                  {isToday ? <Text style={[T.smallMedium, { color: C.accionOscuro }]}>{t("office.tasks.filterToday")}</Text> : null}
                </View>
                {list.length === 0 ? (
                  <Text style={[T.small, { marginTop: 8 }]}>{t("office.calendar.nothingToday")}</Text>
                ) : (
                  list.map((x) => {
                    const done = x.status === "done";
                    const who = data.names[x.assigneeId];
                    return (
                      <View key={x.id} style={done ? { opacity: 0.55 } : undefined}>
                      <Row
                        title={`${x.dueTime ? `${x.dueTime}  ` : ""}${x.title}`}
                        subtitle={[x.plotId ? plotName.get(x.plotId) : null, who].filter(Boolean).join(" · ") || (x.dueTime ? undefined : t("office.calendar.allDay"))}
                        right={done ? <Text style={{ fontFamily: F.sansMedium, fontSize: 15, color: C.tinta3 }}>{t("ui.status.done")}</Text> : undefined}
                        onPress={() => router.push({ pathname: "/task/[id]", params: { id: x.id } })}
                      />
                      </View>
                    );
                  })
                )}
              </View>
            );
          })
        : null}
    </OfficeScreen>
  );
}
