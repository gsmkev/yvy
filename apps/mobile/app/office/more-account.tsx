/**
 * Plan, calendario y ayuda: uso y pedido de cambio de plan (dueño), enlace de
 * calendario iCal, código de referido, ayuda (preguntas, WhatsApp, videos en la web) y términos y privacidad (abren la web).
 * API: GET /org/plan, POST y DELETE /org/plan-request, GET/POST/DELETE /me/calendar-feed, GET /me/referral.
 */
import { useState } from "react";
import { Linking, View } from "react-native";
import { CalendarDays, FileText, MessageCircle, PlayCircle, ShieldCheck } from "lucide-react-native";
import { BILLINGS, isFieldRole, LIMITS, priceFor, t, usdToGs, type Billing, type MessageKey } from "@yvy/shared";
import { copyText } from "../../src/lib/copy";
import { API_URL, getSession } from "../../src/lib/session";
import { showToast } from "../../src/lib/toast";
import { NoSignalNote, useNoSignalReason } from "../../src/office/erpCommon";
import { fmtDate, fmtDateTime, fmtNumber, parseDecimal } from "../../src/office/format";
import { OfficeScreen } from "../../src/office/OfficeScreen";
import { fmtGs } from "../../src/office/money";
import { FormSheet, KeyValue, Segmented, StatRow, TextField } from "../../src/office/ui";
import { useOnline } from "../../src/office/useOnline";
import { useOnlineMutation } from "../../src/office/useOnlineMutation";
import { Button, Row, SectionHeader, Text } from "../../src/ui/kit";
import { C, T } from "../../src/ui/theme";
import type { PlanRequestRow as PlanRequest, PlanView } from "@yvy/shared";

/** Mismo número provisorio que la web (apps/web/src/lib/config.ts): hay que reemplazarlo por el real de Yvy. */
const SUPPORT_WHATSAPP = "595000000000"; // provisorio: falta el número real y la app no lo lee de una variable de entorno
const key = (k: string) => k as MessageKey;

interface FeedStatus {
  active: boolean;
  createdAt: number | null;
  lastUsedAt: number | null;
}
interface Referral {
  code: string | null;
  referred: number;
  credited: number;
}

const cap = (n: number | null) => (n === null ? t("ui.plan.noCap") : fmtNumber(n, 0));
const openWeb = (path: string) => void Linking.openURL(`${API_URL}${path}`).catch(() => showToast(t("office.more.openFail")));

/** Cuenta de la organización: plan, estado del servicio y precio según las hectáreas. */
export default function MoreAccount() {
  const role = getSession()?.organization.role ?? "";
  const owner = role === "owner";
  const field = isFieldRole(role);
  return (
    <OfficeScreen title={t("office.more.accountTitle")}>
      {owner ? <PlanSection /> : null}
      <CalendarSection />
      {!field ? <ReferralSection /> : null}
      <HelpSection />
    </OfficeScreen>
  );
}

function PlanSection() {
  const q = useOnline<PlanView>("/org/plan", { cache: false });
  const [asking, setAsking] = useState(false);
  const [billing, setBilling] = useState<Billing>("annual");
  const cancel = useOnlineMutation<void, unknown>("DELETE", "/org/plan-request", { invalidate: ["/org/plan"] });
  const p = q.data;
  const requested = (r: PlanRequest) => [t(key(`ui.plan.name_${r.plan}`)), r.maxHa ? t("ui.plan.upToHa", { n: fmtNumber(r.maxHa, 0) }) : null, r.maxUsers ? t("ui.plan.upToUsers", { n: fmtNumber(r.maxUsers, 0) }) : null].filter(Boolean).join(" · ");
  const over = (used: number, max: number | null) => max !== null && used >= max;
  const noSignal = useNoSignalReason();
  return (
    <>
      <SectionHeader title={t("ui.plan.title")} first />
      {!p ? (
        <Text style={T.small}>{q.error ?? t("ui.common.loading")}</Text>
      ) : (
        <>
          <Text style={T.bodyMedium}>
            {t(key(`ui.plan.name_${p.plan}`)) +
              (p.plan === "trial" && p.trialEndsAt
                ? " · " + t("ui.common.trialEnds", { date: fmtDate(p.trialEndsAt) })
                : "")}
          </Text>
          <StatRow
            items={[
              {
                label: t("ui.plan.hectares") + " " + t("office.plan.of", { n: cap(p.limits.maxHa) }),
                value: fmtNumber(p.usage.ha, 0),
                tone: over(p.usage.ha, p.limits.maxHa) ? "danger" : undefined,
              },
              {
                label: t("ui.plan.people") + " " + t("office.plan.of", { n: cap(p.limits.maxUsers) }),
                value: fmtNumber(p.usage.users, 0),
                tone: over(p.usage.users, p.limits.maxUsers) ? "danger" : undefined,
              },
            ]}
          />
          <PriceSection billing={billing} onBilling={setBilling} />
          {p.pending ? (
            <View style={{ marginTop: 16, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: C.trigo }}>
              <Text style={T.bodyMedium}>{t("ui.plan.pending", { date: fmtDate(p.pending.createdAt) })}</Text>
              <Text style={T.small}>{requested(p.pending)}</Text>
              {p.pending.note ? <Text style={T.small}>{`“${p.pending.note}”`}</Text> : null}
              <Button kind="text" title={t("ui.plan.cancelRequest")} loading={cancel.pending} onPress={() => void cancel.mutate().then((r) => r.ok && (showToast(t("ui.plan.requestCancelled")), void q.refresh()))} style={{ alignSelf: "flex-start" }} />
              {cancel.error ? <Text accessibilityRole="alert" style={[T.smallMedium, { color: C.peligro }]}>{cancel.error}</Text> : null}
            </View>
          ) : (
            <>
              {p.lastResolved ? (
                <Text style={[T.small, { marginTop: 12 }]}>
                  {t(p.lastResolved.status === "approved" ? "ui.plan.lastApproved" : "ui.plan.lastRejected", {
                    what: requested(p.lastResolved),
                  }) + (p.lastResolved.resolutionNote ? " " + p.lastResolved.resolutionNote : "")}
                </Text>
              ) : null}
              <Button
                kind="secondary"
                title={t("ui.plan.ask")}
                onPress={() => setAsking(true)}
                disabled={!!noSignal}
                style={{ marginTop: 16 }}
              />
              <NoSignalNote />
            </>
          )}
          {asking ? <AskSheet billing={billing} intro={t("ui.plan.askIntro", { ha: cap(p.plans.active.maxHa), users: cap(p.plans.active.maxUsers) })} onClose={() => setAsking(false)} onSent={() => void q.refresh()} /> : null}
        </>
      )}
    </>
  );
}

const usd = (n: number) => `US$ ${fmtNumber(n, 0)}`;

/** El precio por año y por cuota con las hectáreas reales (tablero) y una calculadora. Informativo: el cobro es manual. */
function PriceSection({ billing, onBilling }: { billing: Billing; onBilling: (b: Billing) => void }) {
  const dash = useOnline<{ areaByCrop: { kind: "crop" | "pasture"; ha: number }[] }>("/org/dashboard", { cache: false });
  const rates = useOnline<{ date: string; usdToPyg: number }[]>("/org/erp/exchange-rates", { cache: false });
  const rate = rates.data?.[0]?.usdToPyg ?? LIMITS.pricing.usdToPyg;
  const [calc, setCalc] = useState({ crops: "", cattle: "" });
  const sum = (kind: "crop" | "pasture") => Math.round((dash.data?.areaByCrop ?? []).filter((a) => a.kind === kind).reduce((n, a) => n + a.ha, 0));
  const crops = sum("crop");
  const cattle = sum("pasture");
  const quote = (c: number, g: number) => {
    const q = priceFor(c, g, billing);
    return [
      { label: t("ui.plan.priceYear"), value: fmtGs(usdToGs(q.year, rate)) },
      { label: `${t("ui.plan.priceInstallment")} · ${t(key(`ui.plan.priceInstallments_${billing}`))}`, value: fmtGs(usdToGs(q.perInstallment, rate)) },
      { label: "US$", value: `${usd(q.year)} · ${usd(q.perInstallment)}` },
      { label: t("ui.plan.pricePerHa", { n: fmtNumber(q.perHa, 2) }), value: q.minApplied ? t("ui.plan.priceMin") : "" },
    ];
  };
  return (
    <>
      <SectionHeader title={t("ui.plan.priceTitle")} />
      <Text style={T.small}>{t("ui.plan.priceIntro")}</Text>
      <Text style={[T.smallMedium, { marginTop: 12, marginBottom: 6 }]}>{t("ui.plan.billing")}</Text>
      <Segmented options={BILLINGS.map((b) => ({ value: b, label: t(key(`ui.plan.billing_${b}`)) }))} value={billing} onChange={onBilling} />
      {billing === "annual" ? <Text style={[T.small, { marginTop: 6 }]}>{t("ui.plan.billingGift")}</Text> : null}
      {dash.data ? (
        <>
          <Text style={[T.small, { marginTop: 12 }]}>{t("ui.plan.priceYours", { crops: fmtNumber(crops, 0), cattle: fmtNumber(cattle, 0) })}</Text>
          <KeyValue rows={quote(crops, cattle)} />
        </>
      ) : null}
      <Text style={[T.smallMedium, { marginTop: 16 }]}>{t("ui.plan.calcTitle")}</Text>
      <TextField label={t("ui.plan.calcCrops")} value={calc.crops} onChangeText={(v) => setCalc({ ...calc, crops: v })} kind="decimal" />
      <TextField label={t("ui.plan.calcCattle")} value={calc.cattle} onChangeText={(v) => setCalc({ ...calc, cattle: v })} kind="decimal" />
      <KeyValue rows={quote(Math.max(0, parseDecimal(calc.crops) ?? 0), Math.max(0, parseDecimal(calc.cattle) ?? 0))} />
      <Text style={[T.small, { marginTop: 8 }]}>{t("ui.plan.priceNote", { rate: fmtNumber(rate, 0) })}</Text>
    </>
  );
}

function AskSheet({ billing, intro, onClose, onSent }: { billing: Billing; intro: string; onClose: () => void; onSent: () => void }) {
  const [f, setF] = useState({ ha: "", users: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const send = useOnlineMutation<Record<string, unknown>, unknown>("POST", "/org/plan-request", { invalidate: ["/org/plan"] });
  const submit = async () => {
    const ha = f.ha.trim() ? parseDecimal(f.ha) : null;
    const users = f.users.trim() ? parseDecimal(f.users) : null;
    if ((f.ha.trim() && (ha === null || ha <= 0)) || (f.users.trim() && (users === null || users <= 0 || !Number.isInteger(users)))) return setError(t("office.plan.badNumbers"));
    setError(null);
    const r = await send.mutate({ plan: "active", maxHa: ha, maxUsers: users, note: f.note.trim() || null, billing });
    if (r.ok) {
      showToast(t("ui.plan.requestSent"));
      onSent();
      onClose();
    }
  };
  return (
    <FormSheet visible title={t("ui.plan.ask")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.plan.askSend")} pending={send.pending} error={error ?? send.error}>
      <Text style={[T.small, { marginTop: 4 }]}>{intro}</Text>
      <TextField label={t("ui.plan.askHa")} hint={t("ui.plan.askOptional")} value={f.ha} onChangeText={(v) => setF({ ...f, ha: v })} kind="decimal" />
      <TextField label={t("ui.plan.askUsers")} hint={t("ui.plan.askOptional")} value={f.users} onChangeText={(v) => setF({ ...f, users: v })} kind="number" />
      <TextField label={t("ui.plan.askNote")} hint={t("ui.plan.askOptional")} value={f.note} onChangeText={(v) => setF({ ...f, note: v })} maxLength={LIMITS.planRequest.noteLength} />
      <Text style={[T.small, { marginTop: 12 }]}>{t("ui.plan.askNoCharge")}</Text>
    </FormSheet>
  );
}

function CalendarSection() {
  const q = useOnline<FeedStatus>("/me/calendar-feed", { cache: false });
  const [url, setUrl] = useState<string | null>(null);
  const create = useOnlineMutation<void, { url: string }>("POST", "/me/calendar-feed", { invalidate: ["/me/calendar-feed"] });
  const revoke = useOnlineMutation<void, unknown>("DELETE", "/me/calendar-feed", { invalidate: ["/me/calendar-feed"] });
  const noSignal = useNoSignalReason();
  const s = q.data;
  return (
    <>
      <SectionHeader title={t("ui.calendar.feedTitle")} />
      <Text style={T.small}>{t("ui.calendar.feedIntro")}</Text>
      {url ? (
        <View style={{ marginTop: 12, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: C.trigo }}>
          <Text style={T.bodyMedium}>{t("ui.calendar.feedNew")}</Text>
          <Text style={T.small}>{t("ui.calendar.feedNewText")}</Text>
          <Text selectable style={[T.small, { marginTop: 8, color: C.tinta }]}>{url}</Text>
          <Button kind="secondary" title={t("ui.calendar.feedCopy")} onPress={() => void copyText(url).then((ok) => ok && showToast(t("ui.common.copied")))} style={{ marginTop: 12 }} />
          <Text style={[T.small, { marginTop: 12 }]}>{t("ui.calendar.feedGoogle")}</Text>
          <Text style={T.small}>{t("ui.calendar.feedOutlook")}</Text>
        </View>
      ) : null}
      {s ? (
        <>
          <Text style={[T.body, { marginTop: 12 }]}>
            {(
              (s.active && s.createdAt
                ? t("ui.calendar.feedActive", { date: fmtDateTime(s.createdAt) })
                : t("ui.calendar.feedNone")) +
              " " +
              (s.active
                ? s.lastUsedAt
                  ? t("ui.calendar.feedUsed", { date: fmtDateTime(s.lastUsedAt) })
                  : t("ui.calendar.feedNeverUsed")
                : "")
            ).trim()}
          </Text>
          <Button
            kind={s.active ? "secondary" : "primary"}
            icon={CalendarDays}
            title={t(s.active ? "ui.calendar.feedRegen" : "ui.calendar.feedCreate")}
            loading={create.pending}
            disabled={!!noSignal}
            onPress={() => void create.mutate().then((r) => r.ok && setUrl(r.data.url))}
            style={{ marginTop: 12 }}
          />
          {s.active ? <Button kind="danger" title={t("ui.calendar.feedRevoke")} loading={revoke.pending} disabled={!!noSignal} onPress={() => void revoke.mutate().then((r) => r.ok && setUrl(null))} style={{ marginTop: 8 }} /> : null}
          <NoSignalNote />
        </>
      ) : (
        <Text style={[T.small, { marginTop: 12 }]}>{q.error ?? t("ui.common.loading")}</Text>
      )}
      {[create.error, revoke.error].map((e, i) => (e ? <Text key={i} accessibilityRole="alert" style={[T.smallMedium, { color: C.peligro, marginTop: 8 }]}>{e}</Text> : null))}
    </>
  );
}

function ReferralSection() {
  const q = useOnline<Referral>("/me/referral", { cache: false });
  const role = getSession()?.organization.role;
  const code = q.data?.code;
  if (!code) return null;
  const link = `${API_URL}/ingresar?modo=registro&ref=${code}`;
  const producer = role === "owner";
  return (
    <>
      <SectionHeader title={t(producer ? "ui.account.referralTitleProducer" : "ui.account.referralTitle")} />
      <Text style={T.small}>{t(producer ? "ui.account.referralTextProducer" : "ui.account.referralText")}</Text>
      <KeyValue rows={[{ label: t("ui.account.referralCode"), value: code }, ...(q.data!.referred > 0 ? [{ label: t("office.more.referred"), value: t("ui.account.referralCount", { n: q.data!.referred, c: q.data!.credited }) }] : [])]} />
      <Text selectable style={[T.small, { marginTop: 12 }]}>{link}</Text>
      <Button kind="secondary" title={t("ui.account.referralCopy")} onPress={() => void copyText(link).then((ok) => ok && showToast(t("ui.common.copied")))} style={{ marginTop: 12 }} />
    </>
  );
}

function HelpSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <SectionHeader title={t("ui.help.title")} />
      <Row icon={MessageCircle} title={t("ui.help.whatsapp")} onPress={() => void Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(t("ui.public.whatsappText"))}`).catch(() => showToast(t("office.more.openFail")))} />
      <Row icon={PlayCircle} title={t("ui.help.videosTitle")} subtitle={t("office.more.opensWeb")} onPress={() => openWeb("/ayuda")} />
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <View key={n}>
          <Row title={t(key(`ui.help.q${n}`))} onPress={() => setOpen(open === n ? null : n)} chevron={false} />
          {open === n ? <Text style={[T.body, { paddingBottom: 12 }]}>{t(key(`ui.help.a${n}`))}</Text> : null}
        </View>
      ))}
      <Row icon={FileText} title={t("office.more.terms")} subtitle={t("office.more.opensWeb")} onPress={() => openWeb("/terminos")} />
      <Row icon={ShieldCheck} title={t("office.more.privacy")} subtitle={t("office.more.opensWeb")} onPress={() => openWeb("/privacidad")} />
    </>
  );
}
