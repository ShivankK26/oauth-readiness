import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const VerificationLog = z.object({
  checkedAt: z.string(),
  method: z.string(),
  claims: z.array(
    z.object({
      guide: z.string(),
      claim: z.string(),
      verdict: z.enum(["confirmed", "corrected", "unverifiable"]),
      finding: z.string(),
      sourceUrl: z.string(),
    })
  ),
});
export type VerificationLog = z.infer<typeof VerificationLog>;

export function getVerificationLog(): VerificationLog | null {
  const file = join(process.cwd(), "data", "verification.json");
  return existsSync(file) ? VerificationLog.parse(JSON.parse(readFileSync(file, "utf8"))) : null;
}
