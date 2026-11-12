/** Botón de texto que abre WhatsApp (wa.me) con un resumen ya armado (K-10, K-11). */
import { whatsappUrl } from "@yvy/shared";
import { t } from "../lib/i18n";
import { Button } from "./ui";

export function ShareWhatsappButton({
  text,
  variant = "secondary",
  className,
}: {
  text: string;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
}) {
  return (
    <Button variant={variant} className={className} onClick={() => window.open(whatsappUrl(text), "_blank", "noopener")}>
      {t("ui.shareWhatsapp")}
    </Button>
  );
}
