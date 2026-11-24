/** Declaraciones de tipos para módulos sin tipos propios. */
declare module "shpjs" {
  const shp: (
    data: ArrayBuffer,
  ) => Promise<import("geojson").FeatureCollection | import("geojson").FeatureCollection[]>;
  export default shp;
}
