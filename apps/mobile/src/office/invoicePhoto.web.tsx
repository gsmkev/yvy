/** Vista web: no hay cámara en el escritorio, así que se elige un archivo de imagen. */
import { useRef } from "react";
import { Camera } from "lucide-react-native";
import { Button } from "../ui/kit";

/** Foto elegida: URI y medidas. */
export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Indica si hay cámara; en la web se elige un archivo. */
export const HAS_CAMERA = false;

/** Botón para elegir la foto de una factura desde un archivo. */
export function InvoicePhotoButton({ title, onPick, disabled, loading }: { title: string; onPick: (p: PickedPhoto) => void; disabled?: boolean; loading?: boolean }) {
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <Button kind="secondary" icon={Camera} title={title} onPress={() => input.current?.click()} disabled={disabled} loading={loading} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        data-testid="invoice-file"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const uri = URL.createObjectURL(f);
          const img = new Image();
          img.onload = () => onPick({ uri, width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => onPick({ uri, width: 0, height: 0 });
          img.src = uri;
        }}
      />
    </>
  );
}
