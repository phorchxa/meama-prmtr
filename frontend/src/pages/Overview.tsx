import { useTranslation } from "react-i18next";

import { KpiWidget, type KpiWidgetProps } from "../components/KpiWidget";
import { PageHeader } from "./PageHeader";

// Placeholder KPI grid. Phase 1 fetches GET /api/v1/overview.
const PLACEHOLDER_KPIS: KpiWidgetProps[] = [
  { label: "Revenue", value: 0, unit: "GEL", deltaPct: 0, trend: [0, 0, 0, 0] },
  { label: "Orders", value: 0, unit: "count", deltaPct: 0 },
  { label: "Avg Order Value", value: 0, unit: "GEL" },
  { label: "Active Customers", value: 0, unit: "count" },
  { label: "At-Risk Customers", value: 0, unit: "count" },
  { label: "Meta Ad Spend", value: 0, unit: "USD" },
];

export default function Overview() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("pages.overview.title")} subtitle={t("pages.overview.subtitle")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLACEHOLDER_KPIS.map((kpi) => (
          <KpiWidget key={kpi.label} {...kpi} />
        ))}
      </div>
    </div>
  );
}
