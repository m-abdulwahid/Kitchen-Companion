import { readFileSync } from "fs";
import { resolve } from "path";

let loaded = false;

/** Load root + local .env files into process.env without overwriting values already set. */
export function loadRootEnv() {
  if (loaded) return;
  loaded = true;
  const files = [
    resolve(process.cwd(), "..", ".env"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), ".env.local"),
  ];
  for (const file of files) {
    try {
      for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) continue;
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line
          .slice(index + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // File may not exist yet.
    }
  }
}
