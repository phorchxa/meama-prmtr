import { useTranslation } from "react-i18next";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "./PageHeader";

export default function Reports() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("pages.reports.title")} subtitle={t("pages.reports.subtitle")} />
      <EmptyState />
    </div>
  );
}
