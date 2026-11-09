declare module "shpjs" {
  const shp: (
    data: ArrayBuffer,
  ) => Promise<import("geojson").FeatureCollection | import("geojson").FeatureCollection[]>;
  export default shp;
}
