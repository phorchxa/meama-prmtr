import { useTranslation } from "react-i18next";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "./PageHeader";

export default function Products() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("pages.products.title")} subtitle={t("pages.products.subtitle")} />
      <EmptyState />
    </div>
  );
}
