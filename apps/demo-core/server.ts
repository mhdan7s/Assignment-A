import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_CREDENTIALS, MEMBERS, formatMoney } from "./data.js";
import { createSession, destroySession, getSession, type SessionState } from "./session.js";
import { escapeHtml, layout, moneyCell } from "./html.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.DEMO_CORE_PORT ?? 4173);
const host = "127.0.0.1";
const COOKIE = "demo_core_sid";

type AuthedRequest = Request & { session: SessionState };

const app = express();
app.use(express.urlencoded({ extended: false }));

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function setSessionCookie(res: Response, sessionId: string): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`,
  );
}

function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0`);
}

function attachSession(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  let session = getSession(cookies[COOKIE]);
  if (!session) {
    session = createSession();
    setSessionCookie(res, session.id);
  }
  (req as AuthedRequest).session = session;
  next();
}

app.use(attachSession);

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = (req as AuthedRequest).session;

  if (session.expireNextRequest && session.authenticated) {
    session.expireNextRequest = false;
    session.authenticated = false;
    return res.status(401).send(
      layout({
        title: "Session expired",
        banner: "Your session has expired. Please sign in again.",
        bannerKind: "warn",
        body: `
          <h1>Session expired</h1>
          <p role="status" aria-label="Session expired message">Your session has expired. Please sign in again.</p>
          <p><a href="/login" aria-label="Return to login">Return to login</a></p>
        `,
      }),
    );
  }

  if (!session.authenticated) {
    return res.redirect("/login");
  }

  if (session.pendingInterstitial && req.path !== "/interstitial" && req.path !== "/interstitial/dismiss") {
    return res.redirect("/interstitial");
  }

  next();
}

async function maybeSlow(session: SessionState): Promise<void> {
  if (session.slowMs > 0) {
    await new Promise((r) => setTimeout(r, session.slowMs));
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    app: "demo-core",
    status: "ready",
    credentials: { username: DEMO_CREDENTIALS.username, password: "(see README)" },
    sampleMemberIds: Object.keys(MEMBERS),
  });
});

app.get("/", (req, res) => {
  const session = (req as AuthedRequest).session;
  res.redirect(session.authenticated ? "/home" : "/login");
});

app.get("/login", (req, res) => {
  const session = (req as AuthedRequest).session;
  if (session.authenticated) return res.redirect("/home");
  const err = typeof req.query.error === "string" ? req.query.error : undefined;
  res.send(
    layout({
      title: "Login",
      banner: err === "invalid" ? "Invalid username or password." : undefined,
      bannerKind: "error",
      body: `
        <h1>Staff login</h1>
        <p>Synthetic teller console. Use demo credentials from the README.</p>
        <form method="post" action="/login" aria-label="Login form">
          <table class="form" role="presentation" cellpadding="6">
            <tr>
              <td><label for="username">Username</label></td>
              <td><input id="username" name="username" type="text" autocomplete="username" aria-label="Username" /></td>
            </tr>
            <tr>
              <td><label for="password">Password</label></td>
              <td><input id="password" name="password" type="password" autocomplete="current-password" aria-label="Password" /></td>
            </tr>
            <tr>
              <td colspan="2">
                <button type="submit" aria-label="Sign in">Sign in</button>
              </td>
            </tr>
          </table>
        </form>
      `,
    }),
  );
});

app.post("/login", (req, res) => {
  const session = (req as AuthedRequest).session;
  const username = String(req.body.username ?? "");
  const password = String(req.body.password ?? "");
  if (username === DEMO_CREDENTIALS.username && password === DEMO_CREDENTIALS.password) {
    session.authenticated = true;
    session.username = username;
    return res.redirect("/home");
  }
  return res.redirect("/login?error=invalid");
});

app.get("/logout", (req, res) => {
  const session = (req as AuthedRequest).session;
  destroySession(session.id);
  clearSessionCookie(res);
  res.redirect("/login");
});

app.get("/interstitial", requireAuth, (req, res) => {
  res.send(
    layout({
      title: "System notice",
      authed: true,
      banner: "System notice — acknowledgment required",
      bannerKind: "info",
      body: `
        <h1>System notice</h1>
        <p role="status" aria-label="System notice message">
          Scheduled maintenance window tonight 01:00–03:00 CT. Click Continue to proceed.
        </p>
        <form method="post" action="/interstitial/dismiss" aria-label="Dismiss system notice">
          <button type="submit" aria-label="Continue">Continue</button>
        </form>
      `,
    }),
  );
});

app.post("/interstitial/dismiss", requireAuth, (req, res) => {
  const session = (req as AuthedRequest).session;
  session.pendingInterstitial = false;
  res.redirect("/home");
});

app.get("/home", requireAuth, (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const err = typeof req.query.error === "string" ? req.query.error : undefined;
  let banner: string | undefined;
  let bannerKind: "error" | "info" | "warn" | undefined;
  if (err === "validation") {
    banner = "Validation error: Member ID is required.";
    bannerKind = "error";
  } else if (err === "not_found") {
    banner = "Record not found: no member matches that ID.";
    bannerKind = "error";
  }

  res.send(
    layout({
      title: "Member search",
      authed: true,
      banner,
      bannerKind,
      body: `
        <h1>Member lookup</h1>
        <p>Search by member ID, then open the detail pane.</p>
        <form method="get" action="/members/search" aria-label="Member search form">
          <table class="form" role="presentation" cellpadding="6">
            <tr>
              <td><label for="memberId">Member ID</label></td>
              <td>
                <input id="memberId" name="memberId" type="text" value="${escapeHtml(q)}" aria-label="Member ID" />
              </td>
            </tr>
            <tr>
              <td colspan="2">
                <button type="submit" aria-label="Search members">Search</button>
              </td>
            </tr>
          </table>
        </form>
        <p class="hint">Try member <strong>12345</strong> (happy path) or <strong>67890</strong> (restricted).</p>
      `,
    }),
  );
});

app.get("/members/search", requireAuth, async (req, res) => {
  const session = (req as AuthedRequest).session;
  await maybeSlow(session);

  const memberId = String(req.query.memberId ?? "").trim();
  if (!memberId) {
    return res.redirect("/home?error=validation");
  }

  const member = MEMBERS[memberId];
  if (!member) {
    return res.redirect(`/home?error=not_found&q=${encodeURIComponent(memberId)}`);
  }

  return res.redirect(`/members/${encodeURIComponent(member.id)}`);
});

app.get("/members/:id", requireAuth, async (req, res) => {
  const session = (req as AuthedRequest).session;
  await maybeSlow(session);

  const id = req.params.id ?? "";
  const member = MEMBERS[id];
  if (!member) {
    return res.redirect("/home?error=not_found");
  }

  if (member.status === "restricted" || session.forcePermissionDenied) {
    return res.status(403).send(
      layout({
        title: "Permission denied",
        authed: true,
        banner: "Permission denied: you are not authorized to view this member.",
        bannerKind: "error",
        body: `
          <h1>Permission denied</h1>
          <p role="status" aria-label="Permission denied message">
            You are not authorized to view member ${escapeHtml(id)}.
          </p>
          <p><a href="/home" aria-label="Back to member search">Back to member search</a></p>
        `,
      }),
    );
  }

  // Hostile: outer table + iframe detail pane (legacy realism)
  const detailSrc = `/members/${encodeURIComponent(id)}/detail-frame`;
  res.send(
    layout({
      title: `Member ${member.id}`,
      authed: true,
      body: `
        <h1>Member detail</h1>
        <table class="split" role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td class="sidebar" valign="top" width="220">
              <table class="form" role="presentation">
                <tr><td class="lbl">Member ID</td><td>${escapeHtml(member.id)}</td></tr>
                <tr><td class="lbl">Name</td><td><span aria-label="Member name">${escapeHtml(member.name)}</span></td></tr>
              </table>
              <p>
                <a href="/members/${escapeHtml(member.id)}/sub-account" aria-label="Open new sub-account">
                  Open new sub-account
                </a>
              </p>
              <p><a href="/home" aria-label="Back to member search">Back to search</a></p>
            </td>
            <td valign="top">
              <iframe
                title="Account detail pane"
                name="detailFrame"
                src="${detailSrc}"
                width="100%"
                height="280"
                aria-label="Account detail pane"
              ></iframe>
            </td>
          </tr>
        </table>
      `,
    }),
  );
});

app.get("/members/:id/detail-frame", requireAuth, (req, res) => {
  const id = req.params.id ?? "";
  const member = MEMBERS[id];
  if (!member || member.status === "restricted") {
    return res.status(404).send("Not found");
  }

  // Intentionally non-semantic nested tables; labels keep a11y workable
  res.send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><link rel="stylesheet" href="/styles.css" /></head>
<body class="frame">
  <table class="grid" role="presentation" cellpadding="8" cellspacing="0">
    <tr class="grid-head"><td colspan="2"><strong>Account balances</strong></td></tr>
    ${moneyCell("Savings balance", formatMoney(member.savingsBalance))}
    ${moneyCell("Checking balance", formatMoney(member.checkingBalance))}
  </table>
</body>
</html>`);
});

app.get("/members/:id/sub-account", requireAuth, (req, res) => {
  const id = req.params.id ?? "";
  const member = MEMBERS[id];
  if (!member || member.status === "restricted") {
    return res.redirect("/home?error=not_found");
  }
  const err = typeof req.query.error === "string" ? req.query.error : undefined;

  res.send(
    layout({
      title: "Open sub-account",
      authed: true,
      banner: err === "validation" ? "Validation error: Product type is required." : undefined,
      bannerKind: "error",
      body: `
        <h1>Open new sub-account</h1>
        <p>Member <span aria-label="Member ID">${escapeHtml(member.id)}</span> — ${escapeHtml(member.name)}</p>
        <form method="post" action="/members/${escapeHtml(member.id)}/sub-account" aria-label="Open sub-account form">
          <table class="form" role="presentation" cellpadding="6">
            <tr>
              <td><label for="productType">Product type</label></td>
              <td>
                <select id="productType" name="productType" aria-label="Product type">
                  <option value="">Select…</option>
                  <option value="savings">Additional savings</option>
                  <option value="money_market">Money market</option>
                </select>
              </td>
            </tr>
            <tr>
              <td><label for="nickname">Nickname</label></td>
              <td><input id="nickname" name="nickname" type="text" aria-label="Nickname" /></td>
            </tr>
            <tr>
              <td colspan="2">
                <button type="submit" aria-label="Continue to confirmation">Continue to confirmation</button>
              </td>
            </tr>
          </table>
        </form>
      `,
    }),
  );
});

app.post("/members/:id/sub-account", requireAuth, (req, res) => {
  const id = req.params.id ?? "";
  const member = MEMBERS[id];
  if (!member || member.status === "restricted") {
    return res.redirect("/home?error=not_found");
  }
  const productType = String(req.body.productType ?? "").trim();
  const nickname = String(req.body.nickname ?? "").trim();
  if (!productType) {
    return res.redirect(`/members/${encodeURIComponent(id)}/sub-account?error=validation`);
  }
  const qs = new URLSearchParams({ productType, nickname });
  return res.redirect(`/members/${encodeURIComponent(id)}/sub-account/confirm?${qs.toString()}`);
});

app.get("/members/:id/sub-account/confirm", requireAuth, (req, res) => {
  const id = req.params.id ?? "";
  const member = MEMBERS[id];
  if (!member || member.status === "restricted") {
    return res.redirect("/home?error=not_found");
  }
  const productType = String(req.query.productType ?? "");
  const nickname = String(req.query.nickname ?? "");

  res.send(
    layout({
      title: "Confirm sub-account",
      authed: true,
      body: `
        <h1>Confirmation</h1>
        <p role="status" aria-label="Confirmation message">
          Review and confirm opening a new sub-account.
        </p>
        <table class="form" role="presentation" cellpadding="6">
          <tr><td class="lbl">Member ID</td><td>${escapeHtml(member.id)}</td></tr>
          <tr><td class="lbl">Product type</td><td><span aria-label="Product type value">${escapeHtml(productType)}</span></td></tr>
          <tr><td class="lbl">Nickname</td><td><span aria-label="Nickname value">${escapeHtml(nickname || "(none)")}</span></td></tr>
        </table>
        <p><strong aria-label="Reached confirmation screen">You have reached the confirmation screen.</strong></p>
        <p><a href="/members/${escapeHtml(member.id)}" aria-label="Back to member detail">Back to member detail</a></p>
      `,
    }),
  );
});

app.get("/inject", requireAuth, (req, res) => {
  const session = (req as AuthedRequest).session;
  res.send(
    layout({
      title: "Injection controls",
      authed: true,
      body: `
        <h1>Exception injection</h1>
        <p>Toggle runtime conditions for discovery/replay evidence. Synthetic only.</p>
        <table class="form" role="presentation" cellpadding="8">
          <tr><td>Pending interstitial</td><td>${session.pendingInterstitial ? "ON" : "off"}</td></tr>
          <tr><td>Expire next request</td><td>${session.expireNextRequest ? "ARMED" : "off"}</td></tr>
          <tr><td>Slow delay (ms)</td><td>${session.slowMs}</td></tr>
          <tr><td>Force permission denied</td><td>${session.forcePermissionDenied ? "ON" : "off"}</td></tr>
        </table>
        <form method="post" action="/inject" aria-label="Injection controls form">
          <table class="form" role="presentation" cellpadding="6">
            <tr>
              <td colspan="2">
                <label><input type="checkbox" name="interstitial" value="1" aria-label="Queue system notice interstitial" ${session.pendingInterstitial ? "checked" : ""}/> Queue system notice interstitial</label>
              </td>
            </tr>
            <tr>
              <td colspan="2">
                <label><input type="checkbox" name="expireNext" value="1" aria-label="Expire session on next request" ${session.expireNextRequest ? "checked" : ""}/> Expire session on next request</label>
              </td>
            </tr>
            <tr>
              <td colspan="2">
                <label><input type="checkbox" name="forceDenied" value="1" aria-label="Force permission denied on member detail" ${session.forcePermissionDenied ? "checked" : ""}/> Force permission denied on member detail</label>
              </td>
            </tr>
            <tr>
              <td><label for="slowMs">Slow delay (ms)</label></td>
              <td><input id="slowMs" name="slowMs" type="number" min="0" step="100" value="${session.slowMs}" aria-label="Slow delay in milliseconds" /></td>
            </tr>
            <tr>
              <td colspan="2"><button type="submit" aria-label="Apply injection settings">Apply</button></td>
            </tr>
          </table>
        </form>
      `,
    }),
  );
});

app.post("/inject", requireAuth, (req, res) => {
  const session = (req as AuthedRequest).session;
  session.pendingInterstitial = req.body.interstitial === "1";
  session.expireNextRequest = req.body.expireNext === "1";
  session.forcePermissionDenied = req.body.forceDenied === "1";
  const slow = Number(req.body.slowMs ?? 0);
  session.slowMs = Number.isFinite(slow) && slow > 0 ? Math.min(slow, 10_000) : 0;
  res.redirect("/inject");
});

// Static assets after routes so `/` is owned by the app, not public/index.html
app.use(express.static(publicDir, { index: false }));

app.listen(port, host, () => {
  console.log(`[demo-core] listening on http://${host}:${port}`);
  console.log(`[demo-core] login: ${DEMO_CREDENTIALS.username} / ${DEMO_CREDENTIALS.password}`);
  console.log("[demo-core] sample members: 12345 (ok), 67890 (restricted)");
});
