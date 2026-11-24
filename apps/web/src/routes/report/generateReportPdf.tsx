/** Arma el PDF del parte (hasta 6 fotos de los registros) y lo descarga. */
import { isAudioMime } from "@yvy/shared";
import { get } from "../../lib/api";
import { download } from "../../lib/exports";
import type { ReportData } from "./useReportData";

const isUploadedPhoto = (a: { uploadStatus: string; mime?: string }) => a.uploadStatus === "uploaded" && !isAudioMime(a.mime ?? "");

/** Arma el PDF del parte (hasta 6 fotos de los registros) y lo descarga. */
export async function generateReportPdf(d: ReportData, from: string, to: string) {
  const farm = d.farm.data!;
  const rows = d.rows;
  const withPhotos = rows.filter((r) => r.attachments.some(isUploadedPhoto)).slice(0, 6);
  const photoUrls = (
    await Promise.all(
      withPhotos.map((r) =>
        get<{ url: string }>(`/media/attachments/${r.attachments.find(isUploadedPhoto)!.id}`).catch(() => null),
      ),
    )
  )
    .filter(Boolean)
    .map((x) => x!.url);
  const [{ pdf }, { WeeklyReport }] = await Promise.all([import("@react-pdf/renderer"), import("../../lib/reportPdf")]);
  const blob = await pdf(
    <WeeklyReport
      farm={farm.farm}
      plots={farm.plots}
      records={[...rows].reverse()}
      alerts={d.periodAlerts}
      rainMm={d.weekRain}
      gaugeMm={d.gaugeTotal}
      from={from}
      to={to}
      photoUrls={photoUrls}
    />,
  ).toBlob();
  download(blob, `parte-${farm.farm.name}-${from}.pdf`);
}
