import { Command } from "commander";
import { registerDiscoverCommand } from "./commands/discover.js";
import { registerReplayCommand } from "./commands/replay.js";
import { registerHitlMockCommand } from "./commands/hitlMock.js";

const program = new Command();

program
  .name("cua")
  .description(
    "Computer-use automation: discover → capability artifact → deterministic replay",
  )
  .version("0.1.0");

registerDiscoverCommand(program);
registerReplayCommand(program);
registerHitlMockCommand(program);

await program.parseAsync(process.argv);
