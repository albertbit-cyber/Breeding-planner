export interface LabAddress {
  line1: string;
  line2?: string;
  city: string;
  stateOrRegion?: string;
  postalCode: string;
  country: string;
}

export interface BreederShippingContact {
  name: string;
  businessName?: string;
  address?: LabAddress;
  email?: string;
  phone?: string;
}

export interface LabShippingLabelData {
  orderId: string;
  orderNumber: string;
  labName: string;
  labAddress: LabAddress;
  breeder: BreederShippingContact;
  createdAt: string;
  sampleCount: number;
}

export interface LabSampleLabelData {
  sampleId: string;
  orderId: string;
  orderNumber: string;
  animalId: string;
  animalName?: string;
  breederName: string;
  requestedTests: string[];
  sampleStatus: string;
  qrPayload: string;
  sampleType: string;
  labName: string;
  instructionText?: string;
}

export interface RenderedLabelArtifact {
  format: "pdf";
  byteLength: number;
  sha256Hex: string;
  arrayBuffer: ArrayBuffer;
  pageCount: number;
  pageWidthMm: number;
  pageHeightMm: number;
}
