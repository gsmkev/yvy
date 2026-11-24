/**
 * Para revisar: registros que las reglas marcaron como raros (dosis, rinde, lluvia, plaga fuera de época).
 * Plantilla de pantalla EN LÍNEA: useOnline + OnlineState + useOnlineMutation + OfficeScreen.
 * API: GET /org/review y POST /org/review/:recordId/ok (apps/api/src/routes/org.ts).
 */
import { View } from "react-native";
import { router } from "expo-router";
import { describeRecord, isFieldRole, t, type MessageKey, type Oddity } from "@yvy/shared";
import { getSession } from "../../src/lib/session";
import { showToast } from "../../src/lib/toast";
import { fmtDateTime, fmtNumber } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { OnlineState } from "../../src/office/state";
import { useOnline } from "../../src/office/useOnline";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { Button, EmptyState, Text } from "../../src/ui/kit";
import { C, RADIUS, T } from "../../src/ui/theme";

interface ReviewItem {
  recordId: string;
  farmName: string;
  plotName: string | null;
  authorName: string | null;
  kind: string;
  capturedAt: number;
  data: Record<string, unknown>;
  oddities: Oddity[];
}

const ODDITY_RANK: Record<string, number> = { dose_out_of_range: 0, yield_impossible: 1, rain_high: 2, pest_off_season: 3 };
/** Primero lo que puede costar plata (dosis, rinde), después lo que suele ser un error de carga. */
const rank = (x: ReviewItem) => Math.min(...x.oddities.map((o) => ODDITY_RANK[o.rule] ?? 9), 9);

const key = (k: string) => k as MessageKey;

/** Por qué se marcó, en una frase (mismas claves que la web). */
function reason(o: Oddity): string {
  switch (o.rule) {
    case "rain_high":
      return t("ui.review.rainHigh", { mm: fmtNumber(o.mm), max: fmtNumber(o.max) });
    case "pest_off_season":
      return t("ui.review.pestOff", { pest: t(key(`fields.pest.${o.pest}`)), month: new Date(2026, o.month - 1, 1).toLocaleDateString("es-PY", { month: "long" }) });
    case "dose_out_of_range": {
      const unit = o.baseUnit === "l" ? "l/ha" : "kg/ha";
      const range = o.min !== null && o.max !== null ? `${fmtNumber(o.min)} a ${fmtNumber(o.max)}` : o.min !== null ? `${t("ui.review.atLeast")} ${fmtNumber(o.min)}` : `${t("ui.review.upTo")} ${fmtNumber(o.max ?? 0)}`;
      return t("ui.review.dose", { product: o.product || "—", dose: fmtNumber(o.dose), unit: t(key(`fields.dose.unit_${o.unit}`)), range: `${range} ${unit}` });
    }
    case "yield_impossible":
      return t("ui.review.yield", { tha: fmtNumber(o.tHa), crop: t(key(`fields.crop.${o.crop}`)), max: fmtNumber(o.max) });
  }
}

/** Revisión de lo cargado por el equipo. */
export default function Review() {
  const allowed = !isFieldRole(getSession()?.organization.role ?? "");
  const query = useOnline<ReviewItem[]>(allowed ? "/org/review" : null);
  const ok = useOnlineMutation<{ recordId: string }, { ok: boolean }>("POST", (b) => `/org/review/${b.recordId}/ok`, { invalidate: ["/org/review"] });

  if (!allowed) return <OfficeScreen title={t("ui.review.title")}><EmptyState title={t("ui.review.notAllowed")} /></OfficeScreen>;
  return (
    <OfficeScreen title={t("ui.review.title")} query={query}>
      <OnlineState query={query} empty={{ title: t("ui.review.emptyTitle"), hint: t("ui.review.empty") }}>
        {(items) =>
          items
            .slice()
            .sort((a, b) => rank(a) - rank(b) || b.capturedAt - a.capturedAt)
            .map((i) => (
              <View key={i.recordId} style={{ marginTop: 16, padding: 16, borderRadius: RADIUS, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.linea, borderLeftWidth: 4, borderLeftColor: C.trigo }}>
                {i.oddities.map((o, n) => (
                  <Text key={n} style={T.bodyMedium}>
                    {reason(o)}
                  </Text>
                ))}
                <Text style={[T.body, { marginTop: 8 }]}>{describeRecord(i.kind, i.data)}</Text>
                <Text style={[T.small, { marginTop: 4 }]}>
                  {[t(key(`record-kinds.kind.${i.kind}`)), i.farmName, i.plotName, i.authorName, fmtDateTime(i.capturedAt)].filter(Boolean).join(" · ")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  <Button
                    title={t("ui.review.ok")}
                    disabled={ok.pending}
                    onPress={async () => {
                      const r = await ok.mutate({ recordId: i.recordId });
                      if (r.ok) showToast(t("ui.toast.reviewed"));
                    }}
                  />
                  <Button kind="secondary" title={t("ui.review.open")} onPress={() => router.push(`/record/${i.recordId}`)} />
                </View>
              </View>
            ))
        }
      </OnlineState>
      {ok.error ? (
        <Text accessibilityRole="alert" style={[T.bodyMedium, { color: C.peligro, marginTop: 16 }]}>
          {ok.error}
        </Text>
      ) : null}
    </OfficeScreen>
  );
}
