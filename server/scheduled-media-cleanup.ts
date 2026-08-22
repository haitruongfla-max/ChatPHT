import type { Request, Response } from "express";

import { sdk } from "./_core/sdk";
import * as db from "./db";
import { runMediaCleanup } from "./media-cleanup";

export async function scheduledMediaCleanupHandler(req: Request, res: Response) {
  let taskUid: string | undefined;
  try {
    const cronUser = await sdk.authenticateRequest(req);
    taskUid = cronUser.taskUid;
    const settings = await db.getStorageQuotaSettings();
    if (!cronUser.isCron || !cronUser.taskUid || cronUser.taskUid !== settings.scheduledTaskUid) {
      res.status(403).json({ error: "cron-only-or-unregistered-task" });
      return;
    }
    res.json({ ok: true, ...(await runMediaCleanup()) });
  } catch (error) {
    console.error("[scheduled-media-cleanup]", error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown cleanup error",
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid: taskUid ?? null },
      timestamp: new Date().toISOString(),
    });
  }
}
