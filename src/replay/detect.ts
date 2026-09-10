import type { OutcomeDetector, RecoveryRule } from "../artifact/schema.js";
import type { Observation } from "../surface/types.js";

export type MatchContext = {
  url: string;
  observation: Observation;
  pageText?: string;
};

function blob(ctx: MatchContext): string {
  return [
    ctx.url,
    ctx.pageText ?? "",
    ctx.observation.ariaSnapshot ?? "",
    JSON.stringify(ctx.observation.a11yTree ?? {}),
  ]
    .join("\n")
    .toLowerCase();
}

export function matchOutcome(
  detectors: OutcomeDetector[],
  ctx: MatchContext,
): OutcomeDetector | null {
  const text = blob(ctx);
  for (const d of detectors) {
    if (d.urlPattern && !new RegExp(d.urlPattern, "i").test(ctx.url)) {
      continue;
    }
    if (d.bannerText && !text.includes(d.bannerText.toLowerCase())) {
      continue;
    }
    if (d.a11yIncludesAny?.length) {
      const hit = d.a11yIncludesAny.some((s) => text.includes(s.toLowerCase()));
      if (!hit) continue;
    }
    // If only code/description with no matchers, skip
    if (!d.urlPattern && !d.bannerText && !d.a11yIncludesAny?.length) continue;
    return d;
  }
  return null;
}

export function matchRecovery(
  recoveries: RecoveryRule[],
  ctx: MatchContext,
): RecoveryRule | null {
  const text = blob(ctx);
  for (const r of recoveries) {
    if (r.when.urlPattern && !new RegExp(r.when.urlPattern, "i").test(ctx.url)) {
      continue;
    }
    if (r.when.a11yIncludesAny?.length) {
      const hit = r.when.a11yIncludesAny.some((s) => text.includes(s.toLowerCase()));
      if (!hit) continue;
    }
    if (!r.when.urlPattern && !r.when.a11yIncludesAny?.length) continue;
    return r;
  }
  return null;
}
