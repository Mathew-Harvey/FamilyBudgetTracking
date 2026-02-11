/**
 * CSV Watcher Bot
 *
 * Monitors a folder for new ING CSV files and auto-imports them
 * into the Family Financial app.
 *
 * Usage:
 *   npx tsx scripts/csv-watcher.ts [--watch-dir <path>] [--account <name>] [--interval <seconds>]
 *
 * Examples:
 *   npx tsx scripts/csv-watcher.ts
 *   npx tsx scripts/csv-watcher.ts --watch-dir "C:\Users\mathe\Downloads" --account "ING Everyday"
 *   npx tsx scripts/csv-watcher.ts --interval 30
 *
 * The bot will:
 *   1. Watch the specified folder (default: ~/Downloads) for new .csv files
 *   2. Detect ING-format CSVs (has Date, Description, Credit/Debit or Amount columns)
 *   3. Auto-import them into the app via the API
 *   4. Move processed files to a "processed" subfolder to avoid re-importing
 */

import fs from "fs";
import path from "path";
import os from "os";

// --- Configuration ---
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const AUTH_EMAIL = process.env.AUTH_EMAIL || "admin@family.local";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "admin123";

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    watchDir: path.join(os.homedir(), "Downloads"),
    accountName: "",
    intervalSeconds: 15,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--watch-dir" && args[i + 1]) {
      config.watchDir = args[++i];
    } else if (args[i] === "--account" && args[i + 1]) {
      config.accountName = args[++i];
    } else if (args[i] === "--interval" && args[i + 1]) {
      config.intervalSeconds = parseInt(args[++i]) || 15;
    }
  }

  return config;
}

// --- Auth ---
let authCookie = "";

async function login(): Promise<boolean> {
  try {
    const res = await fetch(`${APP_URL}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: AUTH_EMAIL, password: AUTH_PASSWORD }),
    });

    if (!res.ok) {
      console.error("Login failed:", await res.text());
      return false;
    }

    // Extract the auth cookie from Set-Cookie header
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const cookie of setCookie) {
      if (cookie.startsWith("auth-token=")) {
        authCookie = cookie.split(";")[0];
        break;
      }
    }

    if (!authCookie) {
      console.error("No auth cookie received");
      return false;
    }

    const data = await res.json();
    console.log(`  Logged in as ${data.user.name} (${data.user.email})`);
    return true;
  } catch (err) {
    console.error("Login error:", err);
    return false;
  }
}

// --- API Helpers ---
async function getAccounts(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${APP_URL}/api/accounts`, {
    headers: { Cookie: authCookie },
  });
  const data = await res.json();
  return data.accounts || [];
}

async function importCSV(
  filePath: string,
  accountId: string
): Promise<{ ok: boolean; message: string }> {
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([fileContent], { type: "text/csv" }),
    fileName
  );
  formData.append("accountId", accountId);

  const res = await fetch(`${APP_URL}/api/transactions/import`, {
    method: "POST",
    headers: { Cookie: authCookie },
    body: formData,
  });

  const data = await res.json();
  return {
    ok: res.ok,
    message: data.message || data.error || "Unknown response",
  };
}

// --- CSV Detection ---
function isINGCsv(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const firstLine = content.split("\n")[0].toLowerCase();
    // ING CSVs have Date and Description columns
    return (
      firstLine.includes("date") &&
      firstLine.includes("description") &&
      (firstLine.includes("credit") ||
        firstLine.includes("debit") ||
        firstLine.includes("amount"))
    );
  } catch {
    return false;
  }
}

// --- File Tracking ---
const processedFiles = new Set<string>();

function getProcessedDir(watchDir: string): string {
  const dir = path.join(watchDir, "imported-to-budget");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function loadProcessedFiles(watchDir: string) {
  const processedDir = getProcessedDir(watchDir);
  try {
    const files = fs.readdirSync(processedDir);
    for (const f of files) {
      processedFiles.add(f);
    }
  } catch {
    // ignore
  }
}

function moveToProcessed(filePath: string, watchDir: string) {
  const processedDir = getProcessedDir(watchDir);
  const fileName = path.basename(filePath);
  const dest = path.join(processedDir, fileName);

  // Handle duplicate names
  let finalDest = dest;
  let counter = 1;
  while (fs.existsSync(finalDest)) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    finalDest = path.join(processedDir, `${base}_${counter}${ext}`);
    counter++;
  }

  fs.renameSync(filePath, finalDest);
  processedFiles.add(path.basename(finalDest));
  return finalDest;
}

// --- Main Loop ---
async function scanAndImport(watchDir: string, accountId: string) {
  let files: string[];
  try {
    files = fs.readdirSync(watchDir);
  } catch (err) {
    console.error(`Cannot read directory ${watchDir}:`, err);
    return;
  }

  const csvFiles = files.filter(
    (f) =>
      f.toLowerCase().endsWith(".csv") &&
      !processedFiles.has(f) &&
      !f.startsWith(".")
  );

  for (const fileName of csvFiles) {
    const filePath = path.join(watchDir, fileName);

    // Check if it's actually a file (not directory)
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    // Check if it looks like an ING CSV
    if (!isINGCsv(filePath)) {
      continue;
    }

    console.log(`\n  Found ING CSV: ${fileName}`);
    console.log(`  Importing...`);

    const result = await importCSV(filePath, accountId);

    if (result.ok) {
      console.log(`  ${result.message}`);
      const dest = moveToProcessed(filePath, watchDir);
      console.log(`  Moved to: ${path.basename(dest)}`);
    } else {
      console.error(`  Import failed: ${result.message}`);
    }
  }
}

// --- Entry Point ---
async function main() {
  const config = parseArgs();

  console.log("=================================");
  console.log("  CSV Watcher Bot");
  console.log("=================================");
  console.log(`  Watch folder: ${config.watchDir}`);
  console.log(`  Check interval: ${config.intervalSeconds}s`);
  console.log(`  App URL: ${APP_URL}`);
  console.log("");

  // Login
  console.log("  Logging in...");
  const loggedIn = await login();
  if (!loggedIn) {
    console.error("\nFailed to authenticate. Check your credentials.");
    console.error(
      "Set AUTH_EMAIL and AUTH_PASSWORD env vars, or use the default admin account."
    );
    process.exit(1);
  }

  // Get accounts
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    console.error(
      "\nNo accounts found. Create an account in Settings first."
    );
    process.exit(1);
  }

  // Select account
  let targetAccount = accounts[0];
  if (config.accountName) {
    const found = accounts.find(
      (a) => a.name.toLowerCase() === config.accountName.toLowerCase()
    );
    if (found) {
      targetAccount = found;
    } else {
      console.error(`\nAccount "${config.accountName}" not found.`);
      console.error("Available accounts:");
      accounts.forEach((a) => console.error(`  - ${a.name}`));
      process.exit(1);
    }
  }

  console.log(`  Importing to account: ${targetAccount.name}`);
  console.log("");

  // Ensure watch directory exists
  if (!fs.existsSync(config.watchDir)) {
    console.error(`Watch directory does not exist: ${config.watchDir}`);
    process.exit(1);
  }

  // Load already-processed files
  loadProcessedFiles(config.watchDir);

  console.log(
    `  Watching for new CSV files... (Ctrl+C to stop)\n`
  );

  // Initial scan
  await scanAndImport(config.watchDir, targetAccount.id);

  // Poll on interval
  setInterval(
    () => scanAndImport(config.watchDir, targetAccount.id),
    config.intervalSeconds * 1000
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
