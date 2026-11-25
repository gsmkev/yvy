/** Campos, columnas y diálogo de alta y edición de un maestro del ERP (terceros, máquinas, depósitos...). */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromMinor, toMinor, type Currency } from "@yvy/shared";
import { get, patch, post } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Field, Form, FormFooter, Input, Modal, Select, toast } from "../ui";

/** Campo del formulario de un maestro. `type` "money" convierte a la unidad menor de la moneda indicada por `currencyKey`. */
export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "money";
  options?: { value: string; label: string }[];
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
  /** Solo para `money`: campo de la fila con la moneda ("PYG" o "USD"). */
  currencyKey?: string;
  /** Valor inicial en un alta. */
  initial?: string;
}

/** Columna de la tabla de un maestro; `right` alinea a la derecha los montos y las cantidades. */
export interface ColDef<T> {
  header: string;
  cell: (r: T) => ReactNode;
  /** Montos y cantidades: a la derecha. */
  right?: boolean;
  /** Oculta la columna bajo ese punto de corte (celular). */
  hideBelow?: "sm" | "md" | "lg";
  /** Papel en la tarjeta del celular: título, dato clave o no mostrar (por defecto la primera columna es el título). */
  mobile?: "title" | "value" | "hide";
}

/**
 * Lista de un recurso del ERP.
 * @param path ruta bajo /org/erp.
 * @param enabled en false evita la consulta.
 */
export const useErpList = <T,>(path: string, enabled = true) =>
  useQuery({ enabled, queryKey: ["erp", path], queryFn: () => get<T[]>(`/org/erp/${path}`) });

/** Toda fila de un maestro tiene `id`. */
export type Row = { id: string };

const toForm = (fields: FieldDef[], row: Row | null): Record<string, string> =>
  Object.fromEntries(
    fields.map((f) => {
      const rec = row as Record<string, unknown> | null;
      const v = rec?.[f.key];
      if (v === null || v === undefined) return [f.key, row ? "" : (f.initial ?? "")];
      if (f.type === "money") return [f.key, String(fromMinor(Number(v), (rec?.[f.currencyKey ?? "currency"] as Currency) ?? "PYG"))];
      return [f.key, String(v)];
    }),
  );

const toBody = (fields: FieldDef[], form: Record<string, string>) =>
  Object.fromEntries(
    fields.map((f) => {
      const raw = (form[f.key] ?? "").trim();
      if (f.type === "number") return [f.key, raw === "" ? null : Number(raw)];
      if (f.type === "money") return [f.key, raw === "" ? null : toMinor(Number(raw), (form[f.currencyKey ?? "currency"] as Currency) ?? "PYG")];
      return [f.key, raw === "" ? null : raw];
    }),
  );

const NARROW = new Set(["select", "number", "date", "money"]);

function RowField({ f, value, first, onChange }: { f: FieldDef; value: string; first: boolean; onChange: (e: { target: { value: string } }) => void }) {
  const numeric = f.type === "number" || f.type === "money";
  return (
    <Field label={f.label} hint={f.hint} wide={!NARROW.has(f.type ?? "text")}>
      {f.type === "select" ? (
        <Select value={value} onChange={onChange} options={f.options ?? []} />
      ) : (
        <Input
          autoFocus={first}
          required={f.required}
          maxLength={f.maxLength}
          type={f.type === "money" ? "number" : (f.type ?? "text")}
          min={f.type === "money" ? 0 : f.min}
          max={f.max}
          step={f.step ?? (numeric ? "any" : undefined)}
          value={value}
          onChange={onChange}
        />
      )}
    </Field>
  );
}

/** Props de RowModal: `row` es la fila a editar o null para un alta, y `path` la ruta del maestro en la API. */
interface RowModalProps {
  title: string;
  fields: FieldDef[];
  row: Row | null;
  path: string;
  onClose: () => void;
}

/** Diálogo de alta o edición de una fila. */
export function RowModal({ title, fields, row, path, onClose }: RowModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => toForm(fields, row));
  const save = useMutation({
    mutationFn: () => {
      const body = toBody(fields, form);
      return row ? patch(`/org/erp/${path}/${row.id}`, body) : post(`/org/erp/${path}`, body);
    },
    onSuccess: () => {
      toast(t("ui.erp.saved"));
      qc.invalidateQueries({ queryKey: ["erp"] });
      onClose();
    },
  });
  return (
    <Modal title={title} onClose={onClose}>
      <Form onSubmit={() => save.mutate()}>
        {fields.map((f, i) => (
          <RowField key={f.key} f={f} first={i === 0} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
        ))}
        <FormFooter error={save.error} disabled={save.isPending} />
      </Form>
    </Modal>
  );
}
