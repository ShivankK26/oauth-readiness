import { Suspense } from "react";
import { LiveGenerator } from "@/components/LiveGenerator";

export const metadata = { title: "Generate a guide · OAuth Readiness" };

export default function GeneratePage() {
  return (
    <Suspense>
      <LiveGenerator />
    </Suspense>
  );
}
