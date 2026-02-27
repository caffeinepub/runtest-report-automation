import Map "mo:core/Map";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import List "mo:core/List";
import Iter "mo:core/Iter";



actor {
  type UnitModel = {
    #N135;
    #N13;
    #N125;
  };

  type ReportEntry = {
    unitModel : UnitModel;
    weekYear : Text;
    unitId : Text;
    totalPkts : Nat;
    storedPkts : Nat;
    validGpsFixPkts : Nat;
    storedPktCount : Nat;
    normalPktCount : Nat;
  };

  type ColumnMapping = {
    displayColumns : List.List<Text>;
  };

  let reports = Map.empty<Text, ReportEntry>();
  let columnMapping : ColumnMapping = {
    displayColumns = List.empty<Text>();
  };

  public shared ({ caller }) func upsertReport(
    unit : UnitModel,
    id : Text,
    week : Text,
    total : Nat,
    stored : Nat,
    valid : Nat,
    storedPkts : Nat,
    normalPkts : Nat,
  ) : async () {
    let key = id.concat("-").concat(week);
    let entry = {
      unitModel = unit;
      unitId = id;
      weekYear = week;
      totalPkts = total;
      storedPkts = stored;
      validGpsFixPkts = valid;
      storedPktCount = storedPkts;
      normalPktCount = normalPkts;
    };
    reports.add(key, entry);
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
};
