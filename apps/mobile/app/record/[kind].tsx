import { Camera, MapPin } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { LIMITS, parseRecordData, t, type RecordKind } from "@yvy/shared";
import type { LocalPhoto } from "../../src/db/store";
import { getDb } from "../../src/lib/db";
import { FORMS, type FieldSpec } from "../../src/lib/forms";
import { currentFix, detectPlot, type Fix } from "../../src/lib/location";
import { processPhoto } from "../../src/lib/photos";
import { useSession } from "../../src/lib/session";
import { localChanged, syncNow } from "../../src/lib/sync";
import { Button, Muted, styles as k } from "../../src/ui/kit";
import { C, TOUCH } from "../../src/ui/theme";

export default function RecordForm() {
  const {
    kind,
    taskId,
    plotId: presetPlot,
  } = useLocalSearchParams<{ kind: RecordKind; taskId?: string; plotId?: string }>();
  const session = useSession()!;
  const db = getDb();
  const plots = db.plots();
  const farms = db.farms();
  const pois = db.pois();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [fix, setFix] = useState<Fix | null | "searching">("searching");
  const [plotId, setPlotId] = useState<string | null>(presetPlot || null);
  const [auto, setAuto] = useState(false);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentFix().then((f) => {
      setFix(f);
      const p = detectPlot(plots, f);
      if (p && !presetPlot) {
        setPlotId(p.id);
        setAuto(true);
      }
    });
  }, []);

  const farmId = plots.find((p) => p.id === plotId)?.farmId ?? farms[0]?.id;
  const set = (key: string, v: unknown) => setValues({ ...values, [key]: v });

  const save = () => {
    setError(null);
    const data: Record<string, unknown> = { ...values };
    const poiId = (data.gauge as string | undefined) ?? null;
    delete data.gauge;
    if (kind === "rain") data.readAt = Date.now();
    for (const f of FORMS[kind])
      if (f.type === "number" && typeof data[f.key] === "string")
        data[f.key] = Number(String(data[f.key]).replace(",", "."));
    for (const [k2, v] of Object.entries(data)) if (v === "" || v === undefined) delete data[k2];
    const parsed = parseRecordData(kind, data);
    if (!parsed.success || !farmId) {
      setError(t("app.required"));
      return;
    }
    const f = fix === "searching" ? null : fix;
    const recordId = db.saveRecord(
      session.user.id,
      session.organization.id,
      {
        farmId,
        plotId,
        poiId,
        kind,
        data: parsed.data as Record<string, unknown>,
        lon: f?.lon ?? null,
        lat: f?.lat ?? null,
        gpsAccuracyM: f?.accuracy ?? null,
        capturedAt: Date.now(),
      },
      photos,
    );
    if (taskId) db.completeTask(taskId, recordId);
    localChanged();
    syncNow();
    router.back();
  };

  if (camera) return <PhotoCamera onDone={(p) => (p && setPhotos([...photos, p]), setCamera(false))} />;

  return (
    <>
      <Stack.Screen options={{ title: t(`recordKinds.${kind}`) }} />
      <ScrollView style={k.screen} contentContainerStyle={[k.pad, { gap: 16, paddingBottom: 40 }]}>
        <View style={s.gps}>
          <MapPin size={18} color={fix && fix !== "searching" ? C.accion : C.tinta2} />
          <Text style={s.gpsText}>
            {fix === "searching"
              ? t("app.gpsSearching")
              : fix
                ? t("app.gpsOk", { m: Math.round(fix.accuracy ?? 0) })
                : t("app.gpsNone")}
          </Text>
        </View>
        <View>
          <Text style={s.label}>
            {t("app.plot")}
            {auto ? ` · ${t("app.autoPlot")}` : ""}
          </Text>
          <Chips
            options={[{ value: "", label: t("app.noPlot") }, ...plots.map((p) => ({ value: p.id, label: p.name }))]}
            value={plotId ?? ""}
            onChange={(v) => (setPlotId(v || null), setAuto(false))}
          />
        </View>
        {FORMS[kind].map((f) => (
          <FieldInput
            key={f.key}
            spec={f}
            value={values[f.key]}
            onChange={(v) => set(f.key, v)}
            pois={pois.filter((p) => p.kind === "rain_gauge")}
          />
        ))}
        <View>
          <Text style={s.label}>{t("app.photosCount", { n: photos.length, max: LIMITS.photos.maxPerRecord })}</Text>
          <View style={s.photos}>
            {photos.map((p) => (
              <Image key={p.thumbUri} source={{ uri: p.thumbUri }} style={s.thumb} />
            ))}
          </View>
          {photos.length < LIMITS.photos.maxPerRecord && (
            <Button title={t("app.takePhoto")} icon={Camera} variant="secondary" onPress={() => setCamera(true)} />
          )}
        </View>
        {error && <Text style={{ color: C.alerta, fontSize: 16 }}>{error}</Text>}
        <Button title={t("app.save")} onPress={save} />
      </ScrollView>
    </>
  );
}

function FieldInput({
  spec,
  value,
  onChange,
  pois,
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  pois: { id: string; name: string }[];
}) {
  const label =
    t(`fields.${spec.key === "note" ? "text" : spec.key}` as never) + ("required" in spec && spec.required ? " *" : "");
  const title = spec.key === "note" ? t("app.note") : label;
  return (
    <View>
      <Text style={s.label}>{title}</Text>
      {spec.type === "choice" && (
        <Chips
          options={spec.options.map((o) => ({ value: o, label: t(`${spec.labelPrefix}${o}` as never) }))}
          value={(value as string) ?? ""}
          onChange={onChange}
        />
      )}
      {spec.type === "boolean" && (
        <Chips
          options={[
            { value: "1", label: t("app.yes") },
            { value: "0", label: t("app.no") },
          ]}
          value={value === undefined ? "" : value ? "1" : "0"}
          onChange={(v) => onChange(v === "1")}
        />
      )}
      {spec.type === "number" && (
        <TextInput
          style={[s.input, s.big]}
          keyboardType="decimal-pad"
          value={(value as string) ?? ""}
          onChangeText={onChange}
          placeholder={spec.unit ?? ""}
        />
      )}
      {spec.type === "text" && (
        <TextInput
          style={[s.input, spec.multiline && { minHeight: 96, textAlignVertical: "top" }]}
          multiline={spec.multiline}
          value={(value as string) ?? ""}
          onChangeText={onChange}
        />
      )}
      {spec.type === "poi" && pois.length > 0 && (
        <Chips
          options={[{ value: "", label: "—" }, ...pois.map((p) => ({ value: p.id, label: p.name }))]}
          value={(value as string) ?? ""}
          onChange={(v) => onChange(v || undefined)}
        />
      )}
    </View>
  );
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.chips}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => onChange(o.value)}
          style={[s.chip, o.value === value && s.chipOn]}
        >
          <Text style={[s.chipText, o.value === value && { color: C.white }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PhotoCamera({ onDone }: { onDone: (p: LocalPhoto | null) => void }) {
  const [perm, request] = useCameraPermissions();
  const [ref, setRef] = useState<CameraView | null>(null);
  const [busy, setBusy] = useState(false);
  if (!perm) return null;
  if (!perm.granted)
    return (
      <View style={[k.screen, k.pad, { justifyContent: "center", gap: 12 }]}>
        <Muted>{t("app.cameraDenied")}</Muted>
        <Button title={t("app.allowCamera")} onPress={request} />
        <Button title={t("ui.cancel")} variant="secondary" onPress={() => onDone(null)} />
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <CameraView ref={setRef} style={{ flex: 1 }} facing="back" />
      <View style={s.shutterRow}>
        <Button title={t("ui.cancel")} variant="secondary" onPress={() => onDone(null)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("app.takePhoto")}
          disabled={busy}
          style={s.shutter}
          onPress={async () => {
            if (!ref) return;
            setBusy(true);
            try {
              const pic = await ref.takePictureAsync({ quality: 0.9, skipProcessing: false });
              onDone(await processPhoto(pic.uri, pic.width, pic.height));
            } catch (e) {
              Alert.alert(String(e));
              setBusy(false);
            }
          }}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  gps: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.linea,
    borderRadius: 10,
    padding: 12,
  },
  gpsText: { color: C.surco, fontSize: 15 },
  label: { fontSize: 16, fontWeight: "700", color: C.surco, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: TOUCH,
    minWidth: TOUCH,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: C.accion, borderColor: C.accion },
  chipText: { fontSize: 17, fontWeight: "600", color: C.surco },
  input: {
    backgroundColor: C.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    minHeight: TOUCH,
    fontSize: 18,
  },
  big: { fontSize: 26, fontWeight: "700" },
  photos: { flexDirection: "row", gap: 8, marginBottom: 8 },
  thumb: { width: 96, height: 96, borderRadius: 10 },
  shutterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    padding: 20,
    backgroundColor: "black",
  },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 6, borderColor: C.white, backgroundColor: C.accion },
});
