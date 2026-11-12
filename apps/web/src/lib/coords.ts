/** Lectura de ubicaciones pegadas: decimales, grados-minutos-segundos y enlaces de Google Maps o WhatsApp. */
export interface LonLat {
  lon: number;
  lat: number;
}

const NUM = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;
const valid = (lat: number, lon: number): LonLat | null =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;

function fromLink(text: string): LonLat | null {
  let s = text;
  try {
    s = decodeURIComponent(text);
  } catch {
    /* se usa tal cual */
  }
  const patterns = [
    new RegExp(String.raw`!3d(${NUM})!4d(${NUM})`), // datos internos del enlace
    new RegExp(String.raw`@(${NUM}),\s*(${NUM})`),
    new RegExp(String.raw`[?&](?:q|ll|query|destination|center)=\s*(${NUM})\s*,\s*(${NUM})`),
    new RegExp(String.raw`/maps/place/(${NUM}),\s*(${NUM})`),
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const r = valid(Number(m[1]), Number(m[2]));
      if (r) return r;
    }
  }
  return null;
}

/** 25°16'59.2"S 57°38'03.5"W, 25 16 59 S 57 38 3 W, S 25° 16' 59" W 57° 38' 3"… */
function fromDms(text: string): LonLat | null {
  const part = String.raw`([NSEWnsew])?\s*(\d{1,3})\s*(?:°|º|d|\s)\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:['′’]|m|\s)\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:["″”]|'{2}|’’|s)?\s*)?([NSEWnsew])?`;
  const clean = text.replace(/[,;]/g, " ").replace(/\s+/g, " ").trim();
  const re = new RegExp(`^${part}\\s+${part}$`);
  const m = re.exec(clean);
  if (!m) return null;
  const one = (pre?: string, d?: string, mi?: string, se?: string, post?: string) => {
    const hemi = (pre ?? post)?.toUpperCase();
    if (!hemi) return null;
    const v = Number(d) + Number(mi ?? 0) / 60 + Number(se ?? 0) / 3600;
    return { hemi, v: hemi === "S" || hemi === "W" ? -v : v };
  };
  // "S 25° 16' W 57° 38'": la W del medio es el prefijo del segundo grupo, no el sufijo del primero
  const moved = !!m[1] && !!m[5] && !m[6];
  const a = one(m[1], m[2], m[3], m[4], moved ? undefined : m[5]);
  const b = one(moved ? m[5] : m[6], m[7], m[8], m[9], m[10]);
  if (!a || !b) return null;
  const aLat = a.hemi === "N" || a.hemi === "S";
  const bLat = b.hemi === "N" || b.hemi === "S";
  if (aLat === bLat) return null;
  const lat = aLat ? a : b;
  const lon = aLat ? b : a;
  if (Math.abs(lat.v) > 90 || Math.abs(lon.v) > 180) return null;
  return valid(lat.v, lon.v);
}

function fromDecimal(text: string): LonLat | null {
  const m = new RegExp(String.raw`^\(?\s*(${NUM})\s*°?\s*[,;\s]\s*(${NUM})\s*°?\s*\)?$`).exec(text.trim());
  if (!m) return null;
  let lat = Number(m[1]);
  let lon = Number(m[2]);
  // "lon, lat" pegado al revés: la latitud no puede pasar de 90, o el par solo tiene sentido en Paraguay al revés
  const inPy = (la: number, lo: number) => la < -19 && la > -28 && lo < -54 && lo > -63;
  if ((Math.abs(lat) > 90 && Math.abs(lon) <= 90) || (!inPy(lat, lon) && inPy(lon, lat))) [lat, lon] = [lon, lat];
  return valid(lat, lon);
}

/** Devuelve la posición o null si el texto no se entiende. Los enlaces acortados (goo.gl) no se pueden resolver sin internet. */
export function parseLocation(input: string): LonLat | null {
  const text = input.trim();
  if (!text) return null;
  return fromLink(text) ?? fromDecimal(text) ?? fromDms(text);
}
