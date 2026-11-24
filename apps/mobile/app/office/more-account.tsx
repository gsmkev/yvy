/**
 * Plan, calendario y ayuda (funciones 14, 10, 11, 16 y 142): uso y pedido de cambio de plan (dueño), enlace de
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

/** Mismo número provisorio que la web (apps/web/src/lib/config.ts): hay que reemplazarlo por el real de Yvy. */
const SUPPORT_WHATSAPP = "595000000000"; // TODO número real
const key = (k: string) => k as MessageKey;

interface PlanRequest {
  id: string;
  plan: string;
  maxHa: number | null;
  maxUsers: number | null;
  note: string | null;
  status: string;
  createdAt: number;
  resolutionNote: string | null;
}
interface PlanView {
  plan: string;
  trialEndsAt: number | null;
  limits: { maxHa: number | null; maxUsers: number | null };
  usage: { ha: number; users: number };
  plans: { active: { maxHa: number | null; maxUsers: number | null } };
  pending: PlanRequest | null;
  lastResolved: PlanRequest | null;
}
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

const cap = (n: number | null) => (n === null ? t("ui.planNoCap") : fmtNumber(n, 0));
const openWeb = (path: string) => void Linking.openURL(`${API_URL}${path}`).catch(() => showToast(t("office.moreOpenFail")));

export default function MoreAccount() {
  const role = getSession()?.organization.role ?? "";
  const owner = role === "owner";
  const field = isFieldRole(role);
  return (
    <OfficeScreen title={t("office.moreAccountTitle")}>
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
  const requested = (r: PlanRequest) => [t(key(`ui.planName_${r.plan}`)), r.maxHa ? t("ui.planUpToHa", { n: fmtNumber(r.maxHa, 0) }) : null, r.maxUsers ? t("ui.planUpToUsers", { n: fmtNumber(r.maxUsers, 0) }) : null].filter(Boolean).join(" · ");
  const over = (used: number, max: number | null) => max !== null && used >= max;
  const noSignal = useNoSignalReason();
  return (
    <>
      <SectionHeader title={t("ui.planTitle")} first />
      {!p ? (
        <Text style={T.small}>{q.error ?? t("ui.loading")}</Text>
      ) : (
        <>
          <Text style={T.bodyMedium}>{`${t(key(`ui.planName_${p.plan}`))}${p.plan === "trial" && p.trialEndsAt ? ` · ${t("ui.trialEnds", { date: fmtDate(p.trialEndsAt) })}` : ""}`}</Text>
          <StatRow
            items={[
              { label: `${t("ui.planHectares")} ${t("office.planOf", { n: cap(p.limits.maxHa) })}`, value: fmtNumber(p.usage.ha, 0), tone: over(p.usage.ha, p.limits.maxHa) ? "danger" : undefined },
              { label: `${t("ui.planPeople")} ${t("office.planOf", { n: cap(p.limits.maxUsers) })}`, value: fmtNumber(p.usage.users, 0), tone: over(p.usage.users, p.limits.maxUsers) ? "danger" : undefined },
            ]}
          />
          <PriceSection billing={billing} onBilling={setBilling} />
          {p.pending ? (
            <View style={{ marginTop: 16, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: C.trigo }}>
              <Text style={T.bodyMedium}>{t("ui.planPending", { date: fmtDate(p.pending.createdAt) })}</Text>
              <Text style={T.small}>{requested(p.pending)}</Text>
              {p.pending.note ? <Text style={T.small}>{`“${p.pending.note}”`}</Text> : null}
              <Button kind="text" title={t("ui.planCancelRequest")} loading={cancel.pending} onPress={() => void cancel.mutate().then((r) => r.ok && (showToast(t("ui.planRequestCancelled")), void q.refresh()))} style={{ alignSelf: "flex-start" }} />
              {cancel.error ? <Text accessibilityRole="alert" style={[T.smallMedium, { color: C.peligro }]}>{cancel.error}</Text> : null}
            </View>
          ) : (
            <>
              {p.lastResolved ? <Text style={[T.small, { marginTop: 12 }]}>{`${t(p.lastResolved.status === "approved" ? "ui.planLastApproved" : "ui.planLastRejected", { what: requested(p.lastResolved) })}${p.lastResolved.resolutionNote ? ` ${p.lastResolved.resolutionNote}` : ""}`}</Text> : null}
              <Button kind="secondary" title={t("ui.planAsk")} onPress={() => setAsking(true)} disabled={!!noSignal} style={{ marginTop: 16 }} />
              <NoSignalNote />
            </>
          )}
          {asking ? <AskSheet billing={billing} intro={t("ui.planAskIntro", { ha: cap(p.plans.active.maxHa), users: cap(p.plans.active.maxUsers) })} onClose={() => setAsking(false)} onSent={() => void q.refresh()} /> : null}
        </>
      )}
    </>
  );
}

const usd = (n: number) => `US$ ${fmtNumber(n, 0)}`;

/** ADR 0005 §5: el precio por año y por cuota con las hectáreas reales (tablero) y una calculadora. Informativo: el cobro es manual. */
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
      { label: t("ui.planPriceYear"), value: fmtGs(usdToGs(q.year, rate)) },
      { label: `${t("ui.planPriceInstallment")} · ${t(key(`ui.planPriceInstallments_${billing}`))}`, value: fmtGs(usdToGs(q.perInstallment, rate)) },
      { label: "US$", value: `${usd(q.year)} · ${usd(q.perInstallment)}` },
      { label: t("ui.planPricePerHa", { n: fmtNumber(q.perHa, 2) }), value: q.minApplied ? t("ui.planPriceMin") : "" },
    ];
  };
  return (
    <>
      <SectionHeader title={t("ui.planPriceTitle")} />
      <Text style={T.small}>{t("ui.planPriceIntro")}</Text>
      <Text style={[T.smallMedium, { marginTop: 12, marginBottom: 6 }]}>{t("ui.planBilling")}</Text>
      <Segmented options={BILLINGS.map((b) => ({ value: b, label: t(key(`ui.planBilling_${b}`)) }))} value={billing} onChange={onBilling} />
      {billing === "annual" ? <Text style={[T.small, { marginTop: 6 }]}>{t("ui.planBillingGift")}</Text> : null}
      {dash.data ? (
        <>
          <Text style={[T.small, { marginTop: 12 }]}>{t("ui.planPriceYours", { crops: fmtNumber(crops, 0), cattle: fmtNumber(cattle, 0) })}</Text>
          <KeyValue rows={quote(crops, cattle)} />
        </>
      ) : null}
      <Text style={[T.smallMedium, { marginTop: 16 }]}>{t("ui.planCalcTitle")}</Text>
      <TextField label={t("ui.planCalcCrops")} value={calc.crops} onChangeText={(v) => setCalc({ ...calc, crops: v })} kind="decimal" />
      <TextField label={t("ui.planCalcCattle")} value={calc.cattle} onChangeText={(v) => setCalc({ ...calc, cattle: v })} kind="decimal" />
      <KeyValue rows={quote(Math.max(0, parseDecimal(calc.crops) ?? 0), Math.max(0, parseDecimal(calc.cattle) ?? 0))} />
      <Text style={[T.small, { marginTop: 8 }]}>{t("ui.planPriceNote", { rate: fmtNumber(rate, 0) })}</Text>
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
    if ((f.ha.trim() && (ha === null || ha <= 0)) || (f.users.trim() && (users === null || users <= 0 || !Number.isInteger(users)))) return setError(t("office.planBadNumbers"));
    setError(null);
    const r = await send.mutate({ plan: "active", maxHa: ha, maxUsers: users, note: f.note.trim() || null, billing });
    if (r.ok) {
      showToast(t("ui.planRequestSent"));
      onSent();
      onClose();
    }
  };
  return (
    <FormSheet visible title={t("ui.planAsk")} onClose={onClose} onSubmit={submit} submitLabel={t("ui.planAskSend")} pending={send.pending} error={error ?? send.error}>
      <Text style={[T.small, { marginTop: 4 }]}>{intro}</Text>
      <TextField label={t("ui.planAskHa")} hint={t("ui.planAskOptional")} value={f.ha} onChangeText={(v) => setF({ ...f, ha: v })} kind="decimal" />
      <TextField label={t("ui.planAskUsers")} hint={t("ui.planAskOptional")} value={f.users} onChangeText={(v) => setF({ ...f, users: v })} kind="number" />
      <TextField label={t("ui.planAskNote")} hint={t("ui.planAskOptional")} value={f.note} onChangeText={(v) => setF({ ...f, note: v })} maxLength={LIMITS.planRequest.noteLength} />
      <Text style={[T.small, { marginTop: 12 }]}>{t("ui.planAskNoCharge")}</Text>
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
      <SectionHeader title={t("ui.calendarFeedTitle")} />
      <Text style={T.small}>{t("ui.calendarFeedIntro")}</Text>
      {url ? (
        <View style={{ marginTop: 12, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: C.trigo }}>
          <Text style={T.bodyMedium}>{t("ui.calendarFeedNew")}</Text>
          <Text style={T.small}>{t("ui.calendarFeedNewText")}</Text>
          <Text selectable style={[T.small, { marginTop: 8, color: C.tinta }]}>{url}</Text>
          <Button kind="secondary" title={t("ui.calendarFeedCopy")} onPress={() => void copyText(url).then((ok) => ok && showToast(t("ui.copied")))} style={{ marginTop: 12 }} />
          <Text style={[T.small, { marginTop: 12 }]}>{t("ui.calendarFeedGoogle")}</Text>
          <Text style={T.small}>{t("ui.calendarFeedOutlook")}</Text>
        </View>
      ) : null}
      {s ? (
        <>
          <Text style={[T.body, { marginTop: 12 }]}>
            {`${s.active && s.createdAt ? t("ui.calendarFeedActive", { date: fmtDateTime(s.createdAt) }) : t("ui.calendarFeedNone")} ${s.active ? (s.lastUsedAt ? t("ui.calendarFeedUsed", { date: fmtDateTime(s.lastUsedAt) }) : t("ui.calendarFeedNeverUsed")) : ""}`.trim()}
          </Text>
          <Button
            kind={s.active ? "secondary" : "primary"}
            icon={CalendarDays}
            title={t(s.active ? "ui.calendarFeedRegen" : "ui.calendarFeedCreate")}
            loading={create.pending}
            disabled={!!noSignal}
            onPress={() => void create.mutate().then((r) => r.ok && setUrl(r.data.url))}
            style={{ marginTop: 12 }}
          />
          {s.active ? <Button kind="danger" title={t("ui.calendarFeedRevoke")} loading={revoke.pending} disabled={!!noSignal} onPress={() => void revoke.mutate().then((r) => r.ok && setUrl(null))} style={{ marginTop: 8 }} /> : null}
          <NoSignalNote />
        </>
      ) : (
        <Text style={[T.small, { marginTop: 12 }]}>{q.error ?? t("ui.loading")}</Text>
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
      <SectionHeader title={t(producer ? "ui.accountReferralTitleProducer" : "ui.accountReferralTitle")} />
      <Text style={T.small}>{t(producer ? "ui.accountReferralTextProducer" : "ui.accountReferralText")}</Text>
      <KeyValue rows={[{ label: t("ui.accountReferralCode"), value: code }, ...(q.data!.referred > 0 ? [{ label: t("office.moreReferred"), value: t("ui.accountReferralCount", { n: q.data!.referred, c: q.data!.credited }) }] : [])]} />
      <Text selectable style={[T.small, { marginTop: 12 }]}>{link}</Text>
      <Button kind="secondary" title={t("ui.accountReferralCopy")} onPress={() => void copyText(link).then((ok) => ok && showToast(t("ui.copied")))} style={{ marginTop: 12 }} />
    </>
  );
}

function HelpSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <SectionHeader title={t("ui.helpTitle")} />
      <Row icon={MessageCircle} title={t("ui.helpWhatsapp")} onPress={() => void Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(t("ui.publicWhatsappText"))}`).catch(() => showToast(t("office.moreOpenFail")))} />
      <Row icon={PlayCircle} title={t("ui.helpVideosTitle")} subtitle={t("office.moreOpensWeb")} onPress={() => openWeb("/ayuda")} />
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <View key={n}>
          <Row title={t(key(`ui.helpQ${n}`))} onPress={() => setOpen(open === n ? null : n)} chevron={false} />
          {open === n ? <Text style={[T.body, { paddingBottom: 12 }]}>{t(key(`ui.helpA${n}`))}</Text> : null}
        </View>
      ))}
      <Row icon={FileText} title={t("office.moreTerms")} subtitle={t("office.moreOpensWeb")} onPress={() => openWeb("/terminos")} />
      <Row icon={ShieldCheck} title={t("office.morePrivacy")} subtitle={t("office.moreOpensWeb")} onPress={() => openWeb("/privacidad")} />
    </>
  );
}
