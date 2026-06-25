export interface FulfillmentRecord {
  id: string;                  // unique requisition/record identifier
  raisedDate: Date;            // demand creation date
  fulfilledDate: Date | null;  // candidate joining date (null if not yet fulfilled)
  hiringType: "Internal" | "External";
  skillRaw: string;            // original free-text skill/role title
  skillCluster: string;        // resolved cluster name or "Unmapped — Needs Review"
  department: string | null;   // L3-equivalent business unit
  location: string | null;
  band: string | null;
  leadTimeDays: number | null; // derived or validated
  period: string | null;       // quarter/month label if present in source data
  sourceRowRef: number;        // original spreadsheet row number, for traceability in error reports
}

export interface ValidationError {
  row: number;
  reasons: string[];
  rowData?: {
    id?: string;
    raisedDate?: string;
    fulfilledDate?: string;
    hiringType?: string;
    skillRaw?: string;
    department?: string;
    location?: string;
    band?: string;
  };
}

export interface ValidationResult {
  validData: FulfillmentRecord[];
  errors: ValidationError[];
}
