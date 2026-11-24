/** Diccionario parcial en guaraní; lo no traducido cae a es-PY. */

import type { Messages } from "./es-PY";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/**
 * Guaraní paraguayo. Parcial a propósito: solo la navegación principal de la app y la web y la pantalla Anotar
 * (lote, qué anotar, las preguntas de lluvia, recorrida, plaga, cultivo, pasto, aguada, hacienda y nota, y la foto).
 * Todo lo que no está acá se muestra en es-PY (ver `t`). Las claves siguen el árbol de es-PY, así que el compilador
 * avisa si una no existe; los {{marcadores}} tienen que ser los mismos que en es-PY (lo controla una prueba).
 *
 * Criterio: tuteo ("nde") en imperativo corto, como se habla en el campo; las palabras que en el campo se dicen en
 * castellano (lote, GPS, aguada, potrero, señal, kámara) se dejan así. Pendiente de revisión por hablantes del campo
 * antes de publicar una versión.
 */
export const gnPY: DeepPartial<Messages> = {
  "record-kinds": {
    kind: {
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
  },
  app: {
    common: {
      today: "Ko árape",
      map: "Mapa",
      history: "Ojehaíva",
      more: "Hetave",
      language: "Ñe'ẽ",
      languageChoose: "Eiporavo ñe'ẽ",
      annotate: "Ehai",
      backToToday: "Eju jey Ko árape",
      whichPlot: "¿Mba'e lotepe reime?",
      detectedByGps: "GPS he'ise ko'ápe reime",
      changePlot: "Ha'e ambue lote",
      whatHappened: "¿Mba'e rehaíta?",
      next: "Tapykue",
      yes: "Heẽ",
      no: "Nahániri",
      skip: "Heja",
      optional: "Oikotevẽ'ỹ",
      noteQuestion: "Ehai la rehecháva",
      scoutQuestion: "¿Mba'éichapa rehecha pe lote?",
      takePhoto: "Ejapo ta'ãnga",
      skipPhoto: "Eñongatu ta'ãnga'ỹre",
      allowCamera: "Eheja kámara",
      cameraDenied: "Roikotevẽ nde ñemoneĩ kámara jeporu hag̃ua",
      done: "Oĩma",
    },
    annotate: {
      again: "Ehai ambue mba'e",
    },
    gps: {
      searching: "Ahekávo moõ reime…",
      none: "GPS'ỹ: eiporavo pe lote",
    },
    no: {
      plot: "Lote'ỹ",
    },
    plot: {
      search: "Eheka lote",
      searchNone: "Ndaipóri lote upéicha héra",
    },
    several: {
      plots: "Heta lote",
      plotsTitle: "¿Mba'e lotepe?",
    },
    add: {
      note: "¿Oĩ ambue mba'e remombe'useva?",
      photo: "¿Rejapose ta'ãnga?",
    },
    rain: {
      question: "¿Mboy ama oky?",
      hint: "Milímetro pluviómetro-pe ojehecháva",
    },
    pest: {
      question: "¿Mba'e mymba'i vai térã mba'asy?",
      howMuch: "¿Mboypa?",
    },
    crop: {
      how: "¿Mba'éichapa oĩ?",
    },
    pasture: {
      question: "¿Mba'eichaitépa yvate pe kapi'i?",
      livestock: "¿Oĩpa mymba pe potrerope?",
    },
    water: {
      question: "¿Mba'éichapa oĩ pe aguada?",
    },
    herd: {
      countQuestion: "¿Mboy mymba oĩ?",
    },
    record: {
      save: "Eñongatu umi ñemoambue",
    },
    saved: {
      title: "Ojehai {{plot}}-pe",
      offline: "Oñemondóta señal ou jey vove",
      online: "Oĩma ofisínape",
    },
  },
  ui: {
    nav: {
      map: "Mapa",
      records: "Ojehaíva",
      tasks: "Tembiapo",
      calendar: "Arapapaha",
      alerts: "Ñemomarandu",
      team: "Aty",
    },
    common: {
      languageLabel: "Ñe'ẽ",
      cancel: "Heja",
      delete: "Emboguete",
    },
  },
};
