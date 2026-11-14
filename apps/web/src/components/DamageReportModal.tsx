import { useState } from "react";
import { get } from "../lib/api";
import {
  DAMAGE_CAUSES,
  damageEvidence,
  recordsRange,
  todayIso,
  type DamageCause,
  type NdviPass,
} from "../lib/damageData";
import { download } from "../lib/exports";
import { t, tk } from "../lib/i18n";
import { fetchAllRecords, useFarm, useMe } from "../lib/queries";
import type { Plot } from "../lib/types";
import { ErrorBox, Field, FormActions, Input, Modal, Select } from "./ui";

/** Informe de daños para el seguro agrícola (C-09): fecha del evento, vigor antes y después, registros y fotos en un PDF. */
export function DamageReportModal({ plot, onClose }: { plot: Plot; onClose: () => void }) {
  const farm = useFarm(plot.farmId);
  const me = useMe();
  const [eventDay, setEventDay] = useState(todayIso());
  const [cause, setCause] = useState<DamageCause>("frost");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const generate = async () => {
    if (!farm.data) return;
    setBusy(true);
    setError(null);
    try {
      const range = recordsRange(eventDay);
      const [ndvi, rows] = await Promise.all([
        get<{ series: NdviPass[] }>(`/org/plots/${plot.id}/ndvi`),
        fetchAllRecords({ farmId: plot.farmId, plotId: plot.id, from: range.from, to: range.to }, 500),
      ]);
      const evidence = damageEvidence(rows, eventDay);
      const photoUrls = (
        await Promise.all(
          evidence.withPhotos.map((r) =>
            get<{ url: string }>(`/media/attachments/${r.attachments.find((a) => a.uploadStatus === "uploaded")!.id}`).catch(() => null),
          ),
        )
      )
        .filter((x): x is { url: string } => !!x)
        .map((x) => x.url);
      const [{ pdf }, { DamageReport }] = await Promise.all([import("@react-pdf/renderer"), import("../lib/damagePdf")]);
      const blob = await pdf(
        <DamageReport
          farm={farm.data.farm}
          plot={plot}
          eventDay={eventDay}
          cause={cause}
          description={description}
          series={ndvi.series}
          evidence={evidence}
          photoUrls={photoUrls}
          generatedAt={Date.now()}
          author={me.data?.user.fullName ?? ""}
        />,
      ).toBlob();
      download(blob, `${t("ui.damageFile")}-${plot.name}-${eventDay}.pdf`);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("ui.damageTitle")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <p className="text-sm text-tinta-2">{t("ui.damageIntro")}</p>
        <Field label={t("ui.damageEventDate")}>
          <Input type="date" required max={todayIso()} value={eventDay} onChange={(e) => setEventDay(e.target.value)} />
        </Field>
        <Field label={t("ui.damageCause")}>
          <Select
            value={cause}
            onChange={(e) => setCause(e.target.value as DamageCause)}
            options={DAMAGE_CAUSES.map((c) => ({ value: c, label: tk(`ui.damageCause_${c}`) }))}
          />
        </Field>
        <Field label={t("ui.damageDescription")}>
          <textarea
            className="min-h-24 rounded-md border border-linea bg-papel p-3 text-[15px] outline-none focus:border-accion focus:ring-2 focus:ring-accion/20"
            maxLength={1500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {error ? <ErrorBox error={error} /> : null}
        <FormActions
          onCancel={onClose}
          disabled={busy || !farm.data}
          label={busy ? t("ui.damageBusy") : t("ui.damageGenerate")}
        />
      </form>
    </Modal>
  );
}
