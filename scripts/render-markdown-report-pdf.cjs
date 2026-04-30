const fs = require("fs");
const path = require("path");
const { jsPDF } = require("jspdf");

function generateMarkdownReportPdf(config) {
  const {
    sourceDir,
    outputPath,
    reportFiles,
    cover = {},
    footerLabel = "Breeding Planner",
  } = config || {};

  if (!sourceDir || !outputPath) {
    throw new Error("sourceDir and outputPath are required.");
  }
  if (!Array.isArray(reportFiles) || !reportFiles.length) {
    throw new Error("reportFiles must contain at least one file.");
  }

  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 16;
  const marginRight = 16;
  const marginTop = 18;
  const marginBottom = 15;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const footerY = pageHeight - 8;

  let y = marginTop;

  function mmForFontSize(fontSize, factor = 1.18) {
    return fontSize * 0.352778 * factor;
  }

  function addPage() {
    doc.addPage();
    y = marginTop;
  }

  function ensureSpace(height) {
    if (y + height > pageHeight - marginBottom) {
      addPage();
    }
  }

  function normalizeInline(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1");
  }

  function writeWrappedText(text, options = {}) {
    const {
      font = "helvetica",
      style = "normal",
      fontSize = 10,
      indent = 0,
      spacingAfter = 1.4,
    } = options;
    const x = marginLeft + indent;
    const maxWidth = contentWidth - indent;
    const lineHeight = mmForFontSize(fontSize);
    const lines = doc.splitTextToSize(normalizeInline(text), maxWidth);

    doc.setFont(font, style);
    doc.setFontSize(fontSize);
    doc.setTextColor(20, 20, 20);

    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, x, y);
      y += lineHeight;
    }

    y += spacingAfter;
  }

  function writeRule() {
    ensureSpace(4);
    doc.setDrawColor(170, 170, 170);
    doc.setLineWidth(0.25);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 4;
  }

  function parseTableRow(line) {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => normalizeInline(cell.trim()));
  }

  function isTableSeparator(line) {
    return /^\|\s*[:\-| ]+\|?\s*$/.test(line.trim());
  }

  function renderTable(lines) {
    const rows = lines.filter((line) => !isTableSeparator(line)).map(parseTableRow);
    if (!rows.length) {
      return;
    }

    const columnCount = rows[0].length;
    const columnWidth = contentWidth / columnCount;
    const baseFontSize = 9;
    const lineHeight = mmForFontSize(baseFontSize, 1.15);

    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell) =>
        doc.splitTextToSize(cell || " ", columnWidth - 3),
      );
      const rowLineCount = Math.max(...cellLines.map((cell) => cell.length));
      const rowHeight = Math.max(7, rowLineCount * lineHeight + 3);

      ensureSpace(rowHeight);

      let x = marginLeft;
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const isHeader = rowIndex === 0;
        doc.setDrawColor(190, 190, 190);
        doc.setLineWidth(0.2);
        if (isHeader) {
          doc.setFillColor(242, 242, 242);
          doc.rect(x, y, columnWidth, rowHeight, "FD");
        } else {
          doc.rect(x, y, columnWidth, rowHeight);
        }

        doc.setFont("helvetica", isHeader ? "bold" : "normal");
        doc.setFontSize(baseFontSize);
        doc.setTextColor(20, 20, 20);
        const linesForCell = cellLines[columnIndex];
        linesForCell.forEach((cellLine, lineIndex) => {
          doc.text(cellLine, x + 1.5, y + 4 + lineIndex * lineHeight);
        });
        x += columnWidth;
      }

      y += rowHeight;
    });

    y += 2.2;
  }

  function renderCodeBlock(lines) {
    const fontSize = 8.5;
    const lineHeight = mmForFontSize(fontSize, 1.12);
    const x = marginLeft + 3;
    const width = contentWidth - 6;

    const wrappedLines = [];
    for (const line of lines) {
      const normalized = line.replace(/\t/g, "  ");
      const split = doc.splitTextToSize(normalized || " ", width);
      wrappedLines.push(...split);
    }

    const height = wrappedLines.length * lineHeight + 5;
    ensureSpace(height);

    doc.setDrawColor(225, 225, 225);
    doc.setFillColor(248, 248, 248);
    doc.rect(marginLeft, y, contentWidth, height, "FD");
    doc.setFont("courier", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(40, 40, 40);

    wrappedLines.forEach((line, index) => {
      doc.text(line, x, y + 4 + index * lineHeight);
    });

    y += height + 2.2;
  }

  function renderSection(section) {
    const filePath = path.join(sourceDir, section.file);
    const content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
    const lines = content.split("\n");

    ensureSpace(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(10, 10, 10);
    doc.text(section.label, marginLeft, y);
    y += 7.5;
    writeRule();

    let index = 0;
    while (index < lines.length) {
      const rawLine = lines[index];
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        y += 1.8;
        index += 1;
        continue;
      }

      if (line.startsWith("```")) {
        const codeLines = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith("```")) {
          codeLines.push(lines[index]);
          index += 1;
        }
        index += 1;
        renderCodeBlock(codeLines);
        continue;
      }

      if (line.startsWith("|")) {
        const tableLines = [];
        while (index < lines.length && lines[index].trim().startsWith("|")) {
          tableLines.push(lines[index]);
          index += 1;
        }
        renderTable(tableLines);
        continue;
      }

      if (line.startsWith("# ")) {
        writeWrappedText(line.slice(2), {
          fontSize: 17,
          style: "bold",
          spacingAfter: 1.8,
        });
        index += 1;
        continue;
      }

      if (line.startsWith("## ")) {
        writeWrappedText(line.slice(3), {
          fontSize: 13,
          style: "bold",
          spacingAfter: 1.2,
        });
        index += 1;
        continue;
      }

      if (line.startsWith("### ")) {
        writeWrappedText(line.slice(4), {
          fontSize: 11.5,
          style: "bold",
          spacingAfter: 1,
        });
        index += 1;
        continue;
      }

      if (/^\d+\.\s/.test(line)) {
        writeWrappedText(line, {
          fontSize: 10,
          indent: 2,
        });
        index += 1;
        continue;
      }

      if (/^-\s/.test(line)) {
        writeWrappedText(line.replace(/^- /, "- "), {
          fontSize: 10,
          indent: 2,
        });
        index += 1;
        continue;
      }

      writeWrappedText(line, { fontSize: 10 });
      index += 1;
    }
  }

  function renderCoverPage() {
    const today = new Date().toISOString().slice(0, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(10, 10, 10);
    doc.text(cover.title || "Breeding Planner", pageWidth / 2, 38, {
      align: "center",
    });

    doc.setFontSize(18);
    doc.text(cover.subtitle || "Report", pageWidth / 2, 50, {
      align: "center",
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(45, 45, 45);
    doc.text(
      cover.description || "Generated from Markdown sources in the repository.",
      pageWidth / 2,
      61,
      { align: "center" },
    );
    doc.text(`Generated on ${today}`, pageWidth / 2, 68, {
      align: "center",
    });

    y = 88;
    writeWrappedText(cover.contentsHeading || "Included sections:", {
      fontSize: 12,
      style: "bold",
      spacingAfter: 1.5,
    });

    reportFiles.forEach((section) => {
      writeWrappedText(`- ${section.label}`, {
        fontSize: 10.5,
        indent: 2,
        spacingAfter: 1,
      });
    });

    y += 4;
    writeRule();
    writeWrappedText(
      cover.note || "This PDF is a distribution copy of documentation stored in the repository.",
      {
        fontSize: 10.5,
        spacingAfter: 0,
      },
    );
  }

  function addFooters() {
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text(footerLabel, marginLeft, footerY);
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - marginRight, footerY, {
        align: "right",
      });
    }
  }

  renderCoverPage();
  for (let index = 0; index < reportFiles.length; index += 1) {
    addPage();
    renderSection(reportFiles[index]);
  }
  addFooters();

  fs.writeFileSync(outputPath, Buffer.from(doc.output("arraybuffer")));
  return outputPath;
}

module.exports = {
  generateMarkdownReportPdf,
};
