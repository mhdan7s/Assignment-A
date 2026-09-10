import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src", "cli", "index.ts");

function runCli(args: string[]) {
  // Avoid `npx`/`npm run` flag swallowing on Windows/npm 10+.
  return spawnSync(process.execPath, ["--import", "tsx", cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

describe("CLI smoke", () => {
  it("prints help and exits 0", () => {
    const result = runCli(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("discover");
    expect(result.stdout).toContain("replay");
    expect(result.stdout).toContain("hitl-mock");
  });

  it("discover stub exits 2 when args are provided", () => {
    const result = runCli([
      "discover",
      "--goal",
      "test goal",
      "--target",
      "http://127.0.0.1:4173",
    ]);
    expect(result.status).toBe(2);
  });
});
