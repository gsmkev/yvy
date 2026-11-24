import { ACADEMY_TOPICS, ACADEMY_VIDEOS } from "../lib/academy";
import { whatsappUrl } from "../lib/config";
import { PageHeader, Page } from "../components/ui";
import { t, tk } from "../lib/i18n";

const N = 10;

/** Centro de ayuda: preguntas frecuentes y contacto por WhatsApp. */
export function HelpPage() {
  return (
    <Page width="read" className="gap-8">
      <PageHeader
        title={t("ui.help.title")}
        primary={
          <a
            href={whatsappUrl(t("ui.public.whatsappText"))}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-md border border-accion bg-accion px-3.5 text-sm font-medium text-sobre transition-colors hover:bg-accion-2"
          >
            {t("ui.help.whatsapp")}
          </a>
        }
      />
      <div className="divide-y divide-linea border-y border-linea">
        {Array.from({ length: N }, (_, i) => i + 1).map((n) => (
          <details key={n} className="group py-1">
            <summary className="flex min-h-10 cursor-pointer items-center font-medium marker:content-none hover:text-accion">
              {tk(`ui.help.q${n}`)}
            </summary>
            <p className="mt-2 text-body text-tinta-2">{tk(`ui.help.a${n}`)}</p>
          </details>
        ))}
      </div>
      <section aria-labelledby="help-videos">
        <h2 id="help-videos" className="text-section leading-6 font-semibold">
          {t("ui.help.videosTitle")}
        </h2>
        <ul className="mt-3 divide-y divide-linea border-y border-linea">
          {ACADEMY_TOPICS.map((topic) => {
            const links = ACADEMY_VIDEOS[topic];
            return (
              <li key={topic} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="flex-1 font-medium">{tk(`ui.help.videoTopic_${topic}`)}</span>
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
                        {tk(`ui.help.videoLang_${l}`)}
                      </a>
                    ))
                ) : (
                  <span className="text-sm text-tinta-2">{t("ui.help.videosSoon")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </Page>
  );
}
