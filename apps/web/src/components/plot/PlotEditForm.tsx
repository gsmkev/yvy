import { CROPS, PLOT_KINDS, SEASONS } from "@yvy/shared";
import { t } from "../../lib/i18n";
import { Button, ErrorBox, Field, Form, Input, Select } from "../ui";
import type { PlotForm } from "./usePlotData";

export function PlotEditForm({ f, onCancel }: { f: PlotForm; onCancel: () => void }) {
  const { form, set, save } = f;
  return (
    <Form className="flex flex-col gap-3 border-t border-linea pt-4" onSubmit={() => save.mutate()}>
      <Field label={t("ui.common.plot")}>
        <Input value={form.name} onChange={set("name")} required />
      </Field>
      <Field label={t("ui.plot.kind")}>
        <Select
          value={form.kind}
          onChange={set("kind")}
          options={PLOT_KINDS.map((k) => ({ value: k, label: k === "crop" ? t("ui.common.crop") : t("ui.common.pasture") }))}
        />
      </Field>
      {form.kind === "crop" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.common.crop")}>
            <Select
              value={form.crop}
              onChange={set("crop")}
              options={[{ value: "", label: "—" }, ...CROPS.map((c) => ({ value: c, label: c }))]}
            />
          </Field>
          <Field label={t("ui.common.season")}>
            <Select
              value={form.season}
              onChange={set("season")}
              options={[{ value: "", label: "—" }, ...SEASONS.map((c) => ({ value: c, label: c }))]}
            />
          </Field>
          <Field label={t("ui.common.sowingDate")}>
            <Input type="date" value={form.sowingDate} onChange={set("sowingDate")} />
          </Field>
        </div>
      ) : (
        <Field label={t("ui.common.pastureType")}>
          <Input value={form.pastureType} onChange={set("pastureType")} />
        </Field>
      )}
      {save.error && <ErrorBox error={save.error} />}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.common.save")}
        </Button>
        <Button variant="quiet" onClick={() => onCancel()}>
          {t("ui.common.cancel")}
        </Button>
      </div>
    </Form>
  );
}
