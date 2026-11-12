import { ACADEMY_TOPICS, ACADEMY_VIDEOS } from "../lib/academy";
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
      <section className="mt-8" aria-labelledby="help-videos">
        <h2 id="help-videos" className="font-serif text-xl font-semibold">
          {t("ui.helpVideosTitle")}
        </h2>
        <p className="mt-1 text-sm text-tinta-2">{t("ui.helpVideosIntro")}</p>
        <ul className="mt-3 divide-y divide-linea border-y border-linea">
          {ACADEMY_TOPICS.map((topic) => {
            const links = ACADEMY_VIDEOS[topic];
            return (
              <li key={topic} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="flex-1 font-medium">{tk(`ui.helpVideoTopic_${topic}`)}</span>
                {links ? (
                  (["es", "gn"] as const)
                    .filter((l) => links[l])
                    .map((l) => (
                      <a
                        key={l}
                        href={links[l]}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-accion underline-offset-4 hover:underline"
                      >
                        {tk(`ui.helpVideoLang_${l}`)}
                      </a>
                    ))
                ) : (
                  <span className="text-sm text-tinta-2">{t("ui.helpVideosSoon")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
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
