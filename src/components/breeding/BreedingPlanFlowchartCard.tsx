// @ts-nocheck

import React, { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";

const NODE_WIDTH = 260;
const COLUMN_GAP = 340;
const ROW_GAP = 210;

const nodeClassNames = (kind, isGoal, selected) => {
  const base = "rounded-xl border bg-white p-3 shadow-lg transition-shadow";
  const selectedClass = selected ? " ring-2 ring-sky-400 shadow-xl" : "";
  if (kind === "collection") {
    return `${base} border-neutral-300 ${selectedClass}`;
  }
  if (kind === "pairing") {
    return `${base} border-sky-300 bg-sky-50 ${selectedClass}`;
  }
  if (isGoal) {
    return `${base} border-emerald-400 bg-emerald-50 ${selectedClass}`;
  }
  return `${base} border-violet-300 bg-violet-50 ${selectedClass}`;
};

const formatPercent = (value, digits = 1) => `${(Number(value || 0) * 100).toFixed(digits)}%`;

const uniqueTokens = (values = []) => {
  const seen = new Set();
  return (values || []).filter((value) => {
    const token = String(value || "").trim();
    if (!token) return false;
    const key = token.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const chipClasses = {
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-700",
  matched: "border-emerald-200 bg-emerald-50 text-emerald-800",
  holdback: "border-sky-200 bg-sky-50 text-sky-800",
};

const TokenChip = ({ value, tone = "neutral" }) => (
  <span className={`rounded-md border px-2 py-1 text-xs font-medium ${chipClasses[tone] || chipClasses.neutral}`}>
    {value}
  </span>
);

const DetailSection = ({ label, tokens, tone = "neutral", emptyLabel }) => {
  const list = uniqueTokens(tokens);
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      {list.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {list.map((entry) => (
            <TokenChip key={`${label}-${entry}`} value={entry} tone={tone} />
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs text-neutral-500">{emptyLabel}</div>
      )}
    </div>
  );
};

const PlannerNode = ({ data, selected }) => {
  const title = typeof data.resolveTitle === "function" ? data.resolveTitle(data) : data.title;
  const tooltip = (data.probabilities || [])
    .map((entry) => `${entry.label}: ${formatPercent(entry.probability, 1)}`)
    .join("\n");

  return (
    <div className={nodeClassNames(data.kind, data.isGoal, selected)} title={tooltip || title} style={{ width: NODE_WIDTH }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Generation {data.generation}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{data.kind}</div>
      </div>
      <div className="mt-2 text-sm font-semibold text-neutral-900">{title}</div>
      {data.subtitle ? <div className="mt-1 text-xs text-neutral-600">{data.subtitle}</div> : null}
      {data.expectedGenetics?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.expectedGenetics.slice(0, 4).map((entry) => (
            <span key={`${data.id}-${entry}`} className="rounded-md bg-white/80 px-2 py-1 text-[11px] font-medium text-neutral-700 border border-neutral-200">
              {entry}
            </span>
          ))}
        </div>
      ) : null}
      {data.goalProbability != null ? (
        <div className={`mt-2 text-xs font-semibold ${data.isGoal ? "text-emerald-700" : "text-sky-700"}`}>
          Goal chance {formatPercent(data.goalProbability, 1)}
        </div>
      ) : null}
    </div>
  );
};

const nodeTypes = {
  plannerNode: PlannerNode,
};

const buildFlowNodes = (plan, getDisplayNameForAnimal) => {
  const grouped = new Map();
  (plan?.flowchart?.nodes || []).forEach((node) => {
    const generation = Number(node.generation || 0);
    const bucket = grouped.get(generation) || [];
    bucket.push(node);
    grouped.set(generation, bucket);
  });

  const generations = Array.from(grouped.keys()).sort((a, b) => a - b);
  const layoutNodes = [];

  generations.forEach((generation, generationIndex) => {
    const bucket = grouped.get(generation) || [];
    bucket.forEach((node, rowIndex) => {
      layoutNodes.push({
        id: node.id,
        type: "plannerNode",
        position: {
          x: generationIndex * COLUMN_GAP,
          y: rowIndex * ROW_GAP,
        },
        draggable: false,
        selectable: true,
        data: {
          ...node,
          resolveTitle: (item) => {
            if (item.kind === "collection" && item.animalId) {
              return getDisplayNameForAnimal(item.animalId);
            }
            if (item.maleId && item.femaleId) {
              return `${getDisplayNameForAnimal(item.maleId)} × ${getDisplayNameForAnimal(item.femaleId)}`;
            }
            return item.title;
          },
        },
        style: { width: NODE_WIDTH },
      });
    });
  });

  return { layoutNodes, generations };
};

const buildFlowEdges = (plan) =>
  (plan?.flowchart?.edges || []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    animated: false,
    style: { stroke: "#64748b", strokeWidth: 1.5 },
    labelStyle: { fill: "#475569", fontSize: 11, fontWeight: 600 },
  }));

const SelectionDetails = ({ node, getDisplayNameForAnimal }) => {
  if (!node) return null;
  const title = node.kind === "collection" && node.animalId
    ? getDisplayNameForAnimal(node.animalId)
    : node.maleId && node.femaleId
      ? `${getDisplayNameForAnimal(node.maleId)} × ${getDisplayNameForAnimal(node.femaleId)}`
      : node.title;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{node.kind}</div>
          <div className="mt-1 text-sm font-semibold text-neutral-900">{title}</div>
        </div>
        <div className="text-xs font-semibold text-neutral-500">Generation {node.generation}</div>
      </div>
      {node.subtitle ? <div className="mt-2 text-sm text-neutral-600">{node.subtitle}</div> : null}
      {node.expectedGenetics?.length ? (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Expected Genetics</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {node.expectedGenetics.map((entry) => (
              <span key={`${node.id}-detail-${entry}`} className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700">
                {entry}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <DetailSection
        label="Matched Genes"
        tokens={node.matchedGenes}
        tone="matched"
        emptyLabel="No target genes matched on this node."
      />
      <DetailSection
        label="Selected Holdback"
        tokens={node.holdbackTraits}
        tone="holdback"
        emptyLabel="No holdback is attached to this node."
      />
      {node.probabilities?.length ? (
        <div className="mt-3 space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Probabilities</div>
          {node.probabilities.map((entry) => (
            <div key={`${node.id}-${entry.label}`} className="flex items-center justify-between gap-3 rounded-md bg-neutral-50 px-2 py-1 text-xs text-neutral-700">
              <span className={entry.isGoal ? "font-semibold text-emerald-700" : ""}>{entry.label}</span>
              <span className="font-semibold">{formatPercent(entry.probability, 1)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const BranchInspectionPanel = ({ plan, node, getDisplayNameForAnimal }) => {
  const matchedGenes = uniqueTokens(node?.matchedGenes?.length ? node.matchedGenes : plan?.matchedGenes || []);
  const holdbacks = plan?.selectedHoldbacks || [];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Branch Inspection</div>
          <div className="mt-1 text-sm font-semibold text-neutral-900">Matched Genes / Selected Holdbacks</div>
        </div>
        <div className="text-xs text-neutral-500">{holdbacks.length} tracked holdback{holdbacks.length === 1 ? "" : "s"}</div>
      </div>

      <DetailSection
        label="Matched Genes"
        tokens={matchedGenes}
        tone="matched"
        emptyLabel="Select a branch to inspect matched target genes."
      />

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Selected Holdbacks</div>
        {holdbacks.length ? (
          <div className="mt-2 space-y-2">
            {holdbacks.map((holdback) => {
              const isActive = node && (
                node.id === holdback.sourcePairingNodeId ||
                node.id === holdback.sourceOutcomeNodeId ||
                node.id === holdback.id
              );
              const holdbackLabel = holdback.maleId && holdback.femaleId
                ? `${getDisplayNameForAnimal(holdback.maleId)} / ${getDisplayNameForAnimal(holdback.femaleId)}`
                : "Synthetic holdback pair";

              return (
                <div
                  key={holdback.id}
                  className={`rounded-lg border p-3 ${isActive ? "border-sky-300 bg-sky-50" : "border-neutral-200 bg-neutral-50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-neutral-900">Generation {holdback.generation}</div>
                      <div className="text-xs text-neutral-600">{holdback.pairingTitle}</div>
                    </div>
                    <div className="text-xs font-semibold text-sky-800">{formatPercent(holdback.probability, 1)}</div>
                  </div>
                  <div className="mt-2 text-xs text-neutral-600">{holdbackLabel}</div>
                  <DetailSection
                    label="Matched Genes"
                    tokens={holdback.matchedGenes}
                    tone="matched"
                    emptyLabel="No target genes matched."
                  />
                  <DetailSection
                    label="Holdback Traits"
                    tokens={holdback.traits}
                    tone="holdback"
                    emptyLabel="No holdback traits recorded."
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 text-xs text-neutral-500">No holdbacks were selected for this plan.</div>
        )}
      </div>
    </div>
  );
};

const FlowchartBody = ({ plan, getDisplayNameForAnimal }) => {
  const { layoutNodes, generations } = useMemo(
    () => buildFlowNodes(plan, getDisplayNameForAnimal),
    [plan, getDisplayNameForAnimal]
  );
  const flowEdges = useMemo(() => buildFlowEdges(plan), [plan]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  useEffect(() => {
    const firstNodeId = plan?.flowchart?.nodes?.[0]?.id || null;
    setSelectedNodeId(firstNodeId);
  }, [plan]);

  const selectedNode = useMemo(
    () => (plan?.flowchart?.nodes || []).find((node) => node.id === selectedNodeId) || null,
    [plan, selectedNodeId]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {generations.map((generation) => (
          <span key={`generation-pill-${generation}`} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
            Generation {generation}
          </span>
        ))}
      </div>

      <div className="h-[560px] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
        <ReactFlow
          nodes={layoutNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.3}
          maxZoom={1.6}
          onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
          nodesDraggable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap zoomable pannable />
          <Controls />
          <Background gap={18} size={1} color="#d4d4d8" />
        </ReactFlow>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SelectionDetails node={selectedNode} getDisplayNameForAnimal={getDisplayNameForAnimal} />
        <BranchInspectionPanel plan={plan} node={selectedNode} getDisplayNameForAnimal={getDisplayNameForAnimal} />
      </div>
    </div>
  );
};

const BreedingPlanFlowchartCard = ({
  isOpen,
  loading,
  error,
  plan,
  suggestionLabel,
  getDisplayNameForAnimal,
  thresholdPercent,
  generationLimit,
  onThresholdChange,
  onGenerationLimitChange,
  onRefresh,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
          <div className="min-w-[280px] flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Breeding Plan</div>
            <h3 className="mt-1 text-lg font-semibold text-neutral-900">{suggestionLabel || "Multi-Generation Breeding Flowchart Planner"}</h3>
            {plan ? (
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-500">
                <span>Threshold: {formatPercent(plan.threshold ?? 0.7, 0)}</span>
                <span>Generation limit: {plan.generationLimit ?? 0}</span>
                <span>Best goal chance: {formatPercent(plan.cumulativeProb ?? 0, 1)}</span>
                <span>{plan.goalReached ? `Reached in generation ${plan.goalReachedGeneration}` : "Threshold not reached within plan limit"}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[118px] flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Goal Threshold
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={thresholdPercent}
                onChange={(event) => onThresholdChange?.(event.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-900 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <label className="flex min-w-[118px] flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Generation Limit
              <input
                type="number"
                min={1}
                max={8}
                step={1}
                value={generationLimit}
                onChange={(event) => onGenerationLimitChange?.(event.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-900 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg border border-sky-300 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Update Plan
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex h-[420px] items-center justify-center text-sm text-neutral-500">Building breeding flowchart…</div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
          ) : plan?.flowchart?.nodes?.length ? (
            <ReactFlowProvider>
              <FlowchartBody plan={plan} getDisplayNameForAnimal={getDisplayNameForAnimal} />
            </ReactFlowProvider>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              No breeding flowchart could be generated for this plan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BreedingPlanFlowchartCard;