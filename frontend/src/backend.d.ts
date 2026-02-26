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
    totalPkts: bigint;
    storedPkts: bigint;
}
export enum UnitModel {
    N13 = "N13",
    N125 = "N125",
    N135 = "N135"
}
export interface backendInterface {
    getAllReports(): Promise<Array<ReportEntry>>;
    getReport(unitId: string, weekYear: string): Promise<ReportEntry | null>;
    upsertReport(unit: UnitModel, id: string, week: string, total: bigint, stored: bigint, valid: bigint): Promise<void>;
}
