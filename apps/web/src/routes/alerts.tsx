import { useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { AlertSettingsSection } from "../components/AlertSettings";
import { AlertsList } from "../components/AlertsList";
import { Button, PageHeader } from "../components/ui";
import { t } from "../lib/i18n";
import { useFarms, useMe } from "../lib/queries";

export function AlertsPage() {
  const farms = useFarms();
  const me = useMe();
  const [settings, setSettings] = useState(false);
  const names = Object.fromEntries((farms.data ?? []).map((f) => [f.id, f.name]));
  const canTune = !!me.data && !isFieldRole(me.data.role);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <PageHeader title={t("ui.alertsTitle")} />
      <AlertsList
        farmNames={names}
        emptyAction={
          canTune && !settings ? <Button onClick={() => setSettings(true)}>{t("ui.alertSettingsTitle")}</Button> : undefined
        }
      />
      <AlertSettingsSection open={settings} onToggle={() => setSettings(!settings)} />
    </div>
  );
}
