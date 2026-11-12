import type { Messages } from "./es-PY";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/**
 * Guaraní paraguayo (U-22). Parcial a propósito: solo la navegación principal de la app y la web y la pantalla Anotar
 * (lote, qué anotar, las preguntas de lluvia, recorrida, plaga, cultivo, pasto, aguada, hacienda y nota, y la foto).
 * Todo lo que no está acá se muestra en es-PY (ver `t`). Las claves siguen el árbol de es-PY, así que el compilador
 * avisa si una no existe; los {{marcadores}} tienen que ser los mismos que en es-PY (lo controla una prueba).
 *
 * Criterio: tuteo ("nde") en imperativo corto, como se habla en el campo; las palabras que en el campo se dicen en
 * castellano (lote, GPS, aguada, potrero, señal, kámara) se dejan así. Pendiente de revisión por hablantes del campo
 * antes de publicar una versión.
 */
export const gnPY: DeepPartial<Messages> = {
  recordKinds: {
    pest: "Mymba'i vai térã mba'asy",
    crop_status: "Temitỹ reko",
    pasture_status: "Kapi'i reko",
    rain: "Ama",
    water: "Aguada",
    note: "Marandu",
    herd_count: "Mymba papapy",
    mortality: "Mymba omanóva",
    sowing: "Ñemitỹ",
    harvest: "Ñemono'õ",
  },
  app: {
    // pestañas
    today: "Ko árape",
    map: "Mapa",
    history: "Ojehaíva",
    more: "Hetave",
    language: "Ñe'ẽ",
    languageChoose: "Eiporavo ñe'ẽ",
    // Anotar: lote
    annotate: "Ehai",
    annotateAgain: "Ehai ambue mba'e",
    backToToday: "Eju jey Ko árape",
    whichPlot: "¿Mba'e lotepe reime?",
    detectedByGps: "GPS he'ise ko'ápe reime",
    changePlot: "Ha'e ambue lote",
    gpsSearching: "Ahekávo moõ reime…",
    gpsNone: "GPS'ỹ: eiporavo pe lote",
    noPlot: "Lote'ỹ",
    plotSearch: "Eheka lote",
    plotSearchNone: "Ndaipóri lote upéicha héra",
    severalPlots: "Heta lote",
    severalPlotsTitle: "¿Mba'e lotepe?",
    // Anotar: qué
    whatHappened: "¿Mba'e rehaíta?",
    next: "Tapykue",
    yes: "Heẽ",
    no: "Nahániri",
    skip: "Heja",
    optional: "Oikotevẽ'ỹ",
    addNote: "¿Oĩ ambue mba'e remombe'useva?",
    noteQuestion: "Ehai la rehecháva",
    // Anotar: preguntas
    rainQuestion: "¿Mboy ama oky?",
    rainHint: "Milímetro pluviómetro-pe ojehecháva",
    scoutQuestion: "¿Mba'éichapa rehecha pe lote?",
    pestQuestion: "¿Mba'e mymba'i vai térã mba'asy?",
    pestHowMuch: "¿Mboypa?",
    cropHow: "¿Mba'éichapa oĩ?",
    pastureQuestion: "¿Mba'eichaitépa yvate pe kapi'i?",
    pastureLivestock: "¿Oĩpa mymba pe potrerope?",
    waterQuestion: "¿Mba'éichapa oĩ pe aguada?",
    herdCountQuestion: "¿Mboy mymba oĩ?",
    // Anotar: foto y final
    addPhoto: "¿Rejapose ta'ãnga?",
    takePhoto: "Ejapo ta'ãnga",
    skipPhoto: "Eñongatu ta'ãnga'ỹre",
    allowCamera: "Eheja kámara",
    cameraDenied: "Roikotevẽ nde ñemoneĩ kámara jeporu hag̃ua",
    recordSave: "Eñongatu umi ñemoambue",
    done: "Oĩma",
    savedTitle: "Ojehai {{plot}}-pe",
    savedOffline: "Oñemondóta señal ou jey vove",
    savedOnline: "Oĩma ofisínape",
  },
  ui: {
    // navegación de la web
    navMap: "Mapa",
    navRecords: "Ojehaíva",
    navTasks: "Tembiapo",
    navCalendar: "Arapapaha",
    navAlerts: "Ñemomarandu",
    navTeam: "Aty",
    languageLabel: "Ñe'ẽ",
    cancel: "Heja",
    delete: "Emboguete",
  },
};
