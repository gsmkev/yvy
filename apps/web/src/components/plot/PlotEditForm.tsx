import { CROPS, PLOT_KINDS, SEASONS } from "@yvy/shared";
import { t } from "../../lib/i18n";
import { Button, ErrorBox, Field, Form, Input, Select } from "../ui";
import type { PlotForm } from "./usePlotData";

export function PlotEditForm({ f, onCancel }: { f: PlotForm; onCancel: () => void }) {
  const { form, set, save } = f;
  return (
    <Form className="flex flex-col gap-3 border-t border-linea pt-4" onSubmit={() => save.mutate()}>
      <Field label={t("ui.plot")}>
        <Input value={form.name} onChange={set("name")} required />
      </Field>
      <Field label={t("ui.plotKind")}>
        <Select
          value={form.kind}
          onChange={set("kind")}
          options={PLOT_KINDS.map((k) => ({ value: k, label: k === "crop" ? t("ui.crop") : t("ui.pasture") }))}
        />
      </Field>
      {form.kind === "crop" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("ui.crop")}>
            <Select
              value={form.crop}
              onChange={set("crop")}
              options={[{ value: "", label: "—" }, ...CROPS.map((c) => ({ value: c, label: c }))]}
            />
          </Field>
          <Field label={t("ui.season")}>
            <Select
              value={form.season}
              onChange={set("season")}
              options={[{ value: "", label: "—" }, ...SEASONS.map((c) => ({ value: c, label: c }))]}
            />
          </Field>
          <Field label={t("ui.sowingDate")}>
            <Input type="date" value={form.sowingDate} onChange={set("sowingDate")} />
          </Field>
        </div>
      ) : (
        <Field label={t("ui.pastureType")}>
          <Input value={form.pastureType} onChange={set("pastureType")} />
        </Field>
      )}
      {save.error && <ErrorBox error={save.error} />}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("ui.save")}
        </Button>
        <Button variant="quiet" onClick={() => onCancel()}>
          {t("ui.cancel")}
        </Button>
      </div>
    </Form>
  );
}
