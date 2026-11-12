import type { ExpoConfig } from "expo/config";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8787";

/**
 * P-31: actualizaciones de la app sin pasar por la tienda (EAS Update, solo el código JavaScript y los assets).
 * Opcional: sin `EAS_UPDATE_URL` quedan apagadas y la app se actualiza instalando el APK nuevo, como antes.
 * `runtimeVersion` por versión de la app: una actualización solo llega a APKs de la misma `version`, así que un
 * cambio nativo (plugin nuevo, permiso) exige subir `version` y publicar un APK nuevo. Ver docs/DEPLOY.md.
 */
export const updatesConfig = (env: Record<string, string | undefined>): ExpoConfig["updates"] =>
  env.EAS_UPDATE_URL
    ? { url: env.EAS_UPDATE_URL, enabled: true, checkAutomatically: "ON_LOAD", fallbackToCacheTimeout: 0 }
    : { enabled: false };

const config: ExpoConfig = {
  name: "Yvy",
  slug: "yvy",
  scheme: "yvy",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  backgroundColor: "#F1EEE4",
  android: {
    package: "py.com.koeti.yvy",
    versionCode: 1,
    adaptiveIcon: { foregroundImage: "./assets/icon.png", backgroundColor: "#1E2419" },
    permissions: ["CAMERA", "RECORD_AUDIO", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "POST_NOTIFICATIONS"],
    blockedPermissions: ["ACCESS_BACKGROUND_LOCATION"],
  },
  ios: { bundleIdentifier: "py.com.koeti.yvy", supportsTablet: false },
  plugins: [
    "expo-router",
    "expo-sqlite",
    "expo-secure-store",
    ["expo-splash-screen", { image: "./assets/icon.png", imageWidth: 160, backgroundColor: "#1E2419" }],
    [
      "expo-camera",
      { cameraPermission: "Yvy usa la cámara para sacar fotos del campo y escanear el código de vinculación." },
    ],
    [
      "expo-location",
      { locationWhenInUsePermission: "Yvy guarda la ubicación de cada registro para saber en qué lote está." },
    ],
    // F-09: el micrófono solo se usa cuando la persona toca "Grabar nota de voz".
    ["expo-audio", { microphonePermission: "Yvy usa el micrófono para grabar notas de voz que se guardan con el registro." }],
    ["expo-notifications", { color: "#7A9A3F" }],
    "@maplibre/maplibre-react-native",
    // Android 9+ (PRD §7)
    [
      "expo-build-properties",
      {
        android: { minSdkVersion: 28, enableProguardInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true },
      },
    ],
  ],
  runtimeVersion: { policy: "appVersion" },
  updates: updatesConfig(process.env),
  experiments: { typedRoutes: false },
  extra: { apiUrl: API_URL, eas: { projectId: process.env.EAS_PROJECT_ID } },
};

export default config;
