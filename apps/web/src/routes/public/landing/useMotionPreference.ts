import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const read = () => typeof window !== "undefined" && window.matchMedia(QUERY).matches;

/** ¿La persona pidió menos movimiento? Se lee de entrada (no hay render del lado del servidor) y se sigue en vivo. */
export function useMotionPreference() {
  const [reduce, setReduce] = useState(read);
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = () => setReduce(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduce;
}
