import { ScrollView, View } from "react-native";
import { t } from "@yvy/shared";
import { Button, Row, s as k, Text, TextInput } from "../ui/kit";
import { C, T } from "../ui/theme";
import { AnnotateHeader } from "./Header";
import { fold, plotSubtitle, SEARCH_FROM } from "./common";
import { st } from "./styles";
import type { AnnotateState } from "./useAnnotate";

/** 1. Lote: los candidatos por GPS primero, el resto de la lista debajo. */
export function PlotScreen({ a }: { a: AnnotateState }) {
  const { plots, guesses, fix, query, setQuery, gpsHint, kind, entryFor, setPlot, setMulti, setPhase } = a;
  const sure = guesses.filter((g) => g.confidence === "sure");
  const near = guesses.filter((g) => g.confidence === "near");
  const showAll = guesses.length === 0 && fix !== "searching";
  const searching = plots.length > SEARCH_FROM && query.trim() !== "";
  const needle = fold(query);
  return (
    <View style={k.screen}>
      <AnnotateHeader a={a} />
      <ScrollView contentContainerStyle={k.pad} keyboardShouldPersistTaps="handled">
        <Text style={T.title}>{t("app.common.whichPlot")}</Text>
        <Text style={[T.small, { marginTop: 6, marginBottom: fix === "searching" && gpsHint ? 6 : 20 }]}>
          {fix === "searching" ? t("app.gps.searching") : guesses.length ? t("app.common.detectedByGps") : fix ? t("app.no.plotNearby") : t("app.gps.none")}
        </Text>
        {fix === "searching" && gpsHint && <Text style={[T.small, { marginBottom: 20 }]}>{gpsHint}</Text>}
        {plots.length > SEARCH_FROM && (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("app.plot.search")}
            placeholderTextColor={C.tinta3}
            accessibilityLabel={t("app.plot.search")}
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
            style={st.search}
          />
        )}
        {!searching && [...sure, ...near].map((g) => (
          <Row
            key={g.plot.id}
            title={g.plot.name}
            subtitle={g.confidence === "near" ? t("app.common.nearBorder") : plotSubtitle(g.plot)}
            onPress={() => {
              setPlot(g.plot);
              setMulti([]);
              setPhase(kind ? entryFor(kind) : { name: "kind" });
            }}
          />
        ))}
        {guesses.length > 0 && !searching && (
          <Text style={[T.smallMedium, { marginTop: 24, marginBottom: 8 }]}>{t("app.common.changePlot")}</Text>
        )}
        {(showAll || guesses.length > 0 || searching) &&
          plots
            .filter((p) => (searching ? fold(p.name).includes(needle) : !guesses.some((g) => g.plot.id === p.id)))
            .map((p) => (
              <Row
                key={p.id}
                title={p.name}
                subtitle={plotSubtitle(p)}
                onPress={() => {
                  setPlot(p);
                  setMulti([]);
                  setPhase(kind ? entryFor(kind) : { name: "kind" });
                }}
              />
            ))}
        {searching && !plots.some((p) => fold(p.name).includes(needle)) && <Text style={[T.small, { marginTop: 8 }]}>{t("app.plot.searchNone")}</Text>}
        <View style={{ height: 12 }} />
        {plots.length > 1 && <Button kind="text" title={t("app.several.plots")} onPress={() => setPhase({ name: "multi" })} />}
        <Button
          kind="text"
          title={t("app.no.plot")}
          onPress={() => {
            setPlot(null);
            setMulti([]);
            setPhase(kind ? entryFor(kind) : { name: "kind" });
          }}
        />
      </ScrollView>
    </View>
  );
}
