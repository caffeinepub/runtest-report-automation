import Map "mo:core/Map";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Migration "migration";

(with migration = Migration.run)
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

  let reports = Map.empty<Text, ReportEntry>();

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

  public query ({ caller }) func getReport(unitId : Text, weekYear : Text) : async ?ReportEntry {
    let key = unitId.concat("-").concat(weekYear);
    reports.get(key);
  };

  public query ({ caller }) func getAllReports() : async [ReportEntry] {
    reports.values().toArray();
  };
};
