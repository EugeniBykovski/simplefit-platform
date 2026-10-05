import { resolveLocaleParam } from "@/shared/i18n/params";
import { AppShell } from "@/widgets/app-shell";

export default async function AppLayout({ children, params }: LayoutProps<"/[locale]/app">) {
  await resolveLocaleParam(params);
  return <AppShell>{children}</AppShell>;
}
