import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Guide } from "./schema";

const dir = join(process.cwd(), "data", "guides");

export function listGuides(): Guide[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => Guide.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))))
    .sort((a, b) => DIFFICULTY_ORDER[a.verdict.difficulty] - DIFFICULTY_ORDER[b.verdict.difficulty] || a.name.localeCompare(b.name));
}

export function getGuide(slug: string): Guide | undefined {
  return listGuides().find((g) => g.slug === slug);
}

export const DIFFICULTY_ORDER = { easy: 0, moderate: 1, hard: 2, very_hard: 3 } as const;
