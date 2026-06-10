import { useTranslation } from "react-i18next";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "./PageHeader";

export default function Ads() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("pages.ads.title")} subtitle={t("pages.ads.subtitle")} />
      <EmptyState />
    </div>
  );
}
