import { useTranslation } from "react-i18next";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "./PageHeader";

export default function Customers() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("pages.customers.title")} subtitle={t("pages.customers.subtitle")} />
      <EmptyState />
    </div>
  );
}
