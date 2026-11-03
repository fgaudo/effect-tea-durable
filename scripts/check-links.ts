// Checks every relative link of the repository's `.md` files, and fails on one whose target is missing.
// A link to a note is a path, which moving the note to the archive changes (`AGENTS.md`).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const skip = new Set(["node_modules", ".git"]);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (skip.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : name.endsWith(".md") ? [path] : [];
  });

const broken: string[] = [];
for (const file of files(root)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (target === undefined || /^(https?:|mailto:|#)/.test(target)) continue;
    const path = target.replace(/#.*$/, "");
    if (path === "") continue;
    if (!existsSync(resolve(dirname(file), decodeURIComponent(path)))) broken.push(`${file}: ${target}`);
  }
}

if (broken.length > 0) {
  console.error(broken.join("\n"));
  console.error(`${broken.length} broken link(s)`);
  process.exit(1);
}
console.log("every link resolves");
