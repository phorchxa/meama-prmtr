import { useTranslation } from "react-i18next";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "./PageHeader";

export default function Alerts() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("pages.alerts.title")} subtitle={t("pages.alerts.subtitle")} />
      <EmptyState />
    </div>
  );
}
