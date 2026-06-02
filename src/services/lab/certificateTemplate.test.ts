import { describe, expect, it } from "vitest";
import { buildLabCertificateTemplateData } from "./certificateTemplate";

describe("buildLabCertificateTemplateData", () => {
  const order = {
    id: "order-1",
    labId: "lab-1",
    animalId: "snake-1",
    orderNumber: "ORDER-1",
    status: "completed",
    requestedTests: ["Clown", "Pied", "Lavender Albino"],
    priority: "routine",
    sampleIds: ["sample-1"],
    resultIds: ["result-1"],
    createdAt: "2026-04-24T09:00:00.000Z",
    updatedAt: "2026-04-24T09:00:00.000Z",
  } as any;

  const breeder = {
    name: "Albert Bitton",
    addressLine1: "Main Street 1",
    postalCode: "1000",
    city: "Brussels",
    country: "Belgium",
  };

  it("maps certificate rows to gene-specific result and genotype labels", () => {
    const template = buildLabCertificateTemplateData({
      order,
      result: {
        id: "result-1",
        testCode: "shed_panel_v1",
        reportedAt: "2026-04-24T09:30:00.000Z",
        findings: [
          { marker: "Clown", sourceOrderedName: "Clown", outcome: "carrierDetected" },
          { marker: "Pied", sourceOrderedName: "Pied", outcome: "positive" },
          { marker: "Lavender Albino", sourceOrderedName: "Lavender Albino", outcome: "notDetected" },
        ],
      } as any,
      certificateId: "cert-1",
      certificateNumber: "CERT-1",
      verificationCode: "VERIFY-1",
      breeder,
      snake: {
        id: "snake-1",
        displayId: "ARUN-01",
        morphs: ["GHI"],
        hets: ["Clown"],
      },
    });

    expect(template.resultRows).toHaveLength(3);
    expect(template.resultRows[0]).toMatchObject({
      test: "Clown",
      phenotype: "Clown",
      snakeId: "ARUN-01",
      morph: "GHI, Het Clown",
      result: "Het Clown",
      genotype: "Het Clown",
    });
    expect(template.resultRows[1]).toMatchObject({
      test: "Pied",
      phenotype: "Pied",
      result: "Pied",
      genotype: "Pied",
    });
    expect(template.resultRows[2]).toMatchObject({
      test: "Lavender Albino",
      phenotype: "Lavender Albino",
      result: "Negative",
      genotype: "Negative",
    });
    expect(template.resultRows[0].testNumber).toMatch(/^\d{6}[A-Z]{2}\d{4}A$/);
    expect(template.resultRows[1].testNumber).toMatch(/^\d{6}[A-Z]{2}\d{4}B$/);
    expect(template.resultRows[2].testNumber).toMatch(/^\d{6}[A-Z]{2}\d{4}C$/);
    expect(template.resultRows[0].testCode).toBe(template.resultRows[0].testNumber);
  });
});
