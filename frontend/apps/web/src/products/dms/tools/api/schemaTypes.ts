export type FieldType = 'number' | 'checkbox' | 'select';

export interface SchemaField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[]; // for select
  defaultValue?: any;
}

export interface SchemaConstant {
  id: string;
  label: string;
  value: number;
}

export interface ApplicationSchema {
  id: string;
  name: string;
  fields: SchemaField[];
  constants: SchemaConstant[];
  formula: string;
  breakdownTemplate: string;
}

export const DEFAULT_SCHEMA: ApplicationSchema[] = [
  {
    id: "app_home",
    name: "Home / Appartments",
    fields: [
      { id: "houses", label: "Number of Houses", type: "number", defaultValue: 1 }
    ],
    constants: [
      { id: "members", label: "Avg Members per House", value: 4 },
      { id: "lts_pp", label: "Liters per Person (LPD)", value: 150 }
    ],
    formula: "inputs.houses * constants.members * constants.lts_pp",
    breakdownTemplate: "{{inputs.houses}} houses × {{constants.members}} members × {{constants.lts_pp}} L/person"
  },
  {
    id: "app_schools",
    name: "Schools",
    fields: [
      { id: "occupancy", label: "Occupancy (Students + Staff)", type: "number", defaultValue: 100 }
    ],
    constants: [
      { id: "lts_pp", label: "Liters per Person", value: 45 }
    ],
    formula: "inputs.occupancy * constants.lts_pp",
    breakdownTemplate: "{{inputs.occupancy}} people × {{constants.lts_pp}} L/person"
  },
  {
    id: "app_commercial",
    name: "Commercial / Offices / Restaurants",
    fields: [
      { id: "footfall", label: "Daily Footfall", type: "number", defaultValue: 100 }
    ],
    constants: [
      { id: "lts_pp", label: "Liters per Person", value: 45 }
    ],
    formula: "inputs.footfall * constants.lts_pp",
    breakdownTemplate: "{{inputs.footfall}} footfall × {{constants.lts_pp}} L/person"
  },
  {
    id: "app_hospital",
    name: "Hospital",
    fields: [
      { id: "hospType", label: "Hospital Type", type: "select", options: ["OPD", "IPD"], defaultValue: "OPD" },
      { id: "footfall", label: "Daily Footfall (OPD)", type: "number", defaultValue: 100 },
      { id: "beds", label: "Number of Beds (IPD)", type: "number", defaultValue: 10 },
      { id: "dialysis", label: "Dialysis Facility", type: "checkbox", defaultValue: false },
      { id: "cancer", label: "Cancer Treatment", type: "checkbox", defaultValue: false },
      { id: "surgeries", label: "Surgeries", type: "checkbox", defaultValue: false }
    ],
    constants: [
      { id: "opd_lts", label: "OPD Liters/Person", value: 25 },
      { id: "ipd_lts", label: "IPD Liters/Bed", value: 400 },
      { id: "extra_lts", label: "Extra (Dialysis/Cancer)", value: 25 }
    ],
    formula: "inputs.hospType === 'OPD' ? (inputs.footfall * constants.opd_lts) : (inputs.beds * constants.ipd_lts) + (inputs.dialysis ? inputs.beds * constants.extra_lts : 0) + (inputs.cancer ? inputs.beds * constants.extra_lts : 0) + (inputs.surgeries ? inputs.beds * constants.extra_lts : 0)",
    breakdownTemplate: "Calculated based on {{inputs.hospType}}"
  },
  {
    id: "app_industries",
    name: "Industries",
    fields: [
      { id: "indType", label: "Treatment Type", type: "select", options: ["STP", "ETP"], defaultValue: "STP" },
      { id: "employees", label: "Number of Employees (STP)", type: "number", defaultValue: 50 },
      { id: "kitchen", label: "Include Kitchen (STP)", type: "checkbox", defaultValue: false },
      { id: "waterConsumed", label: "Water Consumed (ETP Liters)", type: "number", defaultValue: 1000 }
    ],
    constants: [
      { id: "stp_lts", label: "STP Liters/Emp", value: 45 },
      { id: "kitchen_lts", label: "Kitchen Liters/Emp", value: 15 }
    ],
    formula: "inputs.indType === 'ETP' ? inputs.waterConsumed : (inputs.employees * constants.stp_lts) + (inputs.kitchen ? inputs.employees * constants.kitchen_lts : 0)",
    breakdownTemplate: "Calculated based on {{inputs.indType}}"
  },
  {
    id: "app_resorts",
    name: "Resorts",
    fields: [
      { id: "rooms", label: "Number of Rooms", type: "number", defaultValue: 20 },
      { id: "kitchen", label: "Include Kitchen", type: "checkbox", defaultValue: false },
      { id: "pool", label: "Include Pool", type: "checkbox", defaultValue: false }
    ],
    constants: [
      { id: "persons", label: "Persons/Room", value: 3 },
      { id: "lts_pp", label: "Liters/Person", value: 80 },
      { id: "kitchen_lts", label: "Kitchen Liters/Person", value: 45 },
      { id: "pool_lts", label: "Pool Liters/Person", value: 45 }
    ],
    formula: "(inputs.rooms * constants.persons * constants.lts_pp) + (inputs.kitchen ? inputs.rooms * constants.persons * constants.kitchen_lts : 0) + (inputs.pool ? inputs.rooms * constants.persons * constants.pool_lts : 0)",
    breakdownTemplate: "{{inputs.rooms}} rooms × {{constants.persons}} persons × {{constants.lts_pp}} L/person + Extras"
  }
];
