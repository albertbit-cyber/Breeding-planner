import React, { useState } from "react";

/**
 * Tiers as columns, features as rows, grouped as the catalogue groups them. Each cell is a checkbox,
 * plus a limit box for features the backend counts (blank = unlimited).
 *
 * Used twice: on the Tier matrix, where the cells are the tiers' real settings and `compare` is the
 * recommendation (a ring marks every cell that differs from it), and on Suggestions, where the cells
 * are the recommendation itself.
 *
 * values:  { [columnKey]: { [featureKey]: { enabled, limit } } }, limit as input text
 * compare: same shape, optional
 */

export const limitText = (limit) => (limit === null || limit === undefined ? "" : String(limit));

const sameCell = (a, b) =>
  Boolean(a?.enabled) === Boolean(b?.enabled) && (!a?.enabled || limitText(a?.limit) === limitText(b?.limit));

const describe = (cell) => (!cell?.enabled ? "off" : limitText(cell.limit) === "" ? "on, unlimited" : `on, ${cell.limit}`);

export const groupFeatures = (features) => {
  const groups = [];
  const byName = new Map();
  features.forEach((feature) => {
    const name = feature.featureGroup || "General";
    if (!byName.has(name)) {
      const group = { name, features: [] };
      byName.set(name, group);
      groups.push(group);
    }
    byName.get(name).features.push(feature);
  });
  return groups;
};

/** Which catalogue features belong in a tier: not staff permissions, not lab-vendor tools. */
export const tierFeaturesOnly = (features) => features.filter((feature) => (feature.audience || "tier") === "tier");

export default function TierMatrixGrid({
  columns,
  features,
  values,
  compare,
  compareLabel = "Recommended",
  onToggle,
  onLimit,
  readOnly = false,
  addon,
}) {
  const [collapsed, setCollapsed] = useState({});
  const groups = groupFeatures(features);
  const toggleGroup = (name) => setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="admin-table-wrap admin-matrix-wrap">
      <table className="admin-table admin-matrix">
        <thead>
          <tr>
            <th className="admin-matrix__feature" scope="col">Feature</th>
            {addon && <th scope="col" className="admin-matrix__addon">Add-on price<br /><span className="admin-muted">per month</span></th>}
            {columns.map((column) => (
              <th key={column.key} scope="col" className="admin-matrix__tier">
                <div className="admin-matrix__tier-name">{column.label}</div>
                {column.sub && <div className="admin-muted admin-matrix__tier-sub">{column.sub}</div>}
                {column.action}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group) => {
          const isCollapsed = Boolean(collapsed[group.name]);
          return (
            <tbody key={group.name}>
              <tr className="admin-matrix__group">
                <th colSpan={columns.length + 1 + (addon ? 1 : 0)} scope="rowgroup">
                  <button type="button" className="admin-matrix__group-toggle" onClick={() => toggleGroup(group.name)} aria-expanded={!isCollapsed}>
                    <span aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span> {group.name}
                    <span className="admin-muted"> · {group.features.length}</span>
                  </button>
                </th>
              </tr>
              {!isCollapsed && group.features.map((feature) => {
                const counted = Boolean(feature.defaultLimitType);
                return (
                  <tr key={feature.featureKey}>
                    <th scope="row" className="admin-matrix__feature">
                      <span className="admin-matrix__feature-name" title={feature.description || feature.featureName}>{feature.featureName}</span>
                      <span className="admin-muted mono admin-matrix__feature-key">{feature.featureKey}</span>
                    </th>
                    {addon && (
                      <td className="admin-matrix__addon">{addon.render(feature)}</td>
                    )}
                    {columns.map((column) => {
                      const cell = values?.[column.key]?.[feature.featureKey] || { enabled: false, limit: "" };
                      const hint = compare?.[column.key]?.[feature.featureKey];
                      const differs = Boolean(compare && compare[column.key] && !sameCell(cell, hint || { enabled: false }));
                      const label = `${feature.featureName}, ${column.label}`;
                      return (
                        <td
                          key={column.key}
                          className={`admin-matrix__cell${cell.enabled ? " is-on" : ""}${differs ? " is-different" : ""}`}
                          title={differs ? `${compareLabel}: ${describe(hint)}` : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(cell.enabled)}
                            onChange={() => onToggle(column.key, feature.featureKey)}
                            disabled={readOnly}
                            aria-label={label}
                          />
                          {counted && (
                            <input
                              type="number"
                              min="0"
                              className="admin-limit-input admin-matrix__limit"
                              value={limitText(cell.limit)}
                              onChange={(e) => onLimit(column.key, feature.featureKey, e.target.value)}
                              disabled={readOnly || !cell.enabled}
                              placeholder="∞"
                              aria-label={`${label}, limit (blank for unlimited)`}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
