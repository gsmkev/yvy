import type { Mutation } from "@yvy/shared";

/** Ids que las mutaciones de un push obligan a leer antes de decidir (todas las lecturas van por IN, con índices). */
export interface PushIds {
  recordIds: Set<string>;
  attachmentIds: Set<string>;
  taskIds: Set<string>;
  farmIds: Set<string>;
  plotIds: Set<string>;
  poiIds: Set<string>;
  plotUpsertIds: Set<string>;
  attachRecordIds: Set<string>;
  commentIds: Set<string>;
  commentRecordIds: Set<string>;
  mentionIds: Set<string>;
}

type Collector = (m: Mutation, ids: PushIds) => void;
type Of<K extends Mutation["kind"]> = Extract<Mutation, { kind: K }>;

const COLLECTORS: { [K in Mutation["kind"]]: (m: Of<K>, ids: PushIds) => void } = {
  "comments.upsert": (m, ids) => {
    ids.commentIds.add(m.row.id);
    ids.commentRecordIds.add(m.row.recordId);
    m.row.mentions.forEach((u) => ids.mentionIds.add(u));
  },
  "comments.delete": (m, ids) => {
    ids.commentIds.add(m.row.id);
  },
  "records.upsert": (m, ids) => {
    ids.recordIds.add(m.row.id);
    ids.farmIds.add(m.row.farmId);
    if (m.row.plotId) ids.plotIds.add(m.row.plotId);
    if (m.row.poiId) ids.poiIds.add(m.row.poiId);
    if (m.row.kind === "herd_move") {
      const to = (m.row.data as { toPlotId?: unknown } | null)?.toPlotId;
      if (typeof to === "string") ids.plotIds.add(to);
    }
  },
  "records.delete": (m, ids) => {
    ids.recordIds.add(m.row.id);
  },
  "attachments.upsert": (m, ids) => {
    ids.attachmentIds.add(m.row.id);
    ids.recordIds.add(m.row.recordId);
    ids.attachRecordIds.add(m.row.recordId);
  },
  "attachments.delete": (m, ids) => {
    ids.attachmentIds.add(m.row.id);
  },
  "tasks.comment": (m, ids) => {
    ids.taskIds.add(m.row.taskId);
  },
  "tasks.status": (m, ids) => {
    ids.taskIds.add(m.row.id);
    // T-03: el registro con el que se cierra una tarea (y sus fotos) hay que mirarlo para exigir foto y ubicación
    if (m.row.status === "done" && m.row.recordId) {
      ids.recordIds.add(m.row.recordId);
      ids.attachRecordIds.add(m.row.recordId);
    }
  },
  "tasks.check": (m, ids) => {
    ids.taskIds.add(m.row.id);
  },
  "pois.upsert": (m, ids) => {
    ids.poiIds.add(m.row.id);
    ids.farmIds.add(m.row.farmId);
  },
  "plots.upsert": (m, ids) => {
    ids.plotUpsertIds.add(m.row.id);
    ids.farmIds.add(m.row.farmId);
  },
};

const collectors = new Map(Object.entries(COLLECTORS) as [Mutation["kind"], Collector][]);

export function collectIds(mutations: Mutation[]): PushIds {
  const ids: PushIds = {
    recordIds: new Set(),
    attachmentIds: new Set(),
    taskIds: new Set(),
    farmIds: new Set(),
    plotIds: new Set(),
    poiIds: new Set(),
    plotUpsertIds: new Set(),
    attachRecordIds: new Set(),
    commentIds: new Set(),
    commentRecordIds: new Set(),
    mentionIds: new Set(),
  };
  for (const m of mutations) collectors.get(m.kind)!(m, ids);
  return ids;
}
