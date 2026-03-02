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
    model: Model;
    validGpsFixPkts: bigint;
    weekYear: string;
    unitId: string;
    normalPktCount: bigint;
    totalPkts: bigint;
    storedPkts: bigint;
    storedPktCount: bigint;
    location: string;
    flavour: Flavour;
}
export enum Flavour {
    aqi = "aqi",
    premium = "premium",
    deluxe = "deluxe",
    standard = "standard"
}
export enum Model {
    N13 = "N13",
    N125 = "N125",
    N135 = "N135"
}
export interface backendInterface {
    addDisplayColumn(columnName: string): Promise<void>;
    getAllReports(): Promise<Array<ReportEntry>>;
    getDisplayColumns(): Promise<Array<string>>;
    getReport(unitId: string, weekYear: string): Promise<ReportEntry | null>;
    getReportsByModel(model: Model): Promise<Array<ReportEntry>>;
    getUnitCount(): Promise<bigint>;
    removeDisplayColumn(columnName: string): Promise<void>;
    upsertBatchReport(entries: Array<[Model, Flavour, string, string, bigint, bigint, bigint, bigint, bigint, string]>): Promise<void>;
    upsertReport(model: Model, flavour: Flavour, unitId: string, weekYear: string, totalPkts: bigint, storedPkts: bigint, validGpsFixPkts: bigint, storedPktCount: bigint, normalPktCount: bigint, location: string): Promise<void>;
}
