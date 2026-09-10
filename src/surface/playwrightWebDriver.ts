import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Dialog,
  type Page,
} from "playwright";
import { logger } from "../shared/logger.js";
import { resolveLocator } from "./locators.js";
import type {
  ActionIntent,
  ActionResult,
  A11yNode,
  CheckpointResult,
  CheckpointSpec,
  EvidenceRefs,
  MultiStrategyLocator,
  Observation,
  SurfaceDriver,
  SurfaceSessionOwner,
  WaitSpec,
} from "./types.js";
import type { HumanActionRecord } from "../hitl/types.js";

export type PlaywrightWebDriverOptions = {
  headless?: boolean;
  /** Optional CDP endpoint for attaching to an existing browser (HITL-friendly). */
  cdpUrl?: string;
  evidenceDir?: string;
  defaultTimeoutMs?: number;
  /**
   * Optional pre-act guard (Phase 3 PolicyEngine plugs in here).
   * Throw or return a deny result to block.
   */
  beforeAct?: (action: ActionIntent) => Promise<void> | void;
};

/**
 * Web SurfaceDriver backed by Playwright.
 * Artifacts must not import this class — only ActionIntent / MultiStrategyLocator.
 */
export class PlaywrightWebDriver implements SurfaceDriver {
  readonly sessionId: string;
  private ownerState: SurfaceSessionOwner = "automation";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly targets = new Map<string, MultiStrategyLocator>();
  private readonly opts: Required<
    Pick<PlaywrightWebDriverOptions, "headless" | "defaultTimeoutMs">
  > &
    PlaywrightWebDriverOptions;
  private dialogHandler: ((dialog: Dialog) => Promise<void>) | null = null;
  private pendingDialogAction: "accept" | "dismiss" | null = null;

  private constructor(sessionId: string, opts: PlaywrightWebDriverOptions) {
    this.sessionId = sessionId;
    this.opts = {
      headless: opts.headless ?? true,
      defaultTimeoutMs: opts.defaultTimeoutMs ?? 10_000,
      ...opts,
    };
  }

  get owner(): SurfaceSessionOwner {
    return this.ownerState;
  }

  static async create(opts: PlaywrightWebDriverOptions = {}): Promise<PlaywrightWebDriver> {
    const driver = new PlaywrightWebDriver(randomUUID(), opts);

    if (opts.cdpUrl) {
      driver.browser = await chromium.connectOverCDP(opts.cdpUrl);
      const contexts = driver.browser.contexts();
      driver.context = contexts[0] ?? (await driver.browser.newContext());
      driver.page = driver.context.pages()[0] ?? (await driver.context.newPage());
    } else {
      driver.browser = await chromium.launch({ headless: driver.opts.headless });
      driver.context = await driver.browser.newContext();
      driver.page = await driver.context.newPage();
    }

    driver.page.setDefaultTimeout(driver.opts.defaultTimeoutMs);
    driver.installDialogHook();
    return driver;
  }

  /** Register or replace a multi-strategy target used by act()/extract. */
  registerTarget(target: MultiStrategyLocator): void {
    this.targets.set(target.id, target);
  }

  registerTargets(targets: MultiStrategyLocator[]): void {
    for (const t of targets) this.registerTarget(t);
  }

  getPage(): Page {
    if (!this.page) throw new Error("Surface session has no page");
    return this.page;
  }

  private installDialogHook(): void {
    const page = this.getPage();
    this.dialogHandler = async (dialog: Dialog) => {
      const action = this.pendingDialogAction;
      this.pendingDialogAction = null;
      if (action === "accept") {
        await dialog.accept();
      } else if (action === "dismiss") {
        await dialog.dismiss();
      } else {
        // Explicit only — never auto-accept. Dismiss to unblock and surface in logs.
        logger.warn({ type: dialog.type(), message: dialog.message() }, "Unexpected dialog dismissed");
        await dialog.dismiss();
      }
    };
    page.on("dialog", this.dialogHandler);
  }

  async observe(options?: {
    screenshot?: boolean;
    screenshotDir?: string;
  }): Promise<Observation> {
    this.assertAutomation();
    const page = this.getPage();

    // Prefer aria snapshot (Playwright current API). Optional AX tree via CDP when useful.
    let ariaSnapshot: string | undefined;
    try {
      ariaSnapshot = await page.locator("body").ariaSnapshot();
    } catch {
      ariaSnapshot = undefined;
    }

    let a11yTree: A11yNode | null = null;
    try {
      const session = await page.context().newCDPSession(page);
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      a11yTree = axNodesToTree(nodes as AxCdpNode[]);
      await session.detach().catch(() => undefined);
    } catch {
      a11yTree = ariaSnapshot
        ? { role: "RootWebArea", name: await page.title(), children: [] }
        : null;
    }

    let screenshotPath: string | undefined;
    if (options?.screenshot) {
      const dir = options.screenshotDir ?? this.opts.evidenceDir ?? path.join("tmp", "surface");
      await fs.mkdir(dir, { recursive: true });
      screenshotPath = path.join(dir, `${this.sessionId}-observe.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    const observation: Observation = {
      url: page.url(),
      title: await page.title(),
      a11yTree,
      capturedAt: new Date().toISOString(),
    };
    if (ariaSnapshot !== undefined) observation.ariaSnapshot = ariaSnapshot;
    if (screenshotPath !== undefined) observation.screenshotPath = screenshotPath;
    return observation;
  }

  async act(action: ActionIntent): Promise<ActionResult> {
    try {
      this.assertAutomation();
      if (this.opts.beforeAct) {
        await this.opts.beforeAct(action);
      }

      const page = this.getPage();

      switch (action.type) {
        case "navigate": {
          await page.goto(action.url, { waitUntil: "domcontentloaded" });
          return { ok: true, message: `navigated to ${action.url}` };
        }
        case "click": {
          const resolved = await this.resolve(action.targetRef);
          await resolved.locator.click();
          return {
            ok: true,
            message: `clicked ${action.targetRef}`,
            resolvedBy: resolved.resolvedBy,
          };
        }
        case "type": {
          const resolved = await this.resolve(action.targetRef);
          if (action.clear !== false) {
            await resolved.locator.fill(action.text);
          } else {
            await resolved.locator.pressSequentially(action.text);
          }
          return {
            ok: true,
            message: `typed into ${action.targetRef}`,
            resolvedBy: resolved.resolvedBy,
          };
        }
        case "select": {
          const resolved = await this.resolve(action.targetRef);
          await resolved.locator.selectOption(action.value);
          return {
            ok: true,
            message: `selected ${action.value} on ${action.targetRef}`,
            resolvedBy: resolved.resolvedBy,
          };
        }
        case "press": {
          await page.keyboard.press(action.key);
          return { ok: true, message: `pressed ${action.key}` };
        }
        case "extract": {
          const resolved = await this.resolve(action.targetRef);
          const text =
            (await resolved.locator.inputValue().catch(() => null)) ??
            (await resolved.locator.innerText());
          return {
            ok: true,
            message: `extracted ${action.outputKey}`,
            resolvedBy: resolved.resolvedBy,
            extracted: { [action.outputKey]: text.trim() },
          };
        }
        case "wait": {
          await this.waitFor(action.spec);
          return { ok: true, message: "wait completed" };
        }
        case "dismiss_dialog": {
          this.pendingDialogAction = "dismiss";
          return { ok: true, message: "next dialog will be dismissed" };
        }
        case "accept_dialog": {
          this.pendingDialogAction = "accept";
          return { ok: true, message: "next dialog will be accepted" };
        }
        default: {
          const _exhaustive: never = action;
          return { ok: false, message: `Unknown action: ${JSON.stringify(_exhaustive)}` };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ action, err: message }, "surface.act failed");
      return { ok: false, message };
    }
  }

  async waitFor(condition: WaitSpec): Promise<void> {
    this.assertAutomation();
    const page = this.getPage();
    switch (condition.kind) {
      case "timeout": {
        const ms = Math.min(condition.ms, 30_000);
        await new Promise((r) => setTimeout(r, ms));
        return;
      }
      case "url": {
        await page.waitForURL(new RegExp(condition.pattern), {
          timeout: Math.min(condition.timeoutMs, 60_000),
        });
        return;
      }
      case "a11y": {
        await page
          .getByRole(condition.role as "button", { name: condition.name })
          .first()
          .waitFor({
            state: "visible",
            timeout: Math.min(condition.timeoutMs, 60_000),
          });
        return;
      }
      default: {
        const _exhaustive: never = condition;
        throw new Error(`Unknown wait: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  async checkpoint(spec: CheckpointSpec): Promise<CheckpointResult> {
    this.assertAutomation();
    const page = this.getPage();
    const url = page.url();
    const expectedParts: string[] = [spec.description];
    const observedParts: string[] = [`url=${url}`];

    if (spec.urlPattern) {
      expectedParts.push(`url~/${spec.urlPattern}/`);
      const ok = new RegExp(spec.urlPattern).test(url);
      if (!ok) {
        return {
          passed: false,
          expected: expectedParts.join("; "),
          observed: observedParts.join("; "),
        };
      }
    }

    if (spec.a11yIncludes?.length) {
      const obs = await this.observe();
      const blob = JSON.stringify(obs.a11yTree ?? {}) + (obs.ariaSnapshot ?? "");
      for (const item of spec.a11yIncludes) {
        expectedParts.push(`a11y:${item.role ?? "*"}:${item.name}`);
        const nameOk = blob.toLowerCase().includes(item.name.toLowerCase());
        const roleOk = item.role ? blob.toLowerCase().includes(item.role.toLowerCase()) : true;
        if (!nameOk || !roleOk) {
          observedParts.push(`missing ${item.role ?? ""} ${item.name}`);
          return {
            passed: false,
            expected: expectedParts.join("; "),
            observed: observedParts.join("; "),
          };
        }
      }
    }

    return {
      passed: true,
      expected: expectedParts.join("; "),
      observed: observedParts.join("; "),
    };
  }

  async captureEvidence(reason: string, dir?: string): Promise<EvidenceRefs> {
    const page = this.getPage();
    const base = dir ?? this.opts.evidenceDir ?? path.join("tmp", "surface", this.sessionId);
    await fs.mkdir(base, { recursive: true });
    const stamp = Date.now();
    const screenshotPath = path.join(base, `${stamp}-${reason}.png`);
    const a11yPath = path.join(base, `${stamp}-${reason}.a11y.json`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    const obs = await this.observe();
    await fs.writeFile(
      a11yPath,
      JSON.stringify(
        { reason, url: obs.url, title: obs.title, a11yTree: obs.a11yTree, ariaSnapshot: obs.ariaSnapshot },
        null,
        2,
      ),
      "utf8",
    );

    return { screenshotPath, a11yPath };
  }

  async pauseForHuman(): Promise<void> {
    this.ownerState = "transferring";
    // Keep browser context + page alive; HITL uses the same session.
    this.ownerState = "human";
    logger.info({ sessionId: this.sessionId }, "surface paused for human");
  }

  async resumeFromHuman(): Promise<void> {
    this.ownerState = "transferring";
    this.ownerState = "automation";
    logger.info({ sessionId: this.sessionId }, "surface resumed by automation");
  }

  /**
   * Best-effort capture of human interactions on the live page while owner=human.
   * Not a full co-browse recorder — clicks/keys/nav only.
   */
  async beginHumanActionCapture(
    onAction: (action: HumanActionRecord) => void,
  ): Promise<() => void> {
    const page = this.getPage();
    const onNav = (frame: { url: () => string }) => {
      if (frame === page.mainFrame()) {
        onAction({
          at: new Date().toISOString(),
          kind: "navigation",
          detail: frame.url(),
        });
      }
    };
    page.on("framenavigated", onNav);

    await page.exposeBinding("__cuaHitlRecord", (_source, kind: string, detail: string) => {
      if (kind === "click" || kind === "keydown") {
        onAction({
          at: new Date().toISOString(),
          kind,
          detail: String(detail),
        });
      }
    }).catch(() => {
      // Binding may already exist if escalate called twice on same page
    });

    await page.evaluate(`(() => {
      const w = window;
      if (w.__cuaHitlInstalled) return;
      w.__cuaHitlInstalled = true;
      document.addEventListener(
        "click",
        (ev) => {
          const t = ev.target;
          const label =
            (t && t.getAttribute && t.getAttribute("aria-label")) ||
            (t && t.textContent && t.textContent.trim().slice(0, 80)) ||
            (t && t.tagName) ||
            "unknown";
          if (w.__cuaHitlRecord) w.__cuaHitlRecord("click", label);
        },
        true,
      );
      document.addEventListener(
        "keydown",
        (ev) => {
          if (w.__cuaHitlRecord) w.__cuaHitlRecord("keydown", ev.key);
        },
        true,
      );
    })()`);

    return () => {
      page.off("framenavigated", onNav);
    };
  }

  async dispose(): Promise<void> {
    try {
      if (this.page && this.dialogHandler) {
        this.page.off("dialog", this.dialogHandler);
      }
      await this.context?.close().catch(() => undefined);
      if (!this.opts.cdpUrl) {
        await this.browser?.close().catch(() => undefined);
      }
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }

  private async resolve(targetRef: string) {
    const target = this.targets.get(targetRef);
    if (!target) {
      throw new Error(`Unknown targetRef "${targetRef}" — register a MultiStrategyLocator first`);
    }
    return resolveLocator(this.getPage(), target, {
      timeoutMs: this.opts.defaultTimeoutMs,
    });
  }

  private assertAutomation(): void {
    if (this.ownerState !== "automation") {
      throw new Error(
        `Surface owned by "${this.ownerState}" — automation cannot act until resumeFromHuman()`,
      );
    }
  }
}

type AxCdpNode = {
  nodeId: string;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: string | number | boolean };
  description?: { value?: string };
  childIds?: string[];
  properties?: Array<{ name: string; value?: { value?: unknown } }>;
};

function axNodesToTree(nodes: AxCdpNode[]): A11yNode | null {
  if (!nodes.length) return null;
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const root = nodes[0];
  if (!root) return null;

  const walk = (node: AxCdpNode): A11yNode | null => {
    if (node.ignored) return null;
    const children = (node.childIds ?? [])
      .map((id) => byId.get(id))
      .filter((n): n is AxCdpNode => Boolean(n))
      .map(walk)
      .filter((n): n is A11yNode => Boolean(n));

    const out: A11yNode = {};
    if (node.role?.value) out.role = node.role.value;
    if (node.name?.value) out.name = node.name.value;
    if (node.value?.value !== undefined) out.value = String(node.value.value);
    if (node.description?.value) out.description = node.description.value;
    if (children.length) out.children = children;
    return out;
  };

  return walk(root);
}
