// Validates guide JSON files against the schema and checks that every cited sourceId exists.
// Usage: npx tsx scripts/validate.ts [file ...]   (defaults to data/guides/*.json)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Guide } from "../src/lib/schema";

const dir = join(__dirname, "..", "data", "guides");
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));

let failed = 0;
for (const file of files) {
  const parsed = Guide.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    failed++;
    console.log(`FAIL ${file}`);
    for (const issue of parsed.error.issues.slice(0, 15)) console.log(`  ${issue.path.join(".")}: ${issue.message}`);
    continue;
  }
  const ids = new Set(parsed.data.sources.map((s) => s.id));
  const dangling = new Set<string>();
  JSON.stringify(parsed.data, (k, v) => {
    if (k === "sourceIds") for (const id of v) if (!ids.has(id)) dangling.add(id);
    return v;
  });
  if (dangling.size) {
    failed++;
    console.log(`FAIL ${file}: unknown sourceIds ${[...dangling].join(", ")}`);
  } else console.log(`ok   ${file}`);
}
process.exit(failed ? 1 : 0);
