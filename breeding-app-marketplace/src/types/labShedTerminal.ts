export type PendingShedPriority = "routine" | "priority" | "urgent";

export interface PendingShedTestItem {
  id: string;
  breederUserId: string;
  labId: string;
  snakeId: string;
  snakeDisplayId?: string;
  snakeName?: string;
  selectedTestIds: string[];
  selectedTestNames?: string[];
  priority: PendingShedPriority;
  sampleType: "shed" | "bellyScaleClip";
  notes?: string;
  selected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShedTerminalQuotedTest {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
}

export interface ShedTerminalQuotedItem {
  pendingItemId: string;
  snakeId: string;
  tests: ShedTerminalQuotedTest[];
  itemTotalCents: number;
  currency: string;
  priority: PendingShedPriority;
}

export interface ShedTerminalQuote {
  items: ShedTerminalQuotedItem[];
  subtotalCents: number;
  totalCents: number;
  currency: string;
}

export interface ShedSubmissionBatch {
  id: string;
  breederUserId: string;
  labId: string;
  pendingItemIds: string[];
  orderIds: string[];
  itemCount: number;
  totalCents: number;
  currency: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}
