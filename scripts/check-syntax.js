const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PROJECT_ROOT = process.cwd();
const TARGET_DIRS = ["src", "public", "scripts"];

const files = [];
for (const dir of TARGET_DIRS) {
  const resolved = path.join(PROJECT_ROOT, dir);
  if (!fs.existsSync(resolved)) continue;
  collectJsFiles(resolved, files);
}

if (!files.length) {
  process.stdout.write("No JavaScript files found for syntax check.\n");
  process.exit(0);
}

for (const filePath of files) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    stdio: "pipe",
    encoding: "utf-8"
  });

  if (result.status !== 0) {
    process.stderr.write(`Syntax check failed: ${toRelative(filePath)}\n`);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

process.stdout.write(`Syntax check passed (${files.length} files).\n`);

function collectJsFiles(dirPath, output) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, output);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) {
      output.push(fullPath);
    }
  }
}

function toRelative(value) {
  return path.relative(PROJECT_ROOT, value).replaceAll("\\", "/");
}
