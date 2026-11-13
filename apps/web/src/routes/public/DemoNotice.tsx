import { Link } from "@tanstack/react-router";
import { getSession, post, setSession } from "../../lib/api";
import { t } from "../../lib/i18n";
import { useMe } from "../../lib/queries";

/** Franja fina al pie (ocupa su lugar: no tapa la navegación) mientras se mira la demo de solo lectura. */
export function DemoNotice() {
  const me = useMe();
  const demo = (me.data as { demo?: boolean } | undefined)?.demo === true;
  if (!demo) return null;
  const leave = async () => {
    const s = getSession();
    if (s) await post("/auth/logout", { refreshToken: s.refreshToken }).catch(() => {});
    setSession(null);
  };
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 border-t border-linea bg-surco px-4 py-2 text-sm text-lino"
    >
      <span>{t("ui.publicDemoNotice")}</span>
      <Link
        to="/ingresar"
        search={{ modo: "registro" }}
        onClick={leave}
        className="font-medium text-lino underline underline-offset-4"
      >
        {t("ui.publicDemoCreate")}
      </Link>
    </div>
  );
}
