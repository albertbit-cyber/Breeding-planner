export interface CertificatePartyInfo {
  name?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
}

export interface CertificateFindingRow {
  marker: string;
  outcome: string;
}

export interface LabCertificateTemplateData {
  templateVersion: "v1";
  certificateId: string;
  certificateNumber: string;
  verificationCode: string;
  issueDateIso: string;
  verificationUrl?: string;
  orderId: string;
  labId: string;
  snake: {
    id: string;
    name?: string;
    proHerperId?: string;
  };
  breeder: CertificatePartyInfo;
  testedGenes: string[];
  confirmedResults: CertificateFindingRow[];
}

export interface RenderedCertificateArtifact {
  format: "pdf";
  byteLength: number;
  sha256Hex: string;
  qrEmbedded: boolean;
  arrayBuffer: ArrayBuffer;
}
