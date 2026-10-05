import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { DesignSystemGallery } from "@/widgets/design-system-gallery";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/**
 * Developer-only Design System Gallery: http://localhost:3000/en/dev/design-system
 * Production builds answer 404, so it is never exposed to users.
 */
export default async function DesignSystemPage({
  params,
}: PageProps<"/[locale]/dev/design-system">) {
  if (process.env.NODE_ENV === "production") notFound();
  await resolveLocaleParam(params);
  return <DesignSystemGallery />;
}
