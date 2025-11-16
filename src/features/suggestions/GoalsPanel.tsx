// @ts-nocheck

import React, { useMemo, useState } from "react";
import { GOAL_PRESETS } from "../../goals/presets";

const ensureTokens = (tokens) => tokens?.map((token) => token.trim()).filter(Boolean) ?? [];

const TokenEditor = ({ label, tokens, onChange, placeholder }) => {
  const [draft, setDraft] = useState("");

  const handleAddToken = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (tokens.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...tokens, trimmed]);
    setDraft("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      handleAddToken(draft);
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-gray-200">{label}</span>
      <div className="flex flex-wrap gap-2">
        {tokens.map((token) => (
          <button
            key={token}
            type="button"
            className="inline-flex items-center rounded-full bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600"
            onClick={() => onChange(tokens.filter((t) => t !== token))}
          >
            <span>{token}</span>
            <span className="ml-2 text-slate-300">×</span>
          </button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => handleAddToken(draft)}
        placeholder={placeholder}
        className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-slate-400 focus:outline-none"
      />
    </div>
  );
};

const GoalCard = ({ goal, onUpdate, onRemove, requestPreset }) => {
  const requireAll = ensureTokens(goal.requireAll);
  const requireAny = ensureTokens(goal.requireAny);
  const avoid = ensureTokens(goal.avoid);

  const handleTokenChange = (field) => (nextTokens) => {
    onUpdate({ ...goal, [field]: nextTokens });
  };

  const minProbPercent = Math.round((goal.minProb ?? 0) * 100);
  const weightValue = goal.weight ?? 1;

  return (
    <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/60 p-4">
      <div className="flex items-center justify-between">
        <input
          value={goal.name}
          onChange={(event) => onUpdate({ ...goal, name: event.target.value })}
          placeholder="Goal name"
          className="flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-slate-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          className="ml-3 text-sm text-slate-300 hover:text-red-300"
        >
          Remove
        </button>
      </div>

      <TokenEditor
        label="Require all"
        tokens={requireAll}
        onChange={handleTokenChange("requireAll")}
        placeholder="Add trait and press Enter"
      />

      <TokenEditor
        label="Require any"
        tokens={requireAny}
        onChange={handleTokenChange("requireAny")}
        placeholder="Optional traits"
      />

      <TokenEditor
        label="Avoid"
        tokens={avoid}
        onChange={handleTokenChange("avoid")}
        placeholder="Problem traits"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col text-sm text-gray-200">
          <span className="mb-1">Recessive state</span>
          <select
            value={goal.recessiveState ?? ""}
            onChange={(event) =>
              onUpdate({
                ...goal,
                recessiveState: event.target.value ? event.target.value : undefined,
              })
            }
            className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-slate-400 focus:outline-none"
          >
            <option value="">Any</option>
            <option value="visual">Visual</option>
            <option value="het">Het</option>
            <option value="possibleHet">Possible het</option>
          </select>
        </label>

        <div className="text-sm text-gray-200">
          <label className="mb-1 block">Min probability ({minProbPercent}%)</label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minProbPercent}
            onChange={(event) => onUpdate({ ...goal, minProb: Number(event.target.value) / 100 })}
            className="w-full"
          />
        </div>

        <div className="text-sm text-gray-200">
          <label className="mb-1 block">Weight ({weightValue.toFixed(1)})</label>
          <input
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={weightValue}
            onChange={(event) => onUpdate({ ...goal, weight: Number(event.target.value) })}
            className="w-full"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-300">ID: {goal.id}</div>
        <button
          type="button"
          onClick={requestPreset}
          className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600"
        >
          Load Preset
        </button>
      </div>
    </div>
  );
};

const defaultGoal = () => ({
  id: `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  name: "New goal",
  requireAll: [],
  requireAny: [],
  avoid: [],
  weight: 1,
});

export const GoalsPanel = ({ goals, onChange }) => {
  const [presetMenu, setPresetMenu] = useState({ openFor: null });

  const activeGoals = useMemo(() => goals ?? [], [goals]);

  const updateGoalAt = (index, nextGoal) => {
    const next = [...activeGoals];
    next[index] = nextGoal;
    onChange(next);
  };

  const removeGoalAt = (index) => {
    const next = activeGoals.filter((_, idx) => idx !== index);
    onChange(next);
  };

  const handleAddGoal = () => {
    onChange([...activeGoals, defaultGoal()]);
  };

  const applyPreset = (goalId, presetId) => {
    const preset = GOAL_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    const index = activeGoals.findIndex((goal) => goal.id === goalId);
    if (index === -1) return;
    updateGoalAt(index, { ...preset });
    setPresetMenu({ openFor: null });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Goals</h2>
        <button
          type="button"
          onClick={handleAddGoal}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Add Goal
        </button>
      </div>

      <div className="space-y-4">
        {activeGoals.map((goal, index) => (
          <div key={goal.id} className="relative">
            <GoalCard
              goal={goal}
              onUpdate={(next) => updateGoalAt(index, next)}
              onRemove={() => removeGoalAt(index)}
              requestPreset={() =>
                setPresetMenu((state) => ({ openFor: state.openFor === goal.id ? null : goal.id }))
              }
            />
            {presetMenu.openFor === goal.id && (
              <div className="absolute right-4 top-16 z-10 w-56 rounded border border-slate-600 bg-slate-800 shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Presets
                  <button
                    type="button"
                    onClick={() => setPresetMenu({ openFor: null })}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    Close
                  </button>
                </div>
                <ul className="max-h-48 overflow-auto text-sm text-white">
                  {GOAL_PRESETS.map((preset) => (
                    <li key={preset.id}>
                      <button
                        type="button"
                        onClick={() => applyPreset(goal.id, preset.id)}
                        className="flex w-full items-start px-3 py-2 text-left hover:bg-slate-700"
                      >
                        <div>
                          <div className="font-medium">{preset.name}</div>
                          <div className="text-xs text-slate-300">{preset.requireAll.join(", ")}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {!activeGoals.length && (
        <p className="text-sm text-slate-300">No goals yet. Add one to tailor suggestions.</p>
      )}
    </div>
  );
};

export default GoalsPanel;
