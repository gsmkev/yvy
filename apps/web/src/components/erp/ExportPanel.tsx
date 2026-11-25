/** Exportación para sistemas contables locales: compras, ventas y caja con formato configurable y libro IVA de Paraguay. */
import type { ExportDoc } from "@yvy/shared";
import { download } from "../../lib/exports";
import { fmtNum } from "../../lib/format";
import { t } from "../../lib/i18n";
import { Button } from "../ui";
import { HeaderActions } from "./adminSlot";
import { ColumnsSection, FormatSection, PreviewAside, WhatSection } from "./export/ExportSections";
import { TaxSection } from "./export/TaxSection";
import { useExportState, type ExportState } from "./export/useExportState";

function DownloadButton({ x }: { x: ExportState }) {
  const { cfg, dataset, from, to, rows, text } = x;
  const downloadFile = () => {
    const blob = new Blob([cfg.bom ? "﻿" : "", text], { type: "text/csv;charset=utf-8" });
    download(blob, `${dataset}-${from}_${to}.${cfg.separator === "tab" ? "txt" : "csv"}`);
  };
  return (
    <Button variant="primary" disabled={rows.length === 0} title={rows.length === 0 ? t("ui.exp.empty") : undefined} onClick={downloadFile}>
      {t("ui.exp.download", { n: fmtNum(rows.length) })}
    </Button>
  );
}

/** Exportación para sistemas contables locales con formato configurable. */
export function ExportPanel() {
  const x = useExportState();
  const hasRows = x.rows.length > 0;
  const docs = x.dataset === "cash" ? [] : (x.rows as ExportDoc[]);
  return (
    <div className="flex flex-col gap-8">
      <HeaderActions>
        <DownloadButton x={x} />
      </HeaderActions>
      <div className={`grid gap-x-10 gap-y-8 ${hasRows ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]" : ""}`}>
        <div className={`flex min-w-0 flex-col gap-8 ${hasRows ? "" : "max-w-3xl"}`}>
          <WhatSection x={x} />
          <FormatSection x={x} />
          <ColumnsSection x={x} />
        </div>
        {hasRows && <PreviewAside x={x} />}
      </div>
      {docs.length > 0 && <TaxSection docs={docs} />}
    </div>
  );
}
