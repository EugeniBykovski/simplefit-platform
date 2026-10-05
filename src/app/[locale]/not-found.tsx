import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { Button } from "@/shared/ui/button";

export default function NotFound() {
  const t = useTranslations("errors.notFound");
  const actions = useTranslations("actions");

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-start justify-center gap-4 px-4"
    >
      <p className="type-label text-faint-foreground">404</p>
      <h1 className="type-h1">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Button asChild variant="outline">
        <Link href="/">{actions("backToHome")}</Link>
      </Button>
    </main>
  );
}
