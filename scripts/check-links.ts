// Checks every relative link of the repository's `.md` files, and every citation of a note in prose or in a comment
// (`decision 0029`) in its `.md` and `.ts` files, and fails on one whose target is missing. A link to a note is a
// path, which moving the note to the archive changes; a citation of a note deleted says so, as
// `decision 0082 (deleted; git keeps it)` (`AGENTS.md`).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const skip = new Set(["node_modules", ".git"]);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (skip.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(md|ts)$/.test(name) ? [path] : [];
  });

const notes = new Set<string>();
for (const dir of ["docs/decisions", "docs/decisions/archive"]) {
  const path = resolve(root, dir);
  if (!existsSync(path)) continue;
  for (const name of readdirSync(path)) {
    const number = /^(\d{4})-/.exec(name)?.[1];
    if (number !== undefined) notes.add(number);
  }
}

const broken: string[] = [];
for (const file of files(root)) {
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".md")) {
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (target === undefined || /^(https?:|mailto:|#)/.test(target)) continue;
      const path = target.replace(/#.*$/, "");
      if (path === "") continue;
      if (!existsSync(resolve(dirname(file), decodeURIComponent(path)))) broken.push(`${file}: ${target}`);
    }
  }
  for (const match of text.matchAll(/\bdecisions? (0\d{3}(?:,? (?:and |to )?0\d{3})*)/g)) {
    const numbers = match[1]?.match(/0\d{3}/g) ?? [];
    const window = text.slice(match.index, match.index + match[0].length + 40);
    for (const number of numbers) {
      if (notes.has(number) || window.includes("deleted")) continue;
      broken.push(`${file}: decision ${number} has no note, and is not said to be deleted`);
    }
  }
}

if (broken.length > 0) {
  console.error(broken.join("\n"));
  console.error(`${broken.length} broken link(s) or citation(s)`);
  process.exit(1);
}
console.log("every link and citation resolves");
