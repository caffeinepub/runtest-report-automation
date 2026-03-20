import Map "mo:core/Map";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Set "mo:core/Set";

actor {

  // ── Old types kept only for stable-memory migration ──────────────────────────
  // These mirror the shape of data stored before this upgrade.
  // Remove in the NEXT schema-breaking upgrade once reportsLegacy is empty.

  type ModelOld = { #N135; #N13; #N125 };

  type ReportEntryOld = {
    model : ModelOld;
    flavour : Flavour;
    weekYear : Text;
    unitId : Text;
    totalPkts : Nat;
    storedPkts : Nat;
    validGpsFixPkts : Nat;
    storedPktCount : Nat;
    normalPktCount : Nat;
    location : Text;
  };

  // ── Current types ─────────────────────────────────────────────────────────────

  type Model = {
    #N135;
    #N13;
    #N125;
    #others;
  };

  type Flavour = {
    #standard;
    #premium;
    #deluxe;
    #aqi;
  };

  type ReportEntry = {
    model : Model;
    flavour : Flavour;
    weekYear : Text;
    unitId : Text;
    totalPkts : Nat;
    storedPkts : Nat;
    validGpsFixPkts : Nat;
    storedPktCount : Nat;
    normalPktCount : Nat;
    location : Text;
  };

  type ColumnMapping = {
    displayColumns : List.List<Text>;
  };

  // ── Stable storage ────────────────────────────────────────────────────────────
  // `reports` uses the OLD ReportEntry type so existing data can be deserialized.
  // After postupgrade runs it will be empty; only `reportsV2` is used going forward.
  let reports = Map.empty<Text, ReportEntryOld>();

  // New primary store with updated Model type.
  let reportsV2 = Map.empty<Text, ReportEntry>();

  let columnMapping : ColumnMapping = {
    displayColumns = List.empty<Text>();
  };

  // ── Migration ─────────────────────────────────────────────────────────────────
  // Runs once on upgrade: copy old records into reportsV2, then clear the old map.

  system func postupgrade() {
    for ((key, entry) in reports.entries()) {
      let newModel : Model = switch (entry.model) {
        case (#N135) { #N135 };
        case (#N13)  { #N13  };
        case (#N125) { #N125 };
      };
      reportsV2.add(key, {
        model           = newModel;
        flavour         = entry.flavour;
        weekYear        = entry.weekYear;
        unitId          = entry.unitId;
        totalPkts       = entry.totalPkts;
        storedPkts      = entry.storedPkts;
        validGpsFixPkts = entry.validGpsFixPkts;
        storedPktCount  = entry.storedPktCount;
        normalPktCount  = entry.normalPktCount;
        location        = entry.location;
      });
    };
    reports.clear();
  };

  // ── Public API ────────────────────────────────────────────────────────────────
  // All methods below use reportsV2.

  public shared ({ caller }) func upsertReport(
    model : Model,
    flavour : Flavour,
    unitId : Text,
    weekYear : Text,
    totalPkts : Nat,
    storedPkts : Nat,
    validGpsFixPkts : Nat,
    storedPktCount : Nat,
    normalPktCount : Nat,
    location : Text,
  ) : async () {
    let key = unitId.concat("-").concat(weekYear);
    let entry = {
      model;
      flavour;
      unitId;
      weekYear;
      totalPkts;
      storedPkts;
      validGpsFixPkts;
      storedPktCount;
      normalPktCount;
      location;
    };
    reportsV2.add(key, entry);
  };

  public shared ({ caller }) func upsertBatchReport(
    entries : [
      (Model, Flavour, Text, Text, Nat, Nat, Nat, Nat, Nat, Text)
    ]
  ) : async () {
    for ((model, flavour, unitId, weekYear, totalPkts, storedPkts, validGpsFixPkts, storedPktCount, normalPktCount, location) in entries.values()) {
      await upsertReport(model, flavour, unitId, weekYear, totalPkts, storedPkts, validGpsFixPkts, storedPktCount, normalPktCount, location);
    };
  };

  public shared ({ caller }) func addDisplayColumn(columnName : Text) : async () {
    columnMapping.displayColumns.add(columnName);
  };

  public shared ({ caller }) func removeDisplayColumn(columnName : Text) : async () {
    let filteredColumns = columnMapping.displayColumns.filter(func(name) { name != columnName });
    columnMapping.displayColumns.clear();
    for (name in filteredColumns.values()) {
      columnMapping.displayColumns.add(name);
    };
  };

  public query ({ caller }) func getDisplayColumns() : async [Text] {
    columnMapping.displayColumns.toArray();
  };

  public query ({ caller }) func getReport(unitId : Text, weekYear : Text) : async ?ReportEntry {
    let key = unitId.concat("-").concat(weekYear);
    reportsV2.get(key);
  };

  public query ({ caller }) func getAllReports() : async [ReportEntry] {
    reportsV2.values().toArray();
  };

  public query ({ caller }) func getReportsByModel(model : Model) : async [ReportEntry] {
    let filtered = reportsV2.values().filter(
      func(report) {
        switch (model, report.model) {
          case (#N135,  #N135)  { true };
          case (#N13,   #N13)   { true };
          case (#N125,  #N125)  { true };
          case (#others, #others) { true };
          case (_) { false };
        };
      }
    );
    filtered.toArray();
  };

  public query ({ caller }) func getUnitCount() : async Nat {
    let uniqueUnits = Set.empty<Text>();
    for (report in reportsV2.values()) {
      uniqueUnits.add(report.unitId);
    };
    uniqueUnits.size();
  };

  public shared ({ caller }) func clearAllData() : async () {
    reportsV2.clear();
    columnMapping.displayColumns.clear();
  };
};
