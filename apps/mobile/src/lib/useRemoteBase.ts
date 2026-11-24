import { useEffect, useState } from "react";
import { tilesBaseUrl } from "./offline";

/** Base de los mosaicos en línea (null mientras carga o si no hay). */
export function useRemoteBase(): string | null {
  const [remoteBase, setRemoteBase] = useState<string | null>(null);
  useEffect(() => {
    tilesBaseUrl().then(setRemoteBase, () => setRemoteBase(null));
  }, []);
  return remoteBase;
}
