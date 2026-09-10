import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.DEMO_CORE_PORT ?? 4173);
const host = "127.0.0.1";

const app = express();
app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "demo-core", status: "placeholder" });
});

app.listen(port, host, () => {
  console.log(`[demo-core] placeholder listening on http://${host}:${port}`);
  console.log("[demo-core] full hostile bank UI arrives in PLAN Phase 11");
});
