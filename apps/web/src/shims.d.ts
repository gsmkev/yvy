declare module "shpjs" {
  const shp: (
    data: ArrayBuffer,
  ) => Promise<import("geojson").FeatureCollection | import("geojson").FeatureCollection[]>;
  export default shp;
}

/** Lo fija vite.config.ts al compilar (versión de la app para la copia de lecturas sin conexión). */
declare const __APP_VERSION__: string | undefined;
