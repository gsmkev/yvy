/** Textos en español de Paraguay con voseo. Dejar listo para guaraní (gn-PY). */
export const esPY = {
  sync: {
    offline: "SIN SEÑAL · {{count}} PENDIENTES",
    syncing: "SINCRONIZANDO…",
    synced: "SINCRONIZADO · {{time}}",
    syncNow: "Sincronizar ahora",
    rejected: "No se pudo guardar en el servidor: {{reason}}",
  },
  auth: {
    emailLabel: "Tu email",
    sendCode: "Mandame el código",
    codeLabel: "Código de 6 dígitos",
    codeSent: "Te mandamos un código a {{email}}. Vence en 10 minutos.",
    scanQr: "Escaneá el código QR que te dio el administrador",
    emailSubject: "Tu código de ingreso a Yvy: {{code}}",
    emailBody: "Tu código es {{code}}. Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.",
  },
  recordKinds: {
    scouting: "Recorrida",
    pest: "Plaga o enfermedad",
    crop_status: "Estado del cultivo",
    pasture_status: "Estado del pasto",
    rain: "Lluvia",
    water: "Aguada / tajamar",
    note: "Nota",
  },
  rejectReasons: {
    not_found: "el dato no existe",
    forbidden: "no tenés permiso",
    invalid: "datos inválidos",
    edit_window_expired: "pasaron más de 24 h y ya no se puede editar",
    too_many_attachments: "máximo {{max}} fotos por registro",
    deleted: "el registro fue borrado",
  },
  attribution: {
    metNorway: "Datos de MET Norway",
    copernicus: "Contiene datos modificados de Copernicus Sentinel",
    chirps: "CHIRPS (UCSB Climate Hazards Center)",
    nasaPower: "NASA POWER",
    firms: "NASA FIRMS",
  },
} as const;

export type Messages = typeof esPY;
