const nf = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat("es-PY", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Asuncion",
});
const dtf = new Intl.DateTimeFormat("es-PY", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Asuncion",
});

export const fmtNum = (n: number) => nf.format(n);
export const fmtHa = (n: number) => `${nf.format(n)} ha`;
export const fmtDate = (ms: number) => df.format(new Date(ms));
export const fmtDateTime = (ms: number) => dtf.format(new Date(ms));
export const fmtIsoDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
export const toIso = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
