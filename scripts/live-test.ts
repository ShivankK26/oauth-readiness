// Runs one live generation from the CLI: npx tsx --env-file=.env.local scripts/live-test.ts "<app>"
import { writeFileSync } from "node:fs";
import { generateGuide } from "../src/lib/agent";

const app = process.argv[2] ?? "Calendly";
const t0 = Date.now();
generateGuide(app, (e) => {
  if (e.type === "note") return;
  console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, JSON.stringify(e).slice(0, 300));
})
  .then((g) => {
    const out = process.argv[3] ?? `live-${g.slug}.json`;
    writeFileSync(out, JSON.stringify(g, null, 2));
    console.log(`DONE in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`);
  })
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  });
