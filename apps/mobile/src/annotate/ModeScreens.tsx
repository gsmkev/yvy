import { Keyboard, ScrollView, View } from "react-native";
import { MONITOR_CROPS, monitorTemplate, summarizeStations, t, type MonitorCrop } from "@yvy/shared";
import { Row, s as k, Text } from "../ui/kit";
import { Stations } from "../ui/Stations";
import { T } from "../ui/theme";
import { AnnotateHeader } from "./Header";
import { Progress } from "./Progress";
import { tr } from "./common";
import type { AnnotateState } from "./useAnnotate";

/** 2b. Plaga: una observación o el monitoreo por estaciones. */
export function ModeScreen({ a }: { a: AnnotateState }) {
  const { plot, crop, setStationMode, setPhase, setValues, setCrop } = a;
  const plotCrop = plot?.crop && monitorTemplate(plot.crop) ? (plot.crop as MonitorCrop) : null;
  return (
    <View style={k.screen}>
      <AnnotateHeader a={a} />
      <ScrollView contentContainerStyle={k.pad}>
        <Text style={[T.title, { marginBottom: 16 }]}>{t("app.pest.mode")}</Text>
        <Row
          title={t("app.pest.modeOne")}
          onPress={() => {
            setStationMode(false);
            setPhase({ name: "step", i: 0 });
          }}
        />
        <Row
          title={t("app.pest.modeStations")}
          onPress={() => {
            setStationMode(true);
            setValues({});
            if (plotCrop) setCrop(plotCrop);
            setPhase(plotCrop || crop ? { name: "stations" } : { name: "stationsCrop" });
          }}
        />
      </ScrollView>
    </View>
  );
}

/** Cultivo del monitoreo por estaciones. */
export function StationsCropScreen({ a }: { a: AnnotateState }) {
  const { setCrop, setPhase } = a;
  return (
    <View style={k.screen}>
      <AnnotateHeader a={a} />
      <ScrollView contentContainerStyle={k.pad}>
        <Text style={[T.title, { marginBottom: 16 }]}>{t("app.stations.crop")}</Text>
        {MONITOR_CROPS.map((c) => (
          <Row
            key={c}
            title={tr(`app.monitor.crop_${c}`)}
            onPress={() => {
              setCrop(c);
              setPhase({ name: "stations" });
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Conteo por estaciones; al terminar se resume en los datos del registro. */
export function StationsScreen({ a, crop }: { a: AnnotateState; crop: MonitorCrop }) {
  const { stations, setStations, setValues, setPhase } = a;
  const finish = () => {
    const tpl = monitorTemplate(crop)!;
    const sum = summarizeStations(stations, tpl);
    setValues({
      pest: sum.pest,
      intensity: sum.intensity,
      ...(sum.perMeter !== undefined ? { perMeter: sum.perMeter } : {}),
      crop,
      stations,
      averages: sum.averages,
    });
    Keyboard.dismiss();
    setPhase({ name: "photo" });
  };
  return (
    <View style={k.screen}>
      <AnnotateHeader a={a} />
      <Progress i={0} n={2} />
      <Stations crop={crop} stations={stations} onChange={setStations} onDone={finish} />
    </View>
  );
}
