import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npm.cmd" : "npm";

const result = spawnSync(command, ["run", "build"], {
  env: {
    ...process.env,
    NEXT_OUTPUT_STANDALONE: "true"
  },
  stdio: "inherit"
});

process.exit(result.status ?? 1);
