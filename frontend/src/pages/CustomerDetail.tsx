import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "./PageHeader";

export default function CustomerDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  return (
    <div>
      <Link to="/customers" className="text-sm text-meama-blue hover:underline">
        ← {t("pages.customerDetail.back")}
      </Link>
      <PageHeader title={`${t("pages.customerDetail.title")} ${id ?? ""}`} />
      <EmptyState />
    </div>
  );
}
