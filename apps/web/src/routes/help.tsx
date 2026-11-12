import { whatsappUrl } from "../lib/config";
import { t, tk } from "../lib/i18n";

const N = 10;

/** Centro de ayuda: preguntas frecuentes y contacto por WhatsApp. */
export function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-[28px] leading-tight">{t("ui.helpTitle")}</h1>
      <p className="mt-1 text-sm text-tinta-2">{t("ui.helpIntro")}</p>
      <div className="mt-6 divide-y divide-linea border-y border-linea">
        {Array.from({ length: N }, (_, i) => i + 1).map((n) => (
          <details key={n} className="group py-3.5">
            <summary className="cursor-pointer font-medium marker:content-none hover:text-accion">
              {tk(`ui.helpQ${n}`)}
            </summary>
            <p className="mt-2 text-[15px] text-tinta-2">{tk(`ui.helpA${n}`)}</p>
          </details>
        ))}
      </div>
      <div className="mt-6">
        <p className="text-sm text-tinta-2">{t("ui.helpWhatsappHint")}</p>
        <a
          href={whatsappUrl(t("ui.publicWhatsappText"))}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block font-medium text-accion underline-offset-4 hover:underline"
        >
          {t("ui.helpWhatsapp")}
        </a>
      </div>
    </div>
  );
}
