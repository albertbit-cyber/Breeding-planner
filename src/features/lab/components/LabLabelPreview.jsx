import React from "react";
import {
  buildSampleLabelContent,
  buildSampleLabelLayout,
  buildShippingLabelContent,
  buildShippingLabelLayout,
  fitQrToBox,
  fitTextToBox,
  getPreviewScaleStyle,
  LABEL_LAYOUT_CONSTANTS,
} from "../utils/labelLayout";
import { getActiveLabelSize, getLabelSafeArea } from "../utils/labelSizing";

const boxStyle = (box, size) => ({
  position: "absolute",
  left: `${(box.xMm / size.widthMm) * 100}%`,
  top: `${(box.yMm / size.heightMm) * 100}%`,
  width: `${(box.widthMm / size.widthMm) * 100}%`,
  height: `${(box.heightMm / size.heightMm) * 100}%`,
  boxSizing: "border-box",
  padding: `${Math.max(2, LABEL_LAYOUT_CONSTANTS.innerPaddingMm * 2)}px`,
  overflow: "hidden",
});

const fittedStyle = (fitted) => ({
  fontSize: `${Math.max(9, fitted.fontSizePt * 1.45)}px`,
  lineHeight: 1.15,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

export function ShippingLabelPreview({ size, data, debug = false }) {
  const activeSize = getActiveLabelSize(size);
  const safeArea = getLabelSafeArea(activeSize, LABEL_LAYOUT_CONSTANTS.safeMarginMm);
  const layout = buildShippingLabelLayout(activeSize, safeArea);
  const content = buildShippingLabelContent(data);
  const destinationFit = fitTextToBox(content.destinationLines, layout.destinationBox, { maxLines: 7, maxFontPt: 12, minFontPt: 6 });
  const senderFit = fitTextToBox(content.senderLines, layout.senderBox, { maxLines: 6, maxFontPt: 11, minFontPt: 6 });

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-neutral-300 bg-white text-neutral-800 shadow-sm"
      style={getPreviewScaleStyle(activeSize.widthMm, activeSize.heightMm)}
    >
      {debug ? (
        <div
          className="absolute border border-rose-400 pointer-events-none"
          style={boxStyle({ xMm: safeArea.xMm, yMm: safeArea.yMm, widthMm: safeArea.widthMm, heightMm: safeArea.heightMm }, activeSize)}
        />
      ) : null}
      <div style={boxStyle(layout.destinationBox, activeSize)} className={debug ? "border border-sky-400" : ""}>
        <div style={fittedStyle(destinationFit)}>{destinationFit.lines.join("\n")}</div>
      </div>
      <div style={boxStyle(layout.senderBox, activeSize)} className={debug ? "border border-emerald-400" : ""}>
        <div style={fittedStyle(senderFit)}>{senderFit.lines.join("\n")}</div>
      </div>
    </div>
  );
}

export function SampleLabelPreview({ size, data, debug = false }) {
  const activeSize = getActiveLabelSize(size);
  const safeArea = getLabelSafeArea(activeSize, LABEL_LAYOUT_CONSTANTS.safeMarginMm);
  const layout = buildSampleLabelLayout(activeSize, safeArea);
  const content = buildSampleLabelContent(data);
  const orderFit = fitTextToBox(content.orderId, layout.orderIdBox, { maxLines: 2, maxFontPt: 10, minFontPt: 6 });
  const animalFit = fitTextToBox(content.animalId, layout.animalIdBox, { maxLines: 2, maxFontPt: 11, minFontPt: 6 });
  const breederFit = fitTextToBox(content.breederName, layout.breederNameBox, { maxLines: 2, maxFontPt: 9, minFontPt: 6 });
  const testsFit = fitTextToBox(content.requestedTests, layout.testsBox, { maxLines: layout.variant === "side-by-side" ? 6 : 5, maxFontPt: 8.5, minFontPt: 6 });
  const qrPlacement = fitQrToBox(layout.qrBox);

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-neutral-300 bg-white text-neutral-800 shadow-sm"
      style={getPreviewScaleStyle(activeSize.widthMm, activeSize.heightMm)}
    >
      {debug ? (
        <div
          className="absolute border border-rose-400 pointer-events-none"
          style={boxStyle({ xMm: safeArea.xMm, yMm: safeArea.yMm, widthMm: safeArea.widthMm, heightMm: safeArea.heightMm }, activeSize)}
        />
      ) : null}
      <div style={boxStyle(layout.orderIdBox, activeSize)} className={debug ? "border border-sky-400" : ""}>
        <div style={fittedStyle(orderFit)}>{orderFit.lines.join("\n")}</div>
      </div>
      <div style={boxStyle(layout.animalIdBox, activeSize)} className={debug ? "border border-blue-500" : ""}>
        <div style={fittedStyle(animalFit)}>{animalFit.lines.join("\n")}</div>
      </div>
      <div style={boxStyle(layout.breederNameBox, activeSize)} className={debug ? "border border-cyan-400" : ""}>
        <div style={fittedStyle(breederFit)}>{breederFit.lines.join("\n")}</div>
      </div>
      <div style={boxStyle(layout.testsBox, activeSize)} className={debug ? "border border-emerald-400" : ""}>
        <div style={fittedStyle(testsFit)}>{testsFit.lines.join("\n")}</div>
      </div>
      <div style={boxStyle(layout.qrBox, activeSize)} className={debug ? "border border-amber-400" : ""}>
        <div
          className="absolute border border-neutral-800 bg-[linear-gradient(45deg,#111_25%,transparent_25%,transparent_50%,#111_50%,#111_75%,transparent_75%,transparent)] bg-[length:8px_8px]"
          style={{
            left: `${((qrPlacement.xMm - layout.qrBox.xMm) / layout.qrBox.widthMm) * 100}%`,
            top: `${((qrPlacement.yMm - layout.qrBox.yMm) / layout.qrBox.heightMm) * 100}%`,
            width: `${(qrPlacement.sizeMm / layout.qrBox.widthMm) * 100}%`,
            height: `${(qrPlacement.sizeMm / layout.qrBox.heightMm) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
