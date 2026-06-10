import { useTranslation } from "react-i18next";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "./PageHeader";

export default function Actions() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("pages.actions.title")} subtitle={t("pages.actions.subtitle")} />
      <EmptyState />
    </div>
  );
}
