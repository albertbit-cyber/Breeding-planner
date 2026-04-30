const path = require("path");
const { generateMarkdownReportPdf } = require("./render-markdown-report-pdf.cjs");

const rootDir = path.resolve(__dirname, "..");
const manualsDir = path.join(rootDir, "docs", "manuals");
const outputPath = path.join(
  manualsDir,
  "Breeding-Planner-User-Manual.pdf",
);

const reportFiles = [
  { file: "Breeding-Planner-User-Manual.md", label: "Breeding Planner User Manual" },
];

const result = generateMarkdownReportPdf({
  sourceDir: manualsDir,
  outputPath,
  reportFiles,
  cover: {
    title: "Breeding Planner",
    subtitle: "User Manual",
    description: "Generated from the breeder-side application manual in docs/manuals.",
    contentsHeading: "Included document:",
    note: "This PDF covers the breeder-facing Breeding Planner app and excludes the separate lab portal.",
  },
  footerLabel: "Breeding Planner User Manual",
});

console.log(result);
