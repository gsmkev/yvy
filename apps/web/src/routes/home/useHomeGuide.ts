import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { guideSteps } from "../../components/FirstRunGuide";
import { put } from "../../lib/api";
import { loadPrefs } from "../../lib/prefs";
import { useMembers, useOnboarding } from "../../lib/queries";
import type { FarmSummary, Me } from "../../lib/types";

/**
 * Guía de primera vez (solo para quien edita, hasta completar los 4 pasos o descartarla) y el salto
 * directo al mapa cuando hay una sola estancia.
 */
export function useHomeGuide(list: FarmSummary[], farmsLoaded: boolean, me: Me | undefined, canEdit: boolean) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const members = useMembers(canEdit);
  const onboarding = useOnboarding(canEdit);
  const setGuide = useMutation({
    mutationFn: (dismissed: boolean) => put<{ dismissedAt: number | null }>("/me/onboarding", { dismissed }),
    onMutate: (d) => qc.setQueryData(["onboarding"], { dismissedAt: d ? Date.now() : null }),
    onSuccess: (r) => qc.setQueryData(["onboarding"], r),
  });
  // Lo que ocultó antes en este navegador vale hasta que el servidor responda
  const dismissed = onboarding.data ? onboarding.data.dismissedAt !== null : !!loadPrefs().guideDismissed;
  const steps = canEdit && farmsLoaded && members.data ? guideSteps(list, members.data) : null;
  const guide = steps && !dismissed && steps.some((s) => !s.done) ? steps : null;
  const ready = !!me && (!canEdit || ((!!members.data || members.isError) && !onboarding.isLoading));
  // Con una sola estancia, el mapa de esa estancia es el inicio (salvo que falte completar la guía)
  const only = list.length === 1 && ready && !guide ? list[0]!.id : null;
  useEffect(() => {
    if (only) navigate({ to: "/estancias/$farmId", params: { farmId: only }, replace: true });
  }, [only]);
  return { steps, guide, dismissed, setGuide };
}
