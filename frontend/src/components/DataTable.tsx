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
    <div className="overflow-x-auto rounded-lg border border-meama-gold/30 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-meama-gold/30 bg-meama-cream/60 text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-medium text-meama-brown ${
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
            <tr key={rowKey(row)} className="border-b border-meama-gold/10 last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 ${col.numeric ? "tabular text-right" : ""}`}
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
