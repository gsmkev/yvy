/**
 * F-11: atajo estático de Android ("app shortcut") que se ve al mantener apretado el ícono de la app.
 * Parte pura del config plugin (sin dependencias) para poder probarla sin compilar la app.
 */

/** Nombre del recurso de texto de cada atajo. */
const rainKeys = { short: "yvy_shortcut_rain_short", long: "yvy_shortcut_rain_long" };

/** Enlace que abre la anotación de lluvia de la estancia: lo resuelve Expo Router con el esquema `yvy`. */
const RAIN_URI = "yvy://annotate?kind=rain&farmLevel=1";

/** res/xml/shortcuts.xml con un atajo: anotar lluvia. */
function shortcutsXml({ packageName, className }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="rain"
    android:enabled="true"
    android:shortcutShortLabel="@string/${rainKeys.short}"
    android:shortcutLongLabel="@string/${rainKeys.long}">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="${RAIN_URI.replace(/&/g, "&amp;")}"
      android:targetPackage="${packageName}"
      android:targetClass="${className}" />
  </shortcut>
</shortcuts>
`;
}

module.exports = { shortcutsXml, rainKeys, RAIN_URI };
