/**
 * Buscar un animal por caravana (G-21): ficha e historial con lo que bajó al celular, también sin señal.
 * Los animales se cargan desde la web; acá solo se consultan.
 */
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { Pencil, Plus } from "lucide-react-native";
import { ANIMAL_SEXES, describeRecord, HERD_CATEGORIES, isFieldRole, normalizeTag, t, weightSeries, type MessageKey, type WeightPoint } from "@yvy/shared";
import { getDb } from "../src/lib/db";
import { getSession } from "../src/lib/session";
import { syncNow, useSyncStatus } from "../src/lib/sync";
import { showToast } from "../src/lib/toast";
import { useLocal } from "../src/lib/useLocal";
import { FarmChips, useFarmPick } from "../src/office/farmPick";
import { useOnlineMutation } from "../src/office/useOnlineMutation";
import { DateField, FormSheet, SelectField, TextField } from "../src/office/ui";
import { RECORD_ICON } from "../src/ui/icons";
import { Button, EmptyState, RadioGroup, Row, s as k, Text, TextInput } from "../src/ui/kit";
import { C, RADIUS, T } from "../src/ui/theme";

const when = (ms: number) => new Date(ms).toLocaleDateString("es-PY", { day: "numeric", month: "short", year: "numeric" });

interface Draft {
  id: string | null;
  tag: string;
  category: string;
  sex: string;
  birthDate: string;
  note: string;
}
const EMPTY: Draft = { id: null, tag: "", category: "vaca", sex: "hembra", birthDate: "", note: "" };

export default function Animals() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // Alta y edición: solo oficina y con señal (REST); después se sincroniza y la lista local se actualiza.
  const canEdit = !isFieldRole(getSession()?.organization.role ?? "");
  const online = useSyncStatus().online;
  const { farms, farm, setFarmId } = useFarmPick();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useOnlineMutation<Record<string, unknown>, { id: string }>("POST", `/org/farms/${farm?.id}/animals`);
  const edit = useOnlineMutation<Record<string, unknown> & { id: string }, { ok: boolean }>("PATCH", (b) => `/org/animals/${b.id}`);
  const total = useLocal(() => getDb().animals("", 1).length);
  const found = useLocal(() => getDb().animals(query), [query]);
  const animal = found.find((a) => a.id === selected) ?? null;
  const history = useLocal(() => (animal ? getDb().recordsOfTag(animal.tag) : []), [animal?.tag]);
  const adg = useMemo(() => {
    const pts: WeightPoint[] = [];
    for (const r of history) {
      if (r.kind !== "weighing") continue;
      const d = JSON.parse(r.data) as { kg?: number };
      if (typeof d.kg === "number") pts.push({ at: r.capturedAt, kg: d.kg, head: 1 });
    }
    return pts.length > 1 ? weightSeries("a", null, pts).adgKg : null;
  }, [history]);

  const submit = async () => {
    if (!draft) return;
    const tag = normalizeTag(draft.tag);
    if (!tag) return setFormError(t("office.animals.needsTag"));
    setFormError(null);
    const body = { tag, category: draft.category, sex: draft.sex, birthDate: draft.birthDate || null, note: draft.note.trim() || null };
    const r = draft.id ? await edit.mutate({ id: draft.id, ...body }) : await create.mutate(body);
    if (r.ok) {
      setDraft(null);
      showToast(t("ui.animal.saved"));
      void syncNow();
    }
  };
  const openNew = () => {
    create.reset();
    setFormError(null);
    setDraft(EMPTY);
  };
  const openEdit = () => {
    if (!animal) return;
    edit.reset();
    setFormError(null);
    setDraft({ id: animal.id, tag: animal.tag, category: animal.category, sex: animal.sex, birthDate: animal.birthDate ?? "", note: animal.note ?? "" });
  };
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <View style={{ flex: 1, backgroundColor: C.papel }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[k.pad, { paddingBottom: canEdit ? 24 : 80 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "" }} />
      <Text style={T.title}>{t("app.animals.title")}</Text>
      <TextInput
        value={query}
        onChangeText={(v) => {
          setQuery(normalizeTag(v).slice(0, 20));
          setSelected(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={t("app.animals.search")}
        placeholderTextColor={C.tinta3}
        accessibilityLabel={t("app.animals.search")}
        style={st.input}
      />
      {canEdit && <FarmChips farms={farms} value={farm?.id} onChange={setFarmId} />}
      {total === 0 && <EmptyState title={canEdit ? t("office.animals.noneOffice") : t("app.animals.none")} />}
      {total > 0 && found.length === 0 && <EmptyState title={t("app.animals.noMatch")} />}
      <RadioGroup label={t("app.animals.title")}>
        {found.map((a) => (
          <Row
            key={a.id}
            choice="radio"
            title={a.tag}
            subtitle={`${t(`fields.herd.${a.category}` as MessageKey)} · ${t(`fields.sex.${a.sex}` as MessageKey)}`}
            selected={selected === a.id}
            onPress={() => setSelected(a.id)}
          />
        ))}
      </RadioGroup>
      {animal && (
        <View style={{ marginTop: 24 }}>
          <Text style={T.heading}>{animal.tag}</Text>
          <Text style={[T.small, { marginTop: 2 }]}>
            {[
              t(`fields.herd.${animal.category}` as MessageKey),
              t(`fields.sex.${animal.sex}` as MessageKey),
              animal.birthDate ? t("app.animals.born", { date: animal.birthDate.split("-").reverse().join("/") }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {animal.note ? <Text style={[T.body, { marginTop: 6 }]}>{animal.note}</Text> : null}
          {canEdit && <Button kind="secondary" title={t("ui.common.edit")} icon={Pencil} disabled={!online} onPress={openEdit} style={{ marginTop: 12, alignSelf: "flex-start" }} />}
          {adg !== null && <Text style={[T.bodyMedium, { marginTop: 10 }]}>{t("app.animals.adg", { v: adg.toFixed(2).replace(".", ",") })}</Text>}
          <Text style={[T.heading, { marginTop: 20, marginBottom: 4 }]}>{t("app.animals.history")}</Text>
          {history.length === 0 && <Text style={T.small}>{t("app.animals.noHistory")}</Text>}
          {history.map((r) => (
            <Row
              key={r.id}
              icon={RECORD_ICON[r.kind]}
              title={t(`record-kinds.kind.${r.kind}` as MessageKey)}
              subtitle={`${when(r.capturedAt)} · ${describeRecord(r.kind, JSON.parse(r.data))}`}
            />
          ))}
          <Text style={[T.small, { marginTop: 12, color: C.tinta3 }]}>{t("app.animals.historyNote")}</Text>
        </View>
      )}
    </ScrollView>
    {canEdit && (
      <View style={[k.footer, { paddingBottom: 12 }]}>
        {!online && <Text style={[T.smallMedium, { marginBottom: 8 }]}>{t("office.animals.officeOnly")}</Text>}
        <Button title={t("ui.animal.add")} icon={Plus} disabled={!online || !farm} onPress={openNew} />
      </View>
    )}
    <FormSheet visible={!!draft} title={draft?.id ? t("office.animals.editTitle") : t("office.animals.addTitle")} onClose={() => setDraft(null)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={create.pending || edit.pending} error={formError ?? (draft?.id ? edit.error : create.error)}>
      {draft && (
        <>
          <TextField label={t("fields.common.tag")} hint={t("ui.animal.tagHint")} value={draft.tag} onChangeText={(v) => patch({ tag: normalizeTag(v).slice(0, 20) })} autoCapitalize="characters" maxLength={20} />
          <SelectField label={t("fields.herd.category")} value={draft.category} options={HERD_CATEGORIES.map((c) => ({ value: c as string, label: t(`fields.herd.${c}` as MessageKey) }))} onChange={(v) => patch({ category: v })} />
          <SelectField label={t("fields.common.sex")} value={draft.sex} options={ANIMAL_SEXES.map((c) => ({ value: c as string, label: t(`fields.sex.${c}` as MessageKey) }))} onChange={(v) => patch({ sex: v })} />
          <DateField label={t("ui.animal.birth")} value={draft.birthDate} onChange={(v) => patch({ birthDate: v })} />
          <TextField label={t("app.common.note")} value={draft.note} onChangeText={(v) => patch({ note: v })} kind="multiline" maxLength={500} />
        </>
      )}
    </FormSheet>
    </View>
  );
}

const st = StyleSheet.create({
  input: {
    marginTop: 16,
    minHeight: 56,
    borderWidth: 1,
    borderColor: C.lineaFuerte,
    borderRadius: RADIUS,
    paddingHorizontal: 16,
    fontSize: 20,
    color: C.tinta,
    backgroundColor: C.blanco,
  },
});
