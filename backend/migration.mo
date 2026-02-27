import Map "mo:core/Map";
import Nat "mo:core/Nat";

module {
  // Old report type without storedPkts.
  type OldReportEntry = {
    unitModel : {
      #N135;
      #N13;
      #N125;
    };
    unitId : Text;
    weekYear : Text;
    totalPkts : Nat;
    storedPkts : Nat;
    validGpsFixPkts : Nat;
    normalPktCount : Nat;
  };

  // Old actor type
  type OldActor = {
    reports : Map.Map<Text, OldReportEntry>;
  };

  // New report type with storedPkts field.
  type NewReportEntry = {
    unitModel : {
      #N135;
      #N13;
      #N125;
    };
    unitId : Text;
    weekYear : Text;
    totalPkts : Nat;
    storedPkts : Nat;
    validGpsFixPkts : Nat;
    storedPktCount : Nat;
    normalPktCount : Nat;
  };

  // New actor type
  type NewActor = {
    reports : Map.Map<Text, NewReportEntry>;
  };

  // Migration function called by the main actor via the with-clause
  public func run(old : OldActor) : NewActor {
    // Transform old entries to new entries (add storedPktCount with default 0)
    let newReports = old.reports.map<Text, OldReportEntry, NewReportEntry>(
      func(_key, oldReport) {
        { oldReport with storedPktCount = 0 };
      }
    );
    { reports = newReports };
  };
};
