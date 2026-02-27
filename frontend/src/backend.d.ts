import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface ReportEntry {
    unitModel: UnitModel;
    validGpsFixPkts: bigint;
    weekYear: string;
    unitId: string;
    normalPktCount: bigint;
    totalPkts: bigint;
    storedPkts: bigint;
    storedPktCount: bigint;
}
export enum UnitModel {
    N13 = "N13",
    N125 = "N125",
    N135 = "N135"
}
export interface backendInterface {
    addDisplayColumn(columnName: string): Promise<void>;
    getAllReports(): Promise<Array<ReportEntry>>;
    getDisplayColumns(): Promise<Array<string>>;
    getReport(unitId: string, weekYear: string): Promise<ReportEntry | null>;
    removeDisplayColumn(columnName: string): Promise<void>;
    upsertReport(unit: UnitModel, id: string, week: string, total: bigint, stored: bigint, valid: bigint, storedPkts: bigint, normalPkts: bigint): Promise<void>;
}
