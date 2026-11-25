// @vitest-environment jsdom
/** Pruebas del modo edición de tareas: valores iniciales, cuerpo del PATCH y la acción Editar de la fila. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../lib/types";
import { editBody, initialDraft } from "./NewTaskModal";
import { TaskRow } from "./TaskRow";

afterEach(cleanup);

const row = (props: { onEdit?: () => void }) => (
  <QueryClientProvider client={new QueryClient()}>
    <ul>
      <TaskRow x={task} today="2026-11-25" overdue={false} onDelete={vi.fn()} {...props} />
    </ul>
  </QueryClientProvider>
);

const task = {
  id: "t1",
  farmId: "f1",
  plotId: "p1",
  assigneeId: "u2",
  title: "Medir lluvia",
  kind: "rain",
  dueDate: "2026-11-30",
  dueTime: "08:30",
  priority: "high",
  recurrence: "weekly",
  status: "open",
  checklist: null,
  comments: null,
} as unknown as Task;

describe("edición de tareas", () => {
  it("precarga el formulario con los datos de la tarea", () => {
    const d = initialDraft(task, undefined, "u1");
    expect(d).toMatchObject({ farmId: "f1", plotId: "p1", assigneeId: "u2", title: "Medir lluvia", dueTime: "08:30", priority: "high" });
  });

  it("en el alta usa el primer responsable y la estancia fija", () => {
    expect(initialDraft(undefined, "f9", "u1")).toMatchObject({ farmId: "f9", assigneeId: "u1", title: "", priority: "normal" });
  });

  it("el PATCH no manda la lista de verificación y solo manda el lote si el formulario lo mostró", () => {
    const d = { ...initialDraft(task, undefined, "u1"), checklist: "a\nb", plotId: "" };
    expect(editBody(d, true)).toMatchObject({ plotId: null, dueTime: "08:30" });
    expect(editBody(d, false)).not.toHaveProperty("plotId");
    expect(editBody(d, true)).not.toHaveProperty("checklist");
  });

  it("la fila ofrece Editar solo con permiso", () => {
    const onEdit = vi.fn();
    const { rerender } = render(row({ onEdit }));
    fireEvent.click(screen.getByRole("button", { name: "Acciones de la tarea" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledOnce();
    rerender(row({}));
    fireEvent.click(screen.getByRole("button", { name: "Acciones de la tarea" }));
    expect(screen.queryByRole("menuitem", { name: "Editar" })).toBeNull();
  });
});
