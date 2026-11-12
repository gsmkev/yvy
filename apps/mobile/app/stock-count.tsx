/**
 * Recuento de inventario de un depósito (E-15). Se cuenta en el galpón, sin señal: cada producto con su cantidad y se
 * guarda un registro `stock_count` en el outbox. Al sincronizar, el servidor asienta la diferencia como ajuste de stock.
 */
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { t } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { getSession } from "../src/lib/session";
import { buildCountData, canCount } from "../src/lib/stock-count";
import { localChanged } from "../src/lib/sync";
import { showToast } from "../src/lib/toast";
import { useLocal } from "../src/lib/useLocal";
import { Button, Row, s as k, Text, TextInput } from "../src/ui/kit";
import { C, T } from "../src/ui/theme";

export default function StockCount() {
  const session = getSession();
  const warehouses = useLocal(() => getDb().warehouses());
  const products = useLocal(() => getDb().products());
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  if (!session || !canCount(session.organization.role))
    return (
      <View style={[k.screen, k.pad]}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={T.heading}>{t("ui.adminNoAccess")}</Text>
      </View>
    );
  const warehouse = warehouses.find((w) => w.id === warehouseId);
  if (!warehouse)
    return (
      <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 60 }]}>
        <Stack.Screen options={{ title: "" }} />
        <Text style={T.title}>{t("ui.countTitle")}</Text>
        <Text style={[T.small, { marginTop: 6, marginBottom: 16 }]}>{t("ui.countPickWarehouse")}</Text>
        {warehouses.length === 0 && <Text style={T.body}>{t("ui.countNoWarehouse")}</Text>}
        {warehouses.map((w) => (
          <Row key={w.id} title={w.name} subtitle={getDb().farms().find((f) => f.id === w.farmId)?.name} onPress={() => setWarehouseId(w.id)} />
        ))}
      </ScrollView>
    );
  const shown = products.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const save = () => {
    const data = buildCountData(warehouse.id, values);
    if (!data) return Alert.alert(t("ui.countNothing"));
    getDb().saveRecord(session.user.id, session.organization.id, {
      farmId: warehouse.farmId,
      plotId: null,
      poiId: null,
      kind: "stock_count",
      data,
      lon: null,
      lat: null,
      gpsAccuracyM: null,
      capturedAt: Date.now(),
    });
    localChanged();
    showToast(t("ui.countSaved"));
    router.back();
  };
  return (
    <ScrollView style={k.screen} contentContainerStyle={[k.pad, { paddingBottom: 120 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.title}>{warehouse.name}</Text>
      <Text style={[T.small, { marginTop: 6, marginBottom: 12 }]}>{t("ui.countHint")}</Text>
      <TextInput value={filter} onChangeText={setFilter} placeholder={t("ui.countFilter")} style={{ marginBottom: 12 }} />
      {products.length === 0 && <Text style={T.body}>{t("ui.countNoProducts")}</Text>}
      {shown.map((p) => (
        <View key={p.id} style={st.line}>
          <View style={{ flex: 1 }}>
            <Text style={T.bodyMedium}>{p.name}</Text>
            <Text style={T.small}>{p.unit === "kg" ? t("ui.countUnitKg") : t("ui.countUnitL")}</Text>
          </View>
          <TextInput
            value={values[p.id] ?? ""}
            onChangeText={(v) => setValues({ ...values, [p.id]: v })}
            keyboardType="decimal-pad"
            accessibilityLabel={p.name}
            style={st.qty}
          />
        </View>
      ))}
      <Button big title={t("ui.countSave")} onPress={save} style={{ marginTop: 20 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.linea },
  qty: { width: 110, textAlign: "right" },
});
