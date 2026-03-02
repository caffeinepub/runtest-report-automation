import Map "mo:core/Map";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Set "mo:core/Set";
import Migration "migration";

(with migration = Migration.run)
actor {
  type Model = {
    #N135;
    #N13;
    #N125;
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

  let reports = Map.empty<Text, ReportEntry>();
  let columnMapping : ColumnMapping = {
    displayColumns = List.empty<Text>();
  };

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
    reports.add(key, entry);
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
    reports.get(key);
  };

  public query ({ caller }) func getAllReports() : async [ReportEntry] {
    reports.values().toArray();
  };

  public query ({ caller }) func getReportsByModel(model : Model) : async [ReportEntry] {
    let filtered = reports.values().filter(
      func(report) {
        switch (model, report.model) {
          case (#N135, #N135) { true };
          case (#N13, #N13) { true };
          case (#N125, #N125) { true };
          case (_) { false };
        };
      }
    );
    filtered.toArray();
  };
  
  // Return unique unit count for accurate reporting.
  public query ({ caller }) func getUnitCount() : async Nat {
    let uniqueUnits = Set.empty<Text>();
    for (report in reports.values()) {
      uniqueUnits.add(report.unitId);
    };
    uniqueUnits.size();
  };
};
