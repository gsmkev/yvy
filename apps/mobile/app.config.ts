import type { ExpoConfig } from "expo/config";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8787";

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
  experiments: { typedRoutes: false },
  extra: { apiUrl: API_URL, eas: { projectId: process.env.EAS_PROJECT_ID } },
};

export default config;
