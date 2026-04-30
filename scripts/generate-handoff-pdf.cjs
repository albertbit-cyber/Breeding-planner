const path = require("path");
const { generateMarkdownReportPdf } = require("./render-markdown-report-pdf.cjs");

const rootDir = path.resolve(__dirname, "..");
const handoffDir = path.join(rootDir, "docs", "handoff");
const outputPath = path.join(
  handoffDir,
  "Breeding-Planner-Engineering-Handoff.pdf",
);

const reportFiles = [
  { file: "README.md", label: "Engineering Handoff" },
  { file: "architecture.md", label: "Architecture And Stack" },
  { file: "product-spec.md", label: "Product And Workflow Spec Audit" },
  { file: "backend-api-and-data.md", label: "Backend API And Data Model" },
  { file: "testing-and-quality.md", label: "Testing And Quality Audit" },
  { file: "decisions-and-risks.md", label: "Decisions, History, And Risks" },
];

const result = generateMarkdownReportPdf({
  sourceDir: handoffDir,
  outputPath,
  reportFiles,
  cover: {
    title: "Breeding Planner",
    subtitle: "Engineering Handoff Report",
    description: "Generated from docs/handoff Markdown sources in the repository.",
    contentsHeading: "Included sections:",
    note: "This PDF is a distribution copy of the repo handoff report for onboarding a new engineer into the Breeding Planner codebase.",
  },
  footerLabel: "Breeding Planner Engineering Handoff",
});

console.log(result);
