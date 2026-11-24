import { useState } from "react";
import { Pressable, View } from "react-native";
import { t, tk } from "@yvy/shared";
import { getDb } from "../lib/db";
import { flushAlertVotes, localChanged } from "../lib/sync";
import { recordVote } from "../lib/votes";
import { Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { st } from "./styles";

type AlertRow = ReturnType<ReturnType<typeof getDb>["activeAlerts"]>[number];

/** Aviso compacto: tipo + probabilidad y el resumen en 2 líneas; la fuente y "¿Te sirvió?" aparecen al tocar. */
export function AlertCard({ a, voted, picked, onLayout }: { a: AlertRow; voted: boolean | undefined; picked: boolean; onLayout: (y: number) => void }) {
  const [open, setOpen] = useState(picked);
  const strong = a.severity === "warning";
  const fg = strong ? C.blanco : C.tinta;
  const soft = strong ? "rgba(255,255,255,0.85)" : C.tinta2;
  const title = `${tk(`ui.alertKind_${a.kind}`)}${a.probability ? ` · ${tk(`ui.probability_${a.probability}`).toLowerCase()}` : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}. ${a.summary}`}
      onPress={() => setOpen((v) => !v)}
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      style={[st.alert, strong ? st.alertStrong : st.alertSoft, picked && st.alertPicked]}
    >
      <Text style={[T.bodyMedium, { color: strong ? C.blanco : C.atencion, fontWeight: "700" }]} numberOfLines={1}>{title}</Text>
      <Text style={[T.small, { color: fg, marginTop: 2 }]} numberOfLines={open ? undefined : 2}>{a.summary}</Text>
      {open && (
        <>
          <Text style={[T.small, { color: soft, marginTop: 6 }]}>{t("ui.orientative", { source: a.source })}</Text>
          <View style={st.vote}>
            {voted === undefined ? (
              <>
                <Text style={[T.small, { color: soft }]}>{t("ui.useful")}</Text>
                {([true, false] as const).map((useful) => (
                  <Pressable
                    key={String(useful)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t("ui.useful")} ${useful ? t("app.yes") : t("app.no")}`}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    onPress={() => {
                      recordVote(getDb(), a.id, useful);
                      localChanged();
                      flushAlertVotes();
                    }}
                    style={st.voteBtn}
                  >
                    <Text style={[T.smallMedium, { color: fg, textDecorationLine: "underline" }]}>{useful ? t("app.yes") : t("app.no")}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <Text style={[T.small, { color: soft }]}>{t("app.thanks")}</Text>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}
