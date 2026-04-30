export interface CertificatePartyInfo {
  name?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  street?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateOrRegion?: string;
  postalCode?: string;
  country?: string;
}

export interface CertificateLabIssuerInfo {
  brandName: string;
  ownerName?: string;
  addressLine1?: string;
  addressLine2?: string;
  cityLine?: string;
  phone?: string;
  email?: string;
  iban?: string;
  bic?: string;
}

export interface CertificateResultRow {
  test: string;
  phenotype: string;
  testNumber: string;
  testDate: string;
  testCode: string;
  snakeId: string;
  morph?: string;
  result: string;
  genotype: string;
}

export interface LabCertificateTemplateData {
  templateVersion: "v2";
  certificateId: string;
  certificateNumber: string;
  verificationCode: string;
  issueDateIso: string;
  verificationUrl?: string;
  orderId: string;
  labId: string;
  issuer: CertificateLabIssuerInfo;
  snake: {
    id: string;
    displayId: string;
    name?: string;
    morph?: string;
  };
  breeder: CertificatePartyInfo;
  resultRows: CertificateResultRow[];
  disclaimers: string[];
}

export interface RenderedCertificateArtifact {
  format: "pdf";
  byteLength: number;
  sha256Hex: string;
  qrEmbedded: boolean;
  arrayBuffer: ArrayBuffer;
}
