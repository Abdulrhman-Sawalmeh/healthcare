const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

const repoRoot = path.resolve(__dirname, "..");
const rootEnvPath = path.join(repoRoot, ".env");
const prismaCliPath = path.join(repoRoot, "node_modules", "prisma", "build", "index.js");

if (!existsSync(rootEnvPath)) {
  console.error("Root .env was not found. Prisma commands require the canonical repository configuration.");
  process.exit(1);
}

if (!existsSync(prismaCliPath)) {
  console.error("Prisma CLI was not found. Run npm install from the repository root first.");
  process.exit(1);
}

const rootEnv = dotenv.parse(readFileSync(rootEnvPath));
if (!rootEnv.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is missing from the root .env file.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [prismaCliPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: { ...process.env, ...rootEnv },
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
