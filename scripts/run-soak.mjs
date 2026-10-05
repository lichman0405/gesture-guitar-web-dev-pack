import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "e2e/soak.spec.ts", "--reporter=list"], {
  stdio: "inherit", env: { ...process.env, GGW_SOAK: "1" },
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
