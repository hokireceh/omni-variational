import { Router, type IRouter } from "express";
import { botEngine } from "../lib/grid-bot-engine";
import { varClient } from "../lib/variational-client";
import {
  GetBotStatusResponse,
  StartBotResponse,
  StopBotResponse,
  GetBotConfigResponse,
  UpdateBotConfigBody,
  UpdateBotConfigResponse,
  GetBotTradesResponse,
  ResetBotResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /bot/status
router.get("/bot/status", (_req, res) => {
  const data = GetBotStatusResponse.parse(botEngine.getStatus());
  res.json(data);
});

// POST /bot/start
router.post("/bot/start", async (_req, res) => {
  try {
    await botEngine.start();
    const data = StartBotResponse.parse(botEngine.getStatus());
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// POST /bot/stop
router.post("/bot/stop", (_req, res) => {
  botEngine.stop();
  const data = StopBotResponse.parse(botEngine.getStatus());
  res.json(data);
});

// GET /bot/config
router.get("/bot/config", (_req, res) => {
  const data = GetBotConfigResponse.parse(botEngine.getConfig());
  res.json(data);
});

// PATCH /bot/config
router.patch("/bot/config", (req, res) => {
  const parsed = UpdateBotConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    botEngine.setConfig(parsed.data);
    const data = UpdateBotConfigResponse.parse(botEngine.getConfig());
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// GET /bot/trades
router.get("/bot/trades", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const data = GetBotTradesResponse.parse({ trades: botEngine.getTrades(limit) });
  res.json(data);
});

// POST /bot/reset
router.post("/bot/reset", (_req, res) => {
  botEngine.reset();
  const data = ResetBotResponse.parse(botEngine.getStatus());
  res.json(data);
});

// POST /auth/cookies — update CF_CLEARANCE dan/atau VR_TOKEN dari panel
router.post("/auth/cookies", (req, res) => {
  const { cfClearance, vrToken } = req.body as {
    cfClearance?: string;
    vrToken?: string;
  };
  if (!cfClearance && !vrToken) {
    res.status(400).json({ error: "cfClearance atau vrToken harus diisi" });
    return;
  }
  varClient.updateAuth({ cfClearance, vrToken });
  res.json({ ok: true, updated: { cfClearance: !!cfClearance, vrToken: !!vrToken } });
});

export default router;
