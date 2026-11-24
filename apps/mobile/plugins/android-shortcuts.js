/**
 * Config plugin: agrega el atajo "Anotar lluvia" al ícono de la app en Android.
 * Props: { rainShort, rainLong } con los textos en es-PY (salen de i18n en app.config.ts).
 * Solo toca el proyecto nativo que Expo genera en `prebuild`; no agrega ningún módulo nativo.
 */
const fs = require("fs");
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require("expo/config-plugins");
const path = require("path");
const { shortcutsXml, rainKeys } = require("./shortcuts-xml");

const MAIN_ACTIVITY = ".MainActivity";

module.exports = function withAndroidShortcuts(config, props) {
  const { rainShort, rainLong } = props;

  config = withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      [
        { $: { name: rainKeys.short }, _: rainShort },
        { $: { name: rainKeys.long }, _: rainLong },
      ],
      c.modResults,
    );
    return c;
  });

  config = withDangerousMod(config, [
    "android",
    (c) => {
      // nosemgrep: path-join-resolve-traversal -- platformProjectRoot lo calcula Expo en prebuild; no viene de una entrada externa
      const file = path.join(c.modRequest.platformProjectRoot, "app/src/main/res/xml/shortcuts.xml");
      const packageName = c.android?.package ?? "";
      // nosemgrep: detect-non-literal-fs-filename -- la ruta es la del proyecto nativo que genera `expo prebuild`
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // nosemgrep: detect-non-literal-fs-filename -- la ruta es la del proyecto nativo que genera `expo prebuild`
      fs.writeFileSync(file, shortcutsXml({ packageName, className: `${packageName}${MAIN_ACTIVITY}` }));
      return c;
    },
  ]);

  config = withAndroidManifest(config, (c) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    const meta = (activity["meta-data"] ??= []);
    if (!meta.some((m) => m.$["android:name"] === "android.app.shortcuts")) {
      meta.push({ $: { "android:name": "android.app.shortcuts", "android:resource": "@xml/shortcuts" } });
    }
    return c;
  });

  return config;
};
