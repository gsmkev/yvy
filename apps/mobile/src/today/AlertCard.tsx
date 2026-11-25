/** Tarjeta de un aviso de la pantalla Hoy. */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { t, tk } from "@yvy/shared";
import { getDb } from "../lib/db";
import { flushAlertVotes, localChanged } from "../lib/sync";
import { recordVote } from "../lib/votes";
import { Text } from "../ui/kit";
import { C, T } from "../ui/theme";
import { st } from "./styles";

/** Quita del resumen el "Tipo:" inicial cuando repite el título del aviso ("Exceso de lluvia: 89 mm" bajo "Exceso de lluvia"). */
function withoutKindPrefix(summary: string, kind: string): string {
  const i = summary.indexOf(": ");
  const first = (x: string) => x.trim().split(/\s+/)[0]?.toLowerCase();
  if (i < 0 || i > 40 || first(summary) !== first(kind)) return summary;
  const rest = summary.slice(i + 2);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

type AlertRow = ReturnType<ReturnType<typeof getDb>["activeAlerts"]>[number];

/** Aviso compacto: tipo + probabilidad y el resumen en 2 líneas; la fuente y "¿Te sirvió?" aparecen al tocar. */
export function AlertCard({ a, voted, picked, onLayout }: { a: AlertRow; voted: boolean | undefined; picked: boolean; onLayout: (y: number) => void }) {
  const [open, setOpen] = useState(picked);
  const strong = a.severity === "warning";
  const fg = strong ? C.blanco : C.tinta;
  const soft = strong ? "rgba(255,255,255,0.85)" : C.tinta2;
  const body = withoutKindPrefix(a.summary, tk(`ui.alert.kind_${a.kind}`));
  const title = `${tk(`ui.alert.kind_${a.kind}`)}${a.probability ? ` · ${tk(`ui.probability.${a.probability}`).toLowerCase()}` : ""}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}. ${body}`}
      onPress={() => setOpen((v) => !v)}
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      style={[st.alert, strong ? st.alertStrong : st.alertSoft, picked && st.alertPicked]}
    >
      <Text style={[T.bodyMedium, { color: strong ? C.blanco : C.atencion, fontWeight: "700" }]} numberOfLines={1}>{title}</Text>
      <Text style={[T.small, { color: fg, marginTop: 2 }]} numberOfLines={open ? undefined : 2}>{body}</Text>
      {open && (
        <>
          <Text style={[T.small, { color: soft, marginTop: 6 }]}>{t("ui.common.orientative", { source: a.source })}</Text>
          <View style={st.vote}>
            {voted === undefined ? (
              <>
                <Text style={[T.small, { color: soft }]}>{t("ui.common.useful")}</Text>
                {([true, false] as const).map((useful) => (
                  <Pressable
                    key={String(useful)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t("ui.common.useful")} ${useful ? t("app.common.yes") : t("app.common.no")}`}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    onPress={() => {
                      recordVote(getDb(), a.id, useful);
                      localChanged();
                      flushAlertVotes();
                    }}
                    style={st.voteBtn}
                  >
                    <Text style={[T.smallMedium, { color: fg, textDecorationLine: "underline" }]}>{useful ? t("app.common.yes") : t("app.common.no")}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <Text style={[T.small, { color: soft }]}>{t("app.common.thanks")}</Text>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}
