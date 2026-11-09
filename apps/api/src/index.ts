import { app } from "./app";
import { queue, scheduled } from "./jobs";
import type { Bindings, JobMessage } from "./types";

export default {
  fetch: app.fetch,
  scheduled: (controller, env, ctx) => ctx.waitUntil(scheduled(controller, env)),
  queue: (batch, env) => queue(batch, env),
} satisfies ExportedHandler<Bindings, JobMessage>;
