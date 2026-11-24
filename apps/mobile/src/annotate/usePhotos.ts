import { useEffect, useRef, useState } from "react";
import { t } from "@yvy/shared";
import type { LocalAudio, LocalPhoto } from "../db/store";
import { discardPhoto } from "../lib/photos";
import { showToast } from "../lib/toast";

/** Fotos y nota de voz del registro; las fotos que no llegan a guardarse no quedan ocupando lugar (F-17). */
export function usePhotos() {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const savedRef = useRef(false);
  useEffect(
    () => () => {
      if (!savedRef.current) photosRef.current.forEach((p) => void discardPhoto(p));
    },
    [],
  );
  const removePhoto = (i: number) => {
    const gone = photos[i];
    if (!gone) return;
    setPhotos(photos.filter((_, j) => j !== i));
    void discardPhoto(gone);
    showToast(t("app.photoDiscarded"));
  };
  const [voice, setVoice] = useState<LocalAudio | null>(null);
  return { photos, setPhotos, removePhoto, voice, setVoice, savedRef };
}
