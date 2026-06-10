import { useTranslation } from "react-i18next";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "./PageHeader";

export default function Stock() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("pages.stock.title")} subtitle={t("pages.stock.subtitle")} />
      <EmptyState />
    </div>
  );
}
