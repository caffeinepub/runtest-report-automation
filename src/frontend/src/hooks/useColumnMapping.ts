import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gps-tracker-custom-columns";

export interface ColumnMappingState {
  selectedColumns: string[];
  toggleColumn: (col: string) => void;
  selectAll: (cols: string[]) => void;
  clearAll: () => void;
  isSelected: (col: string) => boolean;
  getColumnValue: (
    rawRow: Record<string, string> | undefined,
    col: string,
  ) => string;
}

export function useColumnMapping(): ColumnMappingState {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedColumns));
    } catch {
      // ignore storage errors
    }
  }, [selectedColumns]);

  const toggleColumn = useCallback((col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  }, []);

  const selectAll = useCallback((cols: string[]) => {
    setSelectedColumns(cols);
  }, []);

  const clearAll = useCallback(() => {
    setSelectedColumns([]);
  }, []);

  const isSelected = useCallback(
    (col: string) => selectedColumns.includes(col),
    [selectedColumns],
  );

  const getColumnValue = useCallback(
    (rawRow: Record<string, string> | undefined, col: string): string => {
      if (!rawRow) return "N/A";
      return rawRow[col] ?? "N/A";
    },
    [],
  );

  return {
    selectedColumns,
    toggleColumn,
    selectAll,
    clearAll,
    isSelected,
    getColumnValue,
  };
}
