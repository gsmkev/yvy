import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Check } from "lucide-react-native";
import { describeRecord, DOSE_UNITS_FOR, t, type DoseUnit, type ProductDose } from "@yvy/shared";
import { getDb } from "../lib/db";
import { Button, Row, s as k, Text, TextInput } from "../ui/kit";
import { C, T } from "../ui/theme";
import { tr } from "./common";
import { st } from "./styles";

/** Productos de la mezcla: elegir del catálogo (o escribir uno) y una dosis por pantalla. */
export function ProductsStep({ question, value, fixedUnit, types, onAnswer }: { question: string; value: unknown; fixedUnit?: "kg_ha"; types?: string[]; onAnswer: (v: unknown) => void }) {
  // Con un tipo pedido (fertilizantes) se ofrece ese tipo; si el catálogo no tiene ninguno, todos.
  const catalog = useMemo(() => {
    const all = getDb().products();
    const typed = types ? all.filter((p) => types.includes(p.type)) : all;
    return typed.length ? typed : all;
  }, []);
  const initial = Array.isArray(value) ? (value as ProductDose[]) : [];
  const [doses, setDoses] = useState<ProductDose[]>(initial);
  const [view, setView] = useState<"review" | "pick" | "other" | number>(initial.length ? "review" : "pick");
  const [other, setOther] = useState("");
  const [text, setText] = useState("");

  const toggle = (p: { id: string; name: string; unit: "l" | "kg" }) =>
    setDoses((ds) =>
      ds.some((d) => d.productId === p.id)
        ? ds.filter((d) => d.productId !== p.id)
        : [...ds, { productId: p.id, name: p.name, dose: 0, unit: fixedUnit ?? DOSE_UNITS_FOR[p.unit][0] }],
    );
  const baseOf = (d: ProductDose): "l" | "kg" => (d.unit === "kg_ha" || d.unit === "g_ha" ? "kg" : "l");
  const go = (i: number) => {
    setText(doses[i]?.dose ? String(doses[i]!.dose).replace(".", ",") : "");
    setView(i);
  };

  if (view === "review") {
    return (
      <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]}>
        <Text style={T.title}>{t("app.productsReview")}</Text>
        <Text style={[T.small, { marginTop: 6, marginBottom: 16 }]}>{t("app.productsReviewHint")}</Text>
        {doses.map((d) => (
          <Row key={`${d.productId ?? d.name}`} title={d.name} subtitle={describeRecord("application", { products: [d] }).replace(`${d.name} `, "")} />
        ))}
        <View style={{ flex: 1 }} />
        <Button big title={t("app.next")} onPress={() => onAnswer(doses)} />
        <Button kind="text" title={t("app.productsChange")} onPress={() => setView("pick")} style={{ marginTop: 8 }} />
      </ScrollView>
    );
  }
  if (view === "other") {
    const name = other.trim();
    return (
      <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
        <Text style={T.title}>{t("app.productOtherQuestion")}</Text>
        <TextInput value={other} onChangeText={setOther} autoFocus style={st.search} accessibilityLabel={t("app.productOtherQuestion")} />
        <View style={{ flex: 1 }} />
        <Button
          big
          title={t("app.next")}
          disabled={!name}
          onPress={() => {
            setDoses((ds) => [...ds, { name, dose: 0, unit: fixedUnit ?? "l_ha" }]);
            setOther("");
            setView("pick");
          }}
        />
      </ScrollView>
    );
  }
  if (typeof view === "number") {
    const d = doses[view]!;
    const n = Number(text.replace(",", "."));
    const ok = text !== "" && Number.isFinite(n) && n > 0 && n <= 100_000;
    const [big, small] = DOSE_UNITS_FOR[baseOf(d)];
    const unit: DoseUnit = d.unit;
    const alt = unit === big ? small : big;
    const next = () => {
      const list = doses.map((x, j) => (j === view ? { ...x, dose: n, usedQty: undefined } : x));
      setDoses(list);
      if (view < list.length - 1) {
        setText(list[view + 1]!.dose ? String(list[view + 1]!.dose).replace(".", ",") : "");
        setView(view + 1);
      } else onAnswer(list);
    };
    return (
      <ScrollView contentContainerStyle={[k.pad, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
        <Text style={T.title}>{t("app.productDoseQuestion", { name: d.name })}</Text>
        <View style={st.numberRow}>
          <TextInput
            value={text}
            onChangeText={(v) => setText(v.replace(/[^0-9.,]/g, "").slice(0, 7))}
            keyboardType="decimal-pad"
            autoFocus
            style={st.numberInput}
            placeholder="0"
            placeholderTextColor={C.tinta3}
            accessibilityLabel={t("app.productDoseQuestion", { name: d.name })}
            onSubmitEditing={() => ok && next()}
          />
          <Text style={st.unit}>{tr(`fields.doseUnit_${unit}`)}</Text>
        </View>
        {!fixedUnit && <Button
          kind="text"
          title={t("app.productDoseChange", { unit: tr(`fields.doseUnit_${alt}`) })}
          onPress={() => setDoses((ds) => ds.map((x, j) => (j === view ? { ...x, unit: alt } : x)))}
          style={{ marginTop: 8 }}
        />}
        <View style={{ flex: 1 }} />
        <Button big title={t("app.next")} disabled={!ok} onPress={next} />
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={k.pad}>
      <Text style={T.title}>{tr(question)}</Text>
      <Text style={[T.small, { marginTop: 6, marginBottom: 16 }]}>{catalog.length ? t("app.productsHint") : t("app.productsNone")}</Text>
      {catalog.map((p) => {
        const on = doses.some((d) => d.productId === p.id);
        return (
          <Row
            key={p.id}
            title={p.name}
            subtitle={p.activeIngredient ?? undefined}
            choice="checkbox"
            selected={on}
            onPress={() => toggle(p)}
            left={on ? <Check size={22} color={C.accion} strokeWidth={3} /> : <View style={st.box} />}
          />
        );
      })}
      {doses
        .filter((d) => !d.productId)
        .map((d) => (
          <Row
            key={d.name}
            title={d.name}
            selected
            onPress={() => setDoses((ds) => ds.filter((x) => x !== d))}
            left={<Check size={22} color={C.accion} strokeWidth={3} />}
          />
        ))}
      <Button kind="text" title={t("app.productOther")} onPress={() => setView("other")} style={{ marginTop: 8 }} />
      <Button
        big
        disabled={doses.length === 0}
        title={t("app.productsContinue", { n: doses.length })}
        onPress={() => go(0)}
        style={{ marginTop: 16 }}
      />
    </ScrollView>
  );
}
