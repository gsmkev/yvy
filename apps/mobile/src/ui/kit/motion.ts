/** Preferencia de movimiento reducido del sistema. */
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** `true` si la persona pidió menos movimiento: las hojas y transiciones del kit pasan a aparecer sin deslizar. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduce(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
