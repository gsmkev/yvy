/** Estado y datos de la exportación contable: conjunto, fechas, formato, columnas y formatos guardados. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  defaultExportConfig,
  EXPORT_PRESETS,
  localDate,
  renderExport,
  type ExportCashMove,
  type ExportConfig,
  type ExportDataset,
  type ExportDoc,
} from "@yvy/shared";
import { del, get, post, put, withQs } from "../../../lib/api";
import { t } from "../../../lib/i18n";
import { toast } from "../../ui";

/** Formato de exportación guardado por la organización. */
interface SavedFormat {
  id: string;
  name: string;
  dataset: ExportDataset;
  config: ExportConfig;
}

interface Rows {
  truncated: boolean;
  rows: (ExportDoc | ExportCashMove)[];
}

const monthStart = () => localDate(Date.now()).slice(0, 8) + "01";

function useSavedFormats(dataset: ExportDataset, cfg: ExportConfig, name: string, picked: string, setPicked: (id: string) => void) {
  const qc = useQueryClient();
  const saved = useQuery({ queryKey: ["erp", "export-formats"], queryFn: () => get<SavedFormat[]>("/org/erp/export/formats") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["erp", "export-formats"] });
  const save = useMutation({
    mutationFn: () => {
      const existing = saved.data?.find((x) => x.id === picked);
      const body = { name: name.trim(), dataset, config: cfg };
      return existing && existing.name === name.trim() ? put<{ id?: string }>(`/org/erp/export/formats/${existing.id}`, body) : post<{ id: string }>("/org/erp/export/formats", body);
    },
    onSuccess: (r) => {
      toast(t("ui.erp.saved"));
      if (r && typeof r === "object" && "id" in r && typeof r.id === "string") setPicked(r.id);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/org/erp/export/formats/${id}`),
    onSuccess: () => {
      toast(t("ui.erp.deleted"));
      setPicked("");
      refresh();
    },
  });
  return { saved, save, remove };
}

/** Todo lo que necesitan las secciones de la exportación contable. */
export function useExportState() {
  const [dataset, setDataset] = useState<ExportDataset>("purchases");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localDate(Date.now()));
  const [cfg, setCfg] = useState<ExportConfig>(EXPORT_PRESETS[0].config());
  const [picked, setPicked] = useState<string>(EXPORT_PRESETS[0].id);
  const [name, setName] = useState("");
  const { saved, save, remove } = useSavedFormats(dataset, cfg, name, picked, setPicked);
  const data = useQuery({
    queryKey: ["erp", "export-rows", dataset, from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: () => get<Rows>(withQs("/org/erp/export/rows", { dataset, from, to })),
  });
  const choose = (id: string, ds: ExportDataset = dataset) => {
    setPicked(id);
    const preset = EXPORT_PRESETS.find((p) => p.id === id);
    const own = saved.data?.find((x) => x.id === id);
    if (preset) setCfg(preset.config());
    else if (own) {
      setCfg(own.config);
      setName(own.name);
    } else setCfg(defaultExportConfig(ds));
  };
  const changeDataset = (ds: ExportDataset) => {
    setDataset(ds);
    choose(EXPORT_PRESETS.find((p) => p.dataset === ds)?.id ?? "", ds);
  };
  const set = <K extends keyof ExportConfig>(k: K, v: ExportConfig[K]) => setCfg({ ...cfg, [k]: v });
  const rows = data.data?.rows ?? [];
  const text = renderExport(dataset, rows, cfg);
  return { dataset, changeDataset, from, setFrom, to, setTo, cfg, set, picked, choose, name, setName, saved, save, remove, data, rows, text };
}

/** Estado de la exportación que reciben las secciones de la pantalla. */
export type ExportState = ReturnType<typeof useExportState>;
