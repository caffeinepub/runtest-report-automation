import Map "mo:core/Map";
import List "mo:core/List";
import Text "mo:core/Text";

module {
  type FlavourOld = {
    #standard;
    #premium;
    #deluxe;
  };
  type FlavourNew = {
    #standard;
    #premium;
    #deluxe;
    #aqi;
  };

  type OldActor = {
    reports : Map.Map<Text, {
      model : {
        #N135;
        #N13;
        #N125;
      };
      flavour : FlavourOld;
      weekYear : Text;
      unitId : Text;
      totalPkts : Nat;
      storedPkts : Nat;
      validGpsFixPkts : Nat;
      storedPktCount : Nat;
      normalPktCount : Nat;
      location : Text;
    }>;
    columnMapping : {
      displayColumns : List.List<Text>;
    };
  };

  type NewActor = {
    reports : Map.Map<Text, {
      model : {
        #N135;
        #N13;
        #N125;
      };
      flavour : FlavourNew;
      weekYear : Text;
      unitId : Text;
      totalPkts : Nat;
      storedPkts : Nat;
      validGpsFixPkts : Nat;
      storedPktCount : Nat;
      normalPktCount : Nat;
      location : Text;
    }>;
    columnMapping : {
       displayColumns : List.List<Text>;
    };
  };

  public func run(old : OldActor) : NewActor {
    let newReports = old.reports.map<Text, {model : {#N135; #N13; #N125}; flavour : FlavourOld; weekYear : Text; unitId : Text; totalPkts : Nat; storedPkts : Nat; validGpsFixPkts : Nat; storedPktCount : Nat; normalPktCount : Nat; location : Text}, {model : {#N135; #N13; #N125}; flavour : FlavourNew; weekYear : Text; unitId : Text; totalPkts : Nat; storedPkts : Nat; validGpsFixPkts : Nat; storedPktCount : Nat; normalPktCount : Nat; location : Text}>(
      func(_key, oldReport) {
        {
          oldReport with
          flavour = switch (oldReport.flavour) {
            case (#standard) { #standard };
            case (#premium) { #premium };
            case (#deluxe) { #deluxe };
          }
        };
      }
    );
    {
      old with
      reports = newReports;
    };
  };
};
