export type Lead = {
  name: string;
  whatsapp: string;
  company?: string;
  crops: string[];
  hectares?: string;
  employees?: string;
  department?: string;
};

/** Local-only for now; swap the body for a Lovable Cloud insert when ready. */
export async function submitLead(lead: Lead): Promise<{ ok: true }> {
  await new Promise((r) => setTimeout(r, 1200));
  if (typeof window !== "undefined") {
    const prev = JSON.parse(localStorage.getItem("yvy-leads") || "[]");
    localStorage.setItem("yvy-leads", JSON.stringify([...prev, { ...lead, at: new Date().toISOString() }]));
  }
  return { ok: true };
}
