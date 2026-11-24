/**
 * Anotar: lote → qué → una pregunta por pantalla → foto → resultado.
 * Pensado para usarse con una mano, al sol, sin señal. Nunca más de un dato por pantalla.
 * El estado del flujo vive en src/annotate/useAnnotate; cada pantalla es un componente de src/annotate/.
 */
import { Done } from "../../src/annotate/Done";
import { KindScreen } from "../../src/annotate/KindScreen";
import { ModeScreen, StationsCropScreen, StationsScreen } from "../../src/annotate/ModeScreens";
import { MultiScreen } from "../../src/annotate/MultiScreen";
import { PhotoCamera } from "../../src/annotate/PhotoCamera";
import { PhotoScreen } from "../../src/annotate/PhotoScreen";
import { PlotScreen } from "../../src/annotate/PlotScreen";
import { StepsScreen } from "../../src/annotate/StepsScreen";
import { useAnnotate } from "../../src/annotate/useAnnotate";
import { withWriteAccess } from "../../src/ui/ReadOnlyGate";

function Annotate() {
  const a = useAnnotate();
  const { phase, crop } = a;
  if (a.camera) {
    return (
      <PhotoCamera
        onDone={(p) => {
          if (p) a.setPhotos((ps) => [...ps, p]);
          a.setCamera(false);
        }}
      />
    );
  }
  if (phase.name === "plot") return <PlotScreen a={a} />;
  if (phase.name === "multi") return <MultiScreen a={a} />;
  if (phase.name === "kind") return <KindScreen a={a} />;
  if (phase.name === "mode") return <ModeScreen a={a} />;
  if (phase.name === "stationsCrop") return <StationsCropScreen a={a} />;
  if (phase.name === "stations" && crop) return <StationsScreen a={a} crop={crop} />;
  if (phase.name === "step") return <StepsScreen a={a} i={phase.i} />;
  if (phase.name === "photo") return <PhotoScreen a={a} />;
  return <Done plot={a.plot} kind={a.kind!} values={a.values} />;
}

/** F-29: en solo lectura esta pantalla no se abre. */
export default withWriteAccess(Annotate);
