import { AlertsList } from "../components/AlertsList";
import { t } from "../lib/i18n";
import { useFarms } from "../lib/queries";

export function AlertsPage() {
  const farms = useFarms();
  const names = Object.fromEntries((farms.data ?? []).map((f) => [f.id, f.name]));
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-3 text-xl font-semibold">{t("ui.alertsTitle")}</h1>
      <AlertsList farmNames={names} />
    </div>
  );
}
