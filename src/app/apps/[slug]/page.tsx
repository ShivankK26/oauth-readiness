import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideView } from "@/components/GuideView";
import { getGuide, listGuides } from "@/lib/guides";

export const dynamicParams = false;

export function generateStaticParams() {
  return listGuides().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = getGuide((await params).slug);
  return g ? { title: `${g.name} OAuth app setup guide · OAuth Readiness`, description: g.oneLiner } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  return <GuideView guide={guide} />;
}
