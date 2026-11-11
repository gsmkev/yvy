/** Armado de mutaciones de registros para los tests de ganadería. */
import { newId, RECORD_SCHEMA_VERSION } from "@yvy/shared";
import { call } from "./helpers";

export const rec = (
  farmId: string,
  plotId: string | null,
  kind: string,
  data: unknown,
  capturedAt = Date.now() - 1000,
) => ({
  mutationId: newId(),
  kind: "records.upsert",
  row: {
    id: newId(),
    farmId,
    plotId,
    poiId: null,
    kind,
    data,
    schemaVersion: RECORD_SCHEMA_VERSION,
    lon: null,
    lat: null,
    gpsAccuracyM: null,
    capturedAt,
  },
});

export const push = (token: string, mutations: unknown[]) =>
  call("POST", "/sync/push", { token, body: { deviceId: "dev", mutations } });
