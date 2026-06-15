import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  numeric?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyTitle?: string;
}

export function DataTable<T>({ columns, rows, rowKey, emptyTitle }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }
  return (
    <div className="overflow-x-auto border border-meama-charcoal bg-meama-ivory">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-meama-charcoal bg-meama-roast text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-mono text-[9.5px] uppercase tracking-[0.22em] text-meama-muted ${
                  col.numeric ? "text-right" : ""
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-meama-charcoal last:border-0 transition-colors duration-100 hover:bg-meama-roast"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 text-meama-cream ${col.numeric ? "tabular text-right" : ""}`}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
