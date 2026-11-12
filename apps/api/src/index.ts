import { app } from "./app";
import { queue, scheduled } from "./jobs";
import { captureError } from "./lib/monitoring";
import type { Bindings, JobMessage } from "./types";

export default {
  fetch: app.fetch,
  scheduled: (controller, env, ctx) =>
    ctx.waitUntil(
      scheduled(controller, env).catch((err) => {
        captureError(env, err, { ctx, tags: { cron: controller.cron } });
        throw err;
      }),
    ),
  queue: async (batch, env, ctx) => {
    try {
      await queue(batch, env);
    } catch (err) {
      captureError(env, err, { ctx, tags: { queue: batch.queue } });
      throw err;
    }
  },
} satisfies ExportedHandler<Bindings, JobMessage>;
