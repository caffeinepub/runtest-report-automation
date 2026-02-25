import Map "mo:core/Map";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Runtime "mo:core/Runtime";

actor {
  type UnitModel = {
    #N135;
    #N13;
    #N125;
  };

  type ReportEntry = {
    unitModel : UnitModel;
    unitId : Text;
    weekYear : Text; // Format like "2024-W12"
    totalPkts : Nat;
    storedPkts : Nat;
    validGpsFixPkts : Nat;
  };

  let reports = Map.empty<Text, ReportEntry>();

  public shared ({ caller }) func createReport(unit : UnitModel, id : Text, week : Text, total : Nat, stored : Nat, valid : Nat) : async () {
    let key = id.concat("-").concat(week);
    if (reports.containsKey(key)) {
      Runtime.trap("Report entry already exists for this unit and week");
    };
    let entry = {
      unitModel = unit;
      unitId = id;
      weekYear = week;
      totalPkts = total;
      storedPkts = stored;
      validGpsFixPkts = valid;
    };
    reports.add(key, entry);
  };

  public shared ({ caller }) func updateReport(unit : UnitModel, id : Text, week : Text, total : Nat, stored : Nat, valid : Nat) : async () {
    let key = id.concat("-").concat(week);
    switch (reports.get(key)) {
      case (null) {
        Runtime.trap("No existing entry for this unit and week; create first");
      };
      case (?_) {
        let updatedEntry = {
          unitModel = unit;
          unitId = id;
          weekYear = week;
          totalPkts = total;
          storedPkts = stored;
          validGpsFixPkts = valid;
        };
        reports.add(key, updatedEntry);
      };
    };
  };

  public query ({ caller }) func getReport(unitId : Text, weekYear : Text) : async ?ReportEntry {
    let key = unitId.concat("-").concat(weekYear);
    reports.get(key);
  };

  public query ({ caller }) func getAllReports() : async [ReportEntry] {
    reports.values().toArray();
  };
};
