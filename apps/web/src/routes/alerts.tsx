import { useState } from "react";
import { isFieldRole } from "@yvy/shared";
import { AlertSettingsSection } from "../components/AlertSettings";
import { AlertsList } from "../components/AlertsList";
import { Button, PageHeader, Page } from "../components/ui";
import { t } from "../lib/i18n";
import { useFarms, useMe } from "../lib/queries";

export function AlertsPage() {
  const farms = useFarms();
  const me = useMe();
  const [settings, setSettings] = useState(false);
  const names = Object.fromEntries((farms.data ?? []).map((f) => [f.id, f.name]));
  const canTune = !!me.data && !isFieldRole(me.data.role);
  return (
    <Page width="data" className="gap-4">
      <PageHeader title={t("ui.alertsTitle")} />
      <div className={`grid items-start gap-x-12 gap-y-6 ${canTune ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <AlertsList
          farmNames={names}
          emptyAction={
            canTune && !settings ? (
              <Button className="lg:hidden" onClick={() => setSettings(true)}>
                {t("ui.alertSettingsTitle")}
              </Button>
            ) : undefined
          }
        />
        <AlertSettingsSection open={settings} onToggle={() => setSettings(!settings)} />
      </div>
    </Page>
  );
}
