/** "2026-11-12" -> "12/11/2026". */
export const fmtIsoDay = (iso: string): string => iso.split("-").reverse().join("/");
