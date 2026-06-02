import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";
import QRCode from 'qrcode';
import LanguageSwitcher from "./components/LanguageSwitcher.jsx";
import jsQR from 'jsqr';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import { applyPdfUnicodeFont, setPdfFont } from './utils/pdfFonts';
import SuggestionsTab from "./features/suggestions/SuggestionsTab";
import FamilyTreePage from "./features/familyTree/index.jsx";
import BreederOrderGeneticTestModal from "./features/lab/components/BreederOrderGeneticTestModal.jsx";
import BatchOrderCart from "./features/lab/components/BatchOrderCart.jsx";
import { BatchOrderProvider } from "./features/lab/contexts/BatchOrderContext.jsx";
import { SampleLabelPreview, ShippingLabelPreview } from "./features/lab/components/LabLabelPreview.jsx";
import BreederShedTestingPanel from "./features/lab/components/BreederShedTestingPanel.jsx";
import ShedTestTerminalPanel from "./features/lab/components/ShedTestTerminalPanel.jsx";
import {
  getActiveLabelSize,
  getDefaultLabLabelSizeSettings,
  getLabLabelPresetByKey,
  LAB_LABEL_SIZE_LIMITS_MM,
  LAB_LABEL_SIZE_PRESETS,
  normalizeLabLabelSizeSettings,
  validateLabLabelSize,
} from "./features/lab/utils/labelSizing";
import { LAB_LABEL_DEBUG_STORAGE_KEY } from "./features/lab/utils/labelLayout";
import { useGoogleCalendarIntegration } from "./hooks/useGoogleCalendarIntegration";
import { useAppearance } from "./contexts/AppearanceContext.jsx";
import { useSharedBackend } from "./contexts/SharedBackendContext.jsx";
import { fetchBreederSnapshot, saveBreederSnapshot, fetchMyListings, saveMyListings } from "./shared/apiClient";
import {
  GENE_GROUPS,
  GENE_ALIASES,
  getGeneDisplayGroup,
  normalizeGeneCandidate,
} from "./genetics/geneLibrary";
import {
  getDefaultGeneAliasRows,
  mergeGeneAliasRows,
  normalizeGeneAliasRows,
  resolveCanonicalGene,
  setActiveGeneAliasRows,
} from "./genetics/geneDatabase";
import {
  collectLiveGenetics,
  parseAnimalText,
} from "./features/animals/quickAddParser";
import {
  getLabelBrands,
  getLabelCategories,
  getLabelPresets,
  normalizePdfLabelSettings,
  resolvePdfLabelLayout,
  validatePdfLabelLayout,
} from "./features/labels/presets";
import defaultMorphAliasesJson from "./config/morphAliases.json";
// use the CDN worker by version
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const HEAT_RACK_TUB_PRESETS = ['V70', 'V35', 'V18', 'CB70'];

// HeatRackFormModal now supports preset/custom tub sizes for rooms.
function HeatRackFormModal({ open, mode, room, rack, onSubmit, onCancel }) {
  const { t } = useTranslation();
  const getInitialFormState = useCallback(() => {
    const label = String(rack?.tubSizeLabel || '').trim();
    const presetMatch = HEAT_RACK_TUB_PRESETS.find(option => option.toLowerCase() === label.toLowerCase());
    const preset = presetMatch || (label ? 'custom' : HEAT_RACK_TUB_PRESETS[0]);
    return {
      name: rack?.name || '',
      tubSizePreset: preset,
      customTubLabel: preset === 'custom' ? label : '',
      columns: rack?.columns ? String(rack.columns) : '1',
      levels: rack?.levels ? String(rack.levels) : '1',
      tubDimensions: {
        w: rack?.tubDimensions?.w ? String(rack.tubDimensions.w) : '',
        d: rack?.tubDimensions?.d ? String(rack.tubDimensions.d) : '',
        h: rack?.tubDimensions?.h ? String(rack.tubDimensions.h) : '',
        unit: rack?.tubDimensions?.unit || 'cm',
      },
    };
  }, [rack]);

  const [form, setForm] = useState(getInitialFormState);

  useEffect(() => {
    setForm(getInitialFormState());
  }, [getInitialFormState, room?.id, open]);

  if (!open || !room) return null;

  const totalTubs = computeTotalTubs(Number(form.columns) || 1, Number(form.levels) || 1);
  const isCustomPreset = form.tubSizePreset === 'custom';
  const hasValidCustomLabel = !isCustomPreset || Boolean(form.customTubLabel.trim());
  const hasValidCustomDimensions = !isCustomPreset || ['w', 'd', 'h'].every(key => Number(form.tubDimensions[key]) > 0);
  const canSubmit = Boolean(form.name.trim()) && hasValidCustomLabel && hasValidCustomDimensions;
  const resolvedTubLabel = isCustomPreset
    ? (form.customTubLabel.trim() || t('spaces.rack.tubSize', { defaultValue: 'Custom rack' }))
    : form.tubSizePreset;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const columns = clampInt(form.columns, { min: 1, fallback: 1 });
    const levels = clampInt(form.levels, { min: 1, fallback: 1 });
    const payload = {
      name: form.name.trim(),
      columns,
      levels,
      tubSizeLabel: resolvedTubLabel,
      tubDimensions: isCustomPreset && hasValidCustomDimensions
        ? {
            w: Number(form.tubDimensions.w),
            d: Number(form.tubDimensions.d),
            h: Number(form.tubDimensions.h),
            unit: form.tubDimensions.unit,
          }
        : null,
      slots: rack?.slots,
    };
    onSubmit?.(payload);
  };

  const handlePresetChange = (event) => {
    const nextPreset = event.target.value;
    if (nextPreset === 'custom') {
      setForm(prev => ({ ...prev, tubSizePreset: 'custom' }));
    } else {
      setForm(prev => ({ ...prev, tubSizePreset: nextPreset, customTubLabel: '' }));
    }
  };

  const updateDimension = (key, value) => {
    setForm(prev => ({
      ...prev,
      tubDimensions: { ...prev.tubDimensions, [key]: value },
    }));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <form className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">{room.name}</div>
          <div className="text-lg font-semibold">
            {mode === 'edit'
              ? t('spaces.editRackTitle', { defaultValue: 'Edit rack' })
              : t('spaces.addRack', { defaultValue: 'Create rack' })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-neutral-700 min-w-0">
              <span>{t('spaces.rack.name', { defaultValue: 'Rack name' })}</span>
              <input
                className="w-full border rounded-2xl px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('spaces.rack.name', { defaultValue: 'Rack name' })}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-neutral-700 min-w-0">
              <span>{t('spaces.rack.tubSize', { defaultValue: 'Tub size' })}</span>
              <select
                className="w-full border rounded-2xl px-3 py-2 text-sm"
                value={form.tubSizePreset}
                onChange={handlePresetChange}
              >
                {HEAT_RACK_TUB_PRESETS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
                <option value="custom">{t('spaces.rack.customPreset', { defaultValue: 'Custom' })}</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-neutral-700 min-w-0">
              <span>{t('spaces.rack.columnsLabel', { defaultValue: 'How wide (lines)' })}</span>
              <input
                type="number"
                min="1"
                className="w-full border rounded-2xl px-3 py-2 text-sm"
                value={form.columns}
                onChange={e => setForm(prev => ({ ...prev, columns: e.target.value }))}
                placeholder={t('spaces.rack.cols', { defaultValue: 'Columns' })}
              />
              <p className="text-xs text-neutral-500">
                {t('spaces.rack.columnsHint', { defaultValue: 'Each column is a vertical line of tubs running top to bottom.' })}
              </p>
            </label>
            <label className="space-y-1 text-sm font-medium text-neutral-700 min-w-0">
              <span>{t('spaces.rack.levelsLabel', { defaultValue: 'How many levels' })}</span>
              <input
                type="number"
                min="1"
                className="w-full border rounded-2xl px-3 py-2 text-sm"
                value={form.levels}
                onChange={e => setForm(prev => ({ ...prev, levels: e.target.value }))}
                placeholder={t('spaces.rack.rows', { defaultValue: 'Levels' })}
              />
              <p className="text-xs text-neutral-500">
                {t('spaces.rack.levelsHint', { defaultValue: 'Levels count from the top, so slot numbers go down before moving left.' })}
              </p>
            </label>
          </div>
        </div>

        {isCustomPreset && (
          <div className="space-y-3">
            <label className="space-y-1 text-sm font-medium text-neutral-700 min-w-0">
              <span>{t('spaces.rack.customLabel', { defaultValue: 'Custom tub label' })}</span>
              <input
                className="w-full border rounded-2xl px-3 py-2 text-sm"
                value={form.customTubLabel}
                onChange={e => setForm(prev => ({ ...prev, customTubLabel: e.target.value }))}
                placeholder={t('spaces.rack.tubSize', { defaultValue: 'Custom tub label' })}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                type="number"
                min="1"
                className="w-full border rounded-2xl px-3 py-2 text-sm"
                value={form.tubDimensions.w}
                onChange={e => updateDimension('w', e.target.value)}
                placeholder={t('spaces.dimensions.width', { defaultValue: 'Width' })}
              />
              <input
                type="number"
                min="1"
                className="w-full border rounded-2xl px-3 py-2 text-sm"
                value={form.tubDimensions.d}
                onChange={e => updateDimension('d', e.target.value)}
                placeholder={t('spaces.dimensions.depth', { defaultValue: 'Depth' })}
              />
              <input
                type="number"
                min="1"
                className="w-full border rounded-2xl px-3 py-2 text-sm"
                value={form.tubDimensions.h}
                onChange={e => updateDimension('h', e.target.value)}
                placeholder={t('spaces.dimensions.height', { defaultValue: 'Height' })}
              />
              <select
                className="w-full border rounded-2xl px-3 py-2 text-sm"
                value={form.tubDimensions.unit}
                onChange={e => updateDimension('unit', e.target.value)}
              >
                <option value="cm">cm</option>
                <option value="mm">mm</option>
                <option value="in">in</option>
              </select>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
          {t('spaces.derivedCapacity', { defaultValue: 'Total tubs: {{count}}', count: totalTubs })}
          <div className="text-xs text-neutral-500">{t('spaces.rack.capacityHint', { defaultValue: 'Each slot holds one animal. Numbers run from top-right downward.' })}</div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="px-4 py-2 rounded-2xl border" onClick={onCancel}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
          <button
            type="submit"
            className={cx('px-4 py-2 rounded-2xl text-white', canSubmit ? 'bg-neutral-900' : 'bg-neutral-400 cursor-not-allowed')}
            disabled={!canSubmit}
          >
            {mode === 'edit' ? t('common.save', { defaultValue: 'Save' }) : t('spaces.addRack', { defaultValue: 'Add Rack' })}
          </button>
        </div>
      </form>
    </div>
  );
}

// TerrariumFormModal now captures dimensions plus capacity in one flow.
function TerrariumFormModal({ open, mode, room, terrarium, onSubmit, onCancel }) {
  const { t } = useTranslation();
  const getInitialFormState = useCallback(() => ({
    name: terrarium?.name || '',
    w: terrarium?.dimensions?.w ? String(terrarium.dimensions.w) : '',
    d: terrarium?.dimensions?.d ? String(terrarium.dimensions.d) : '',
    h: terrarium?.dimensions?.h ? String(terrarium.dimensions.h) : '',
    unit: terrarium?.dimensions?.unit || 'cm',
    capacity: terrarium?.capacity ? String(terrarium.capacity) : '1',
  }), [terrarium]);

  const [form, setForm] = useState(getInitialFormState);

  useEffect(() => {
    setForm(getInitialFormState());
  }, [getInitialFormState, terrarium?.id, open]);

  if (!open || !room) return null;

  const hasValidDimensions = ['w', 'd', 'h'].every(key => Number(form[key]) > 0);
  const capacityValue = clampInt(form.capacity, { min: 1, fallback: 1 });
  const canSubmit = Boolean(form.name.trim()) && hasValidDimensions && capacityValue > 0;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit?.({
      name: form.name.trim(),
      dimensions: { w: Number(form.w), d: Number(form.d), h: Number(form.h), unit: form.unit },
      capacity: capacityValue,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <form className="w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">{room.name}</div>
          <div className="text-lg font-semibold">
            {mode === 'edit'
              ? t('spaces.editTerrariumTitle', { defaultValue: 'Edit terrarium' })
              : t('spaces.addTerrarium', { defaultValue: 'Create terrarium' })}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-neutral-600">{t('spaces.terrarium.name', { defaultValue: 'Terrarium name' })}</label>
          <input
            className="border rounded-2xl px-3 py-2 text-sm"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder={t('spaces.terrarium.name', { defaultValue: 'Terrarium name' })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <input
            type="number"
            min="1"
            className="border rounded-2xl px-3 py-2 text-sm"
            value={form.w}
            onChange={e => setForm(prev => ({ ...prev, w: e.target.value }))}
            placeholder={t('spaces.dimensions.width', { defaultValue: 'Width' })}
          />
          <input
            type="number"
            min="1"
            className="border rounded-2xl px-3 py-2 text-sm"
            value={form.d}
            onChange={e => setForm(prev => ({ ...prev, d: e.target.value }))}
            placeholder={t('spaces.dimensions.depth', { defaultValue: 'Depth' })}
          />
          <input
            type="number"
            min="1"
            className="border rounded-2xl px-3 py-2 text-sm"
            value={form.h}
            onChange={e => setForm(prev => ({ ...prev, h: e.target.value }))}
            placeholder={t('spaces.dimensions.height', { defaultValue: 'Height' })}
          />
          <select
            className="border rounded-2xl px-3 py-2 text-sm"
            value={form.unit}
            onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))}
          >
            <option value="cm">cm</option>
            <option value="mm">mm</option>
            <option value="in">in</option>
          </select>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-2">
          <label className="text-sm font-semibold text-neutral-800" htmlFor="terrarium-capacity-input">
            {t('spaces.terrarium.capacityLabel', { defaultValue: 'Number of animals' })}
          </label>
          <input
            id="terrarium-capacity-input"
            type="number"
            min="1"
            className="border rounded-2xl px-3 py-2 text-sm"
            value={form.capacity}
            onChange={e => setForm(prev => ({ ...prev, capacity: e.target.value }))}
            placeholder={t('spaces.terrarium.capacityLabel', { defaultValue: 'Number of animals' })}
          />
          <p className="text-xs text-neutral-500">
            {t('spaces.capacityHint', { defaultValue: 'Each animal gets its own slot in this terrarium.' })}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="px-4 py-2 rounded-2xl border" onClick={onCancel}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
          <button
            type="submit"
            className={cx('px-4 py-2 rounded-2xl text-white', canSubmit ? 'bg-neutral-900' : 'bg-neutral-400 cursor-not-allowed')}
            disabled={!canSubmit}
          >
            {mode === 'edit' ? t('common.save', { defaultValue: 'Save' }) : t('spaces.addTerrarium', { defaultValue: 'Add Terrarium' })}
          </button>
        </div>
      </form>
    </div>
  );
}

function RackView({ rack, snakeOptions, snakeMap, occupiedSnakeIds = new Set(), onAssign, onEdit, onDelete, onClose }) {
  const { t } = useTranslation();
  const [activeSlot, setActiveSlot] = useState(null);
  const [assignSearch, setAssignSearch] = useState('');
  const assignInputRef = useRef(null);
  const [assignError, setAssignError] = useState('');
  const [slotHeight, setSlotHeight] = useState(120);

  const rackId = rack?.id || null;
  const levelCount = Math.max(1, Number(rack?.levels) || 1);
  const columnCount = Math.max(1, Number(rack?.columns) || 1);

  const dismissAssignModal = useCallback(() => {
    setActiveSlot(null);
    setAssignSearch('');
    setAssignError('');
  }, []);

  useEffect(() => {
    dismissAssignModal();
  }, [rackId, dismissAssignModal]);

  useEffect(() => {
    if (!rackId) return;
    const updateSizing = () => {
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
      const availableHeight = Math.max(360, viewportHeight - 320);
      const gap = 8;
      const heightPerLevel = Math.floor((availableHeight - gap * (levelCount - 1)) / levelCount);
      const rawHeight = Number.isFinite(heightPerLevel) ? heightPerLevel : 100;
      const safeHeight = rawHeight > 0 ? rawHeight : 100;
      const finalHeight = Math.min(safeHeight, 150);
      setSlotHeight(finalHeight);
    };
    updateSizing();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('resize', updateSizing);
    return () => window.removeEventListener('resize', updateSizing);
  }, [levelCount, rackId]);


  useEffect(() => {
    setAssignError('');
  }, [assignSearch]);

  const filteredOptions = useMemo(() => {
    const normalized = assignSearch.trim().toLowerCase();
    const blocked = new Set(occupiedSnakeIds);
    if (activeSlot?.snakeId) blocked.delete(activeSlot.snakeId);
    const list = (Array.isArray(snakeOptions) ? snakeOptions : []).filter(option => !blocked.has(option.id));
    if (!normalized) return list;
    return list.filter(option => {
      const label = option.label?.toLowerCase() || '';
      const id = option.id?.toLowerCase() || '';
      return label.includes(normalized) || id.includes(normalized);
    });
  }, [activeSlot?.snakeId, assignSearch, occupiedSnakeIds, snakeOptions]);

  const handleAssignForSlot = useCallback((snakeId) => {
    if (!rackId || !activeSlot) return;
    onAssign?.(rackId, activeSlot.levelIndex, activeSlot.columnIndex, snakeId || null);
    dismissAssignModal();
  }, [activeSlot, dismissAssignModal, onAssign, rackId]);

  const handleSlotScan = useCallback((scannedId) => {
    const normalized = String(scannedId || '').trim();
    if (!normalized) {
      setAssignError(t('spaces.assign.scanFailed', { defaultValue: 'Could not read that QR code.' }));
      return;
    }
    const match = snakeMap.get(normalized);
    if (!match) {
      setAssignError(t('spaces.assign.noMatch', { defaultValue: 'No snake found with ID {{id}}.', id: normalized }));
      return;
    }
    handleAssignForSlot(match.id);
  }, [handleAssignForSlot, snakeMap, t]);

  const shouldShowAssignModal = Boolean(activeSlot);

  useEffect(() => {
    if (shouldShowAssignModal && assignInputRef.current) {
      assignInputRef.current.focus();
    }
  }, [shouldShowAssignModal]);

  useHardwareScannerListener({
    enabled: shouldShowAssignModal,
    onScan: handleSlotScan,
    minLength: 3,
    maxKeyInterval: 200,
    maxScanDuration: 2500,
  });

  if (!rack) return null;

  const slots = Array.isArray(rack.slots) ? rack.slots : [];
  const grouped = Array.from({ length: levelCount }, (_, levelIndex) => ({
    levelIndex,
    slots: slots
      .filter(slot => slot.levelIndex === levelIndex)
      .sort((a, b) => a.columnIndex - b.columnIndex),
  }));

  const handleOpenSlot = (slot) => {
    setActiveSlot(slot);
    setAssignSearch('');
    setAssignError('');
  };
  const activeSlotOccupant = activeSlot?.snakeId ? snakeMap.get(activeSlot.snakeId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-3xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">{t('spaces.rack.name', { defaultValue: 'Rack' })}</div>
            <div className="text-xl font-semibold">{rack.name}</div>
            <div className="text-sm text-neutral-500">{t('spaces.occupancy', { defaultValue: '{{occupied}} / {{total}} tubs occupied', occupied: slots.filter(slot => slot?.snakeId).length, total: rack.totalTubs })}</div>
          </div>
          <div className="flex gap-2 text-sm">
            <button className="px-3 py-2 rounded-2xl border" onClick={() => onEdit?.(rack.id)}>{t('common.edit', { defaultValue: 'Edit' })}</button>
            <button className="px-3 py-2 rounded-2xl border border-rose-200 text-rose-600" onClick={() => onDelete?.(rack.id)}>{t('common.delete', { defaultValue: 'Delete' })}</button>
            <button className="px-3 py-2 rounded-2xl border" onClick={onClose}>{t('common.close', { defaultValue: 'Close' })}</button>
          </div>
        </div>
        <div className="mt-5 space-y-4 max-h-[65vh] overflow-auto pr-1">
          {grouped.map(group => (
            <div key={group.levelIndex} className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">{t('spaces.levelLabel', { defaultValue: 'Level {{index}}', index: group.levelIndex + 1 })}</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
                {group.slots.map(slot => {
                  const occupant = slot.snakeId ? snakeMap.get(slot.snakeId) : null;
                  const slotKey = `${slot.levelIndex}-${slot.columnIndex}`;
                  const slotNumber = slot.levelIndex * columnCount + slot.columnIndex + 1;
                  return (
                    <button
                      key={slotKey}
                      type="button"
                      className={cx(
                        'relative rounded-2xl border px-3 py-3 text-left transition-colors flex flex-col justify-between overflow-hidden',
                        occupant ? 'border-emerald-300 bg-emerald-50 hover:border-emerald-400' : 'border-neutral-200 bg-white hover:border-neutral-300'
                      )}
                      style={{ height: `${slotHeight}px` }}
                      onClick={() => handleOpenSlot(slot)}
                    >
                      <span className="absolute top-2 right-2 text-[11px] font-semibold text-neutral-600 bg-white/80 px-2 py-0.5 rounded-full shadow-sm">
                        {slotNumber}
                      </span>
                      {occupant ? (
                        <div>
                          <div className="text-xs uppercase tracking-wide text-neutral-500">{t('spaces.slotLabel', { defaultValue: 'Slot {{slot}}', slot: `${slot.levelIndex + 1}.${slot.columnIndex + 1}` })}</div>
                          <div className="text-sm font-semibold text-neutral-900 truncate">{occupant?.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{occupant.id}</div>
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center text-neutral-400">
                          <div className="text-xs uppercase tracking-wide">{t('spaces.emptySlot', { defaultValue: 'Empty' })}</div>
                        </div>
                      )}
                      <div className="mt-2 text-[11px] font-semibold text-sky-600 uppercase tracking-wide">
                        {occupant
                          ? t('spaces.assign.reassign', { defaultValue: 'Reassign' })
                          : t('spaces.assign.prompt', { defaultValue: 'Assign animal' })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {shouldShowAssignModal && activeSlot && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={dismissAssignModal}>
            <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-neutral-500">{t('spaces.assignSlot', { defaultValue: 'Assign tub {{slot}}', slot: `${activeSlot.levelIndex + 1}.${activeSlot.columnIndex + 1}` })}</div>
                  <div className="text-lg font-semibold text-neutral-900">{activeSlotOccupant?.name || t('spaces.emptySlot', { defaultValue: 'Empty' })}</div>
                  {activeSlotOccupant && <div className="text-xs text-neutral-500">{activeSlotOccupant.id}</div>}
                </div>
                <button type="button" className="px-3 py-2 rounded-2xl border" onClick={dismissAssignModal}>{t('common.close', { defaultValue: 'Close' })}</button>
              </div>
              <div className="mt-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('common.search', { defaultValue: 'Search' })}</label>
                <input
                  ref={assignInputRef}
                  className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                  placeholder={t('spaces.assign.searchPlaceholder', { defaultValue: 'Search by name or ID' })}
                />
              </div>
              <div className="mt-3 rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                {t('spaces.assign.hardwareScannerHint', { defaultValue: 'Ready for QR input. Scan the snake label with your handheld scanner to auto-fill this slot.' })}
              </div>
              <div className="mt-3 rounded-2xl border border-neutral-200 max-h-72 overflow-y-auto divide-y">
                {filteredOptions.length ? (
                  filteredOptions.map(option => {
                    const optionSelected = option.id === activeSlot?.snakeId;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={cx(
                          'w-full px-4 py-3 text-left text-sm transition-colors',
                          optionSelected ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-neutral-50'
                        )}
                        onClick={() => handleAssignForSlot(option.id)}
                      >
                        <div className="font-semibold text-neutral-900">{option.label}</div>
                        <div className="text-xs text-neutral-500">{option.id}</div>
                        {optionSelected && <div className="text-[11px] font-semibold text-emerald-600 mt-1">{t('spaces.assign.current', { defaultValue: 'Currently assigned' })}</div>}
                      </button>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-sm text-neutral-500">{t('spaces.assign.noMatches', { defaultValue: 'No snakes match your search.' })}</div>
                )}
              </div>
              {assignError && <div className="mt-3 text-xs text-rose-600">{assignError}</div>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-2xl border border-neutral-300 text-sm"
                  onClick={() => handleAssignForSlot(null)}
                >
                  {t('spaces.emptySlot', { defaultValue: 'Empty' })}
                </button>
                <button type="button" className="px-3 py-2 rounded-2xl border text-sm" onClick={dismissAssignModal}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// TerrariumView now emphasizes dimensions plus occupants per terrarium.
function TerrariumView({ terrarium, snakeOptions, snakeMap, onEdit, onDelete, onUpdateOccupants, onClose }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft('');
  }, [terrarium?.id]);

  if (!terrarium) return null;

  const occupants = Array.isArray(terrarium.occupantIds) ? terrarium.occupantIds : [];
  const fallbackCapacity = occupants.length || 1;
  const rawCapacity = terrarium?.capacity ?? fallbackCapacity;
  const capacityValue = clampInt(rawCapacity, { min: 1, fallback: fallbackCapacity });
  const remainingSlots = Math.max(0, capacityValue - occupants.length);
  const availableOptions = snakeOptions.filter(option => !occupants.includes(option.id));
  const canAssign = Boolean(draft) && remainingSlots > 0 && availableOptions.some(option => option.id === draft);
  const isFull = remainingSlots === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">{t('spaces.terrarium.name', { defaultValue: 'Terrarium' })}</div>
            <div className="text-xl font-semibold">{terrarium.name}</div>
            {terrarium.dimensions && (
              <div className="text-sm text-neutral-500">{`${terrarium.dimensions.w}x${terrarium.dimensions.d}x${terrarium.dimensions.h}${terrarium.dimensions.unit}`}</div>
            )}
          </div>
          <div className="flex gap-2 text-sm">
            <button className="px-3 py-2 rounded-2xl border" onClick={() => onEdit?.(terrarium.id)}>{t('common.edit', { defaultValue: 'Edit' })}</button>
            <button className="px-3 py-2 rounded-2xl border border-rose-200 text-rose-600" onClick={() => onDelete?.(terrarium.id)}>{t('common.delete', { defaultValue: 'Delete' })}</button>
            <button className="px-3 py-2 rounded-2xl border" onClick={onClose}>{t('common.close', { defaultValue: 'Close' })}</button>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <div>
            <div className="text-sm font-semibold text-neutral-700 mb-2">
              {t('spaces.currentOccupants', { defaultValue: 'Animals inside: {{count}}', count: occupants.length })}
              <span className="ml-2 text-xs text-neutral-500">{t('spaces.capacitySummary', { defaultValue: '{{count}} / {{capacity}} slots', count: occupants.length, capacity: capacityValue })}</span>
            </div>
            {occupants.length ? (
              <div className="flex flex-wrap gap-2">
                {occupants.map(id => (
                  <span key={id} className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm">
                    {snakeMap.get(id)?.name || id}
                    <button className="text-xs text-rose-600" onClick={() => onUpdateOccupants?.(terrarium.id, occupants.filter(item => item !== id))}>x</button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">{t('spaces.noOccupants', { defaultValue: 'No animals assigned yet.' })}</div>
            )}
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
            <div className="text-sm font-semibold text-neutral-700">{t('spaces.addOccupant', { defaultValue: 'Add occupant' })}</div>
            <select
              className="w-full rounded-2xl border px-3 py-2 text-sm"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              disabled={isFull || !availableOptions.length}
            >
              <option value="">{t('spaces.chooseSnake', { defaultValue: 'Choose snake' })}</option>
              {availableOptions.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="w-full rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              disabled={!canAssign}
              onClick={() => {
                if (!canAssign) return;
                onUpdateOccupants?.(terrarium.id, [...occupants, draft]);
                setDraft('');
              }}
            >
              {t('spaces.addOccupant', { defaultValue: 'Assign snake' })}
            </button>
            {!availableOptions.length && (
              <div className="text-xs text-neutral-500">
                {t('spaces.noAvailableSnakes', { defaultValue: 'Every snake is already placed elsewhere.' })}
              </div>
            )}
            {isFull && (
              <div className="text-xs text-neutral-500">
                {t('spaces.capacityFull', { defaultValue: 'All {{capacity}} slots are filled.', capacity: capacityValue })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// RoomModal surfaces room-level rack/terrarium summaries with quick actions.
function RoomModal({
  open,
  room,
  racks = [],
  terrariums = [],
  roomIndex = 0,
  roomCount = 0,
  onClose,
  onRenameRoom,
  onDeleteRoom,
  onMoveRoom,
  onCreateRack,
  onEditRack,
  onDeleteRack,
  onViewRack,
  onCreateTerrarium,
  onEditTerrarium,
  onDeleteTerrarium,
  onViewTerrarium,
}) {
  const { t } = useTranslation();
  if (!open || !room) return null;
  const canMoveUp = roomIndex > 0;
  const canMoveDown = roomIndex < roomCount - 1;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-[32px] bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-4 border-b border-neutral-100 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">{t('spaces.roomLabel', { defaultValue: 'Room' })}</div>
              <div className="text-2xl font-semibold text-neutral-900">{room.name}</div>
              <div className="mt-1 text-xs text-neutral-500">
                {t('spaces.roomCounts', { defaultValue: '{{racks}} racks • {{terrariums}} terrariums', racks: racks.length, terrariums: terrariums.length })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button className="px-3 py-1.5 rounded-xl border" onClick={() => onCreateRack?.(room)}>
                + {t('spaces.addRack', { defaultValue: 'Create Rack' })}
              </button>
              <button className="px-3 py-1.5 rounded-xl border" onClick={() => onCreateTerrarium?.(room)}>
                + {t('spaces.addTerrarium', { defaultValue: 'Create Terrarium' })}
              </button>
              <button className="px-3 py-1.5 rounded-xl border" onClick={onClose}>
                {t('spaces.closeRoom', { defaultValue: 'Close room' })}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button className="px-3 py-1.5 rounded-xl border" onClick={() => onRenameRoom?.(room)}>{t('actions.rename', { defaultValue: 'Rename' })}</button>
            <button className={cx('px-3 py-1.5 rounded-xl border', !canMoveUp && 'opacity-40 cursor-not-allowed')} disabled={!canMoveUp} onClick={() => canMoveUp && onMoveRoom?.(room.id, -1)}>{t('spaces.moveUp', { defaultValue: 'Move up' })}</button>
            <button className={cx('px-3 py-1.5 rounded-xl border', !canMoveDown && 'opacity-40 cursor-not-allowed')} disabled={!canMoveDown} onClick={() => canMoveDown && onMoveRoom?.(room.id, 1)}>{t('spaces.moveDown', { defaultValue: 'Move down' })}</button>
            <button className="px-3 py-1.5 rounded-xl border text-rose-600" onClick={() => onDeleteRoom?.(room.id)}>{t('actions.delete', { defaultValue: 'Delete' })}</button>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">{t('spaces.racksHeading', { defaultValue: 'Racks' })}</div>
              <div className="text-sm text-neutral-500">{t('spaces.rack.count', { defaultValue: '{{count}} racks', count: racks.length })}</div>
            </div>
            {racks.length ? (
              <div className="grid gap-3">
                {racks.map(rack => {
                  const occupied = Array.isArray(rack.slots) ? rack.slots.filter(slot => slot?.snakeId).length : 0;
                  return (
                    <div
                      key={rack.id}
                      className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm hover:border-neutral-400 cursor-pointer transition"
                      onClick={() => onViewRack?.(rack.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-neutral-900">{rack.name}</div>
                          <div className="text-xs text-neutral-500">{rack.tubSizeLabel || t('spaces.rack.tubSize', { defaultValue: 'Tub size' })}</div>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <button className="px-2 py-1 rounded-lg border" onClick={(event) => { event.stopPropagation(); onEditRack?.(rack.id); }}>{t('common.edit', { defaultValue: 'Edit' })}</button>
                          <button className="px-2 py-1 rounded-lg border text-rose-600" onClick={(event) => { event.stopPropagation(); onDeleteRack?.(rack.id); }}>{t('actions.delete', { defaultValue: 'Delete' })}</button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl bg-neutral-50 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-wide text-neutral-500">{t('spaces.rack.layout', { defaultValue: 'Layout' })}</div>
                          <div className="text-base font-semibold">{rack.columns} × {rack.levels}</div>
                        </div>
                        <div className="rounded-2xl bg-neutral-50 px-3 py-2">
                          <div className="text-[11px] uppercase tracking-wide text-neutral-500">{t('spaces.rack.summaryLabel', { defaultValue: 'Usage' })}</div>
                          <div className="text-base font-semibold">{occupied} / {rack.totalTubs || computeTotalTubs(rack.columns, rack.levels)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">{t('spaces.rack.empty', { defaultValue: 'No racks yet.' })}</div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">{t('spaces.addTerrarium', { defaultValue: 'Terrariums' })}</div>
              <div className="text-sm text-neutral-500">{t('spaces.terrarium.count', { defaultValue: '{{count}} terrariums', count: terrariums.length })}</div>
            </div>
            {terrariums.length ? (
              <div className="grid gap-3">
                {terrariums.map(item => {
                  const occupantCount = Array.isArray(item.occupantIds) ? item.occupantIds.length : 0;
                  const dims = item.dimensions
                    ? `${item.dimensions.w}×${item.dimensions.d}×${item.dimensions.h}${item.dimensions.unit}`
                    : t('spaces.dimensions.unknown', { defaultValue: 'Dimensions unknown' });
                  return (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm hover:border-neutral-400 cursor-pointer transition"
                      onClick={() => onViewTerrarium?.(item.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-neutral-900">{item.name}</div>
                          <div className="text-xs text-neutral-500">{dims}</div>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <button className="px-2 py-1 rounded-lg border" onClick={(event) => { event.stopPropagation(); onEditTerrarium?.(item.id); }}>{t('common.edit', { defaultValue: 'Edit' })}</button>
                          <button className="px-2 py-1 rounded-lg border text-rose-600" onClick={(event) => { event.stopPropagation(); onDeleteTerrarium?.(item.id); }}>{t('actions.delete', { defaultValue: 'Delete' })}</button>
                        </div>
                      </div>
                      <div className="mt-3 rounded-2xl bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-800">
                        {t('spaces.currentOccupants', { defaultValue: 'Animals inside: {{count}}', count: occupantCount })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">{t('spaces.rack.empty', { defaultValue: 'No terrariums yet.' })}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
// --- lightweight helpers (placeholders if full implementations aren't present) ---
const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

function pairingLifecycleDefaults() {
  return {
    ovulation: { observed: false, date: '', notes: '' },
    preLayShed: { observed: false, date: '', notes: '', intervalFromOvulation: null },
  clutch: { recorded: false, date: '', eggsTotal: '', fertileEggs: '', slugs: '', notes: '' },
    hatch: { scheduledDate: '', recorded: false, date: '', hatchedCount: 0, notes: '' }
  };
}
function resolveEggCountForClutch(eggsTotal, fertileEggs) {
  const candidates = [eggsTotal, fertileEggs];
  for (const value of candidates) {
    if (value === null || typeof value === 'undefined' || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return null;
}
const cx = (...parts) => parts.flat().filter(Boolean).join(' ');
const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const localYMD = (d = new Date()) => {
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const nowIsoString = () => new Date().toISOString();
function formatDateTimeForDisplay(dateLike) {
  if (!dateLike) return '';
  const dt = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function extractYearFromDateString(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function buildLockLogLine(timestampIso) {
  const normalizedDate = normalizeDateInput(timestampIso);
  if (normalizedDate) {
    const displayDate = formatDateForDisplay(normalizedDate);
    return displayDate ? `Lock observed ${displayDate}` : 'Lock observed';
  }
  const formatted = formatDateTimeForDisplay(timestampIso);
  return formatted ? `Lock observed ${formatted}` : 'Lock observed';
}

function getLockRecordedDate(appointment = {}) {
  if (!appointment || typeof appointment !== 'object') return null;
  const explicitLockDate = normalizeDateInput(appointment.lockDate || '');
  if (explicitLockDate) return explicitLockDate;
  const legacyLockDate = normalizeDateInput(appointment.lockLoggedAt || '');
  if (legacyLockDate) return legacyLockDate;
  if (appointment.lockObserved) {
    const fallbackDate = normalizeDateInput(appointment.date || '');
    if (fallbackDate) return fallbackDate;
  }
  return null;
}

const PENDING_ANIMAL_VIEW_KEY = 'breedingPlannerPendingAnimalView';
const STORAGE_KEYS = {
  snakes: 'breedingPlannerSnakes',
  pairings: 'breedingPlannerPairings',
  groups: 'breedingPlannerGroups',
  showGroups: 'breedingPlannerShowGroups',
  hiddenGroups: 'breedingPlannerHiddenGroups',
  customStatusTags: 'breedingPlannerCustomStatusTags',
  removedStatusTags: 'breedingPlannerRemovedStatusTags',
  breeder: 'breedingPlannerBreederInfo',
  morphAliases: 'breedingPlannerMorphAliases',
  geneAliases: 'breedingPlannerGeneAliases',
  leucisticType: 'breedingPlannerLeucisticType',
  lastFeedDefaults: 'breedingPlannerLastFeedDefaults',
  backupSettings: 'breedingPlannerBackupSettings',
  backupSnapshot: 'breedingPlannerBackupSnapshot',
  backupVault: 'breedingPlannerBackupVault',
  spaces: 'breedingPlannerSpaces',
  animalLayout: 'breedingPlannerAnimalLayout',
};
const DEFAULT_FAVICON_HREF = `${process.env.PUBLIC_URL || ''}/app-icons/icon_512x512.png`;
const BACKUP_FREQUENCIES = ['off', 'nightly', 'weekly', 'monthly'];
const DEFAULT_BACKUP_LIMIT = 20;
const VAULT_LIMIT_OPTIONS = [5, 10, 20, 50, 100, 200, 'unlimited'];
const BACKUP_FILE_EXTENSION = 'bpbackup';
const BACKUP_FILE_DOT_EXTENSION = `.${BACKUP_FILE_EXTENSION}`;
const BACKUP_FILE_MIME = 'application/x-breeding-planner-backup+json';
const buildBackupFilename = (basename, timestamp) => `${basename}-${timestamp}${BACKUP_FILE_DOT_EXTENSION}`;
const DEFAULT_LAST_FEED_DEFAULTS = {
  feed: 'Mouse',
  size: 'pinky',
  sizeDetail: '',
  form: 'Frozen/thawed',
  formDetail: '',
  notes: '',
  refused: false,
};

function normalizeMorphAliasLookupKey(value) {
  return String(value || '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMorphAliasCompactKey(value) {
  return normalizeMorphAliasLookupKey(value).replace(/\s+/g, '');
}

function normalizeMorphAliasEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const alias = String(entry.alias || '').trim();
  if (!alias) return null;
  const genes = (Array.isArray(entry.genes) ? entry.genes : [])
    .map(gene => String(gene || '').trim())
    .filter(Boolean);
  if (!genes.length) return null;
  const notes = typeof entry.notes === 'string' && entry.notes.trim()
    ? entry.notes.trim()
    : undefined;
  return { alias, genes, ...(notes ? { notes } : {}) };
}

function normalizeMorphAliasDatabase(value) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  source.forEach((entry) => {
    const normalized = normalizeMorphAliasEntry(entry);
    if (!normalized) return;
    const key = normalizeMorphAliasLookupKey(normalized.alias);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  });
  return out;
}

const DEFAULT_MORPH_ALIASES = normalizeMorphAliasDatabase(defaultMorphAliasesJson);
let ACTIVE_MORPH_ALIASES = [...DEFAULT_MORPH_ALIASES];
const LEUCISTIC_BEL_GENE_OPTIONS = ['Mojave', 'Lesser', 'Butter', 'Russo', 'Mystic', 'Phantom', 'Special'];
const LEUCISTIC_BLACK_EYE_GENE_OPTIONS = ['Fire', 'Lesser', 'Butter'];
const LEUCISTIC_BEL_TOKEN_PATTERN = '\\bb(?:[\\s,.;:/|_-]*)e(?:[\\s,.;:/|_-]*)l\\b';
const LEUCISTIC_TRIGGER_PATTERN = new RegExp(`\\bblue(?:[\\s,;/|_-]+)eyed(?:[\\s,;/|_-]+)leucistic\\b|${LEUCISTIC_BEL_TOKEN_PATTERN}|\\bleucistic\\b`, 'i');

function getActiveMorphAliases() {
  return Array.isArray(ACTIVE_MORPH_ALIASES) && ACTIVE_MORPH_ALIASES.length
    ? ACTIVE_MORPH_ALIASES
    : [...DEFAULT_MORPH_ALIASES];
}

function setActiveMorphAliases(value) {
  const normalized = normalizeMorphAliasDatabase(value);
  ACTIVE_MORPH_ALIASES = normalized.length ? normalized : [...DEFAULT_MORPH_ALIASES];
}

function collapseAliasGenes(genes = []) {
  const counts = new Map();
  const order = [];
  (Array.isArray(genes) ? genes : []).forEach((rawGene) => {
    const gene = String(rawGene || '').trim();
    if (!gene) return;
    const key = gene.toLowerCase();
    if (!counts.has(key)) {
      counts.set(key, { name: gene, count: 0 });
      order.push(key);
    }
    const item = counts.get(key);
    item.count += 1;
  });

  const out = [];
  order.forEach((key) => {
    const item = counts.get(key);
    if (!item) return;
    const isAlreadySuper = /^super\s+/i.test(item.name);
    if (item.count > 1 && !isAlreadySuper) {
      out.push(`Super ${item.name}`);
    } else {
      out.push(item.name);
    }
  });
  return out;
}

function resolveMorphAliasGenes(token, aliases = getActiveMorphAliases()) {
  const lookup = normalizeMorphAliasLookupKey(token);
  if (!lookup) return null;
  if (hasLeucisticTriggerText(lookup)) return null;
  const canonicalGene = resolveCanonicalGene(token, lookupCanonicalGene);
  const tokenIsKnownGene = Boolean(canonicalGene);
  if (tokenIsKnownGene) return null;
  const compactLookup = normalizeMorphAliasCompactKey(token);
  if (!compactLookup) return null;
  const allowPartialMatch = !tokenIsKnownGene
    && !/\s/.test(lookup)
    && !/[.,;:/|_\-+]/.test(String(token || ''))
    && lookup.length >= 4;

  let best = null;
  (Array.isArray(aliases) ? aliases : []).forEach((entry) => {
    const alias = String(entry?.alias || '').trim();
    const genes = Array.isArray(entry?.genes) ? entry.genes : [];
    if (!alias || !genes.length) return;

    const aliasLookup = normalizeMorphAliasLookupKey(alias);
    const aliasCompact = normalizeMorphAliasCompactKey(alias);
    if (!aliasLookup || !aliasCompact) return;
    if (hasLeucisticTriggerText(aliasLookup)) return;
    if (resolveCanonicalGene(alias, lookupCanonicalGene)) return;

    let score = Number.POSITIVE_INFINITY;
    const aliasIsSingleToken = !/\s/.test(aliasLookup);
    if (lookup === aliasLookup || compactLookup === aliasCompact) {
      score = 0;
    } else if (allowPartialMatch && aliasIsSingleToken && (aliasLookup.startsWith(lookup) || aliasCompact.startsWith(compactLookup))) {
      score = 1 + ((aliasLookup.length - lookup.length) / 1000);
    } else if (allowPartialMatch && aliasIsSingleToken && (lookup.startsWith(aliasLookup) || compactLookup.startsWith(aliasCompact))) {
      score = 2 + ((lookup.length - aliasLookup.length) / 1000);
    }

    if (!Number.isFinite(score)) return;
    if (!best || score < best.score) {
      best = { score, genes: collapseAliasGenes(genes), alias };
    }
  });

  return best?.genes?.length ? best.genes : null;
}

function hasLeucisticTriggerText(value) {
  if (!value) return false;
  return LEUCISTIC_TRIGGER_PATTERN.test(String(value));
}

function replaceLeucisticTriggerText(value, replacement) {
  if (!value) return value;
  const text = String(value);
  if (!LEUCISTIC_TRIGGER_PATTERN.test(text)) return text;
  return text.replace(new RegExp(`\\bblue(?:[\\s,;/|_-]+)eyed(?:[\\s,;/|_-]+)leucistic\\b|${LEUCISTIC_BEL_TOKEN_PATTERN}|\\bleucistic\\b`, 'ig'), replacement);
}

function stripLeucisticTriggerText(value) {
  if (!value) return '';
  const text = replaceLeucisticTriggerText(value, ' ');
  return text
    .replace(/[\s,;/|_-]{2,}/g, ' ')
    .trim();
}

function isLeucisticNoiseToken(value) {
  const token = String(value || '').trim().toLowerCase();
  return token === 'blue' || token === 'eyed' || token === 'leucistic' || token === 'bel' || token === 'blue eyed leucistic';
}

export const ANIMAL_EXPORT_FIELD_DEFS = [
  {
    key: 'name',
    label: 'Animal name',
    section: 'Identity',
    getter: snake => snake?.name || '',
  },
  {
    key: 'id',
    label: 'Animal ID',
    section: 'Identity',
    getter: snake => snake?.id || '',
  },
  {
    key: 'sex',
    label: 'Sex',
    section: 'Identity',
    getter: snake => {
      const normalized = normalizeSexValue(snake?.sex);
      if (normalized === 'F') return 'Female';
      if (normalized === 'M') return 'Male';
      return 'Unknown';
    },
  },
  {
    key: 'genetics',
    label: 'Genetics',
    section: 'Genetics',
    getter: snake => joinTokens(combineMorphsAndHetsForDisplay(snake?.morphs, snake?.hets, snake?.possibleHets)),
  },
  {
    key: 'status',
    label: 'Status tag',
    section: 'Status',
    getter: snake => snake?.status || '',
  },
  {
    key: 'weight',
    label: 'Weight',
    section: 'Vitals',
    getter: snake => {
      const manual = Number(snake?.weight);
      if (Number.isFinite(manual) && manual > 0) return `${manual} g`;
      const latest = getLatestLogEntry(snake?.logs, 'weights');
      const grams = Number(latest?.grams ?? latest?.weightGrams ?? latest?.weight);
      if (Number.isFinite(grams) && grams > 0) {
        const date = latest?.date ? ` (${formatDateForDisplay(latest.date)})` : '';
        return `${grams} g${date}`;
      }
      return '';
    },
  },
  {
    key: 'lastWeight',
    label: 'Last weigh-in',
    section: 'Vitals',
    getter: snake => {
      const latest = getLatestLogEntry(snake?.logs, 'weights');
      if (!latest) return '';
      const grams = Number(latest?.grams ?? latest?.weightGrams ?? latest?.weight);
      if (!Number.isFinite(grams) || grams <= 0) return '';
      return `${grams} g${latest?.date ? ` (${formatDateForDisplay(latest.date)})` : ''}`;
    },
  },
  {
    key: 'lastWeightGrams',
    label: 'Last weight (g)',
    section: 'Vitals',
    getter: snake => {
      const latest = getLatestLogEntry(snake?.logs, 'weights');
      const grams = Number(latest?.grams ?? latest?.weightGrams ?? latest?.weight ?? snake?.weight);
      return Number.isFinite(grams) && grams > 0 ? grams : '';
    },
  },
  {
    key: 'birthDate',
    label: 'Birth date',
    section: 'Vitals',
    getter: snake => (snake?.birthDate ? formatDateForDisplay(snake.birthDate) : ''),
  },
  {
    key: 'year',
    label: 'Birth year',
    section: 'Vitals',
    getter: snake => snake?.year || extractYearFromDateString(snake?.birthDate) || '',
  },
  {
    key: 'groups',
    label: 'Groups',
    section: 'Organization',
    getter: snake => joinTokens(snake?.groups),
  },
  {
    key: 'tags',
    label: 'Tags',
    section: 'Organization',
    getter: snake => joinTokens(snake?.tags),
  },
  {
    key: 'notes',
    label: 'Notes',
    section: 'Organization',
    getter: snake => snake?.notes || '',
  },
  {
    key: 'projects',
    label: 'Projects',
    section: 'Projects',
    getter: (snake, ctx = {}) => {
      const pairings = ctx.pairingsBySnakeId?.get(snake?.id) || [];
      const labels = pairings.map(item => item?.label).filter(Boolean);
      return joinTokens(labels);
    },
  },
  {
    key: 'lastFeed',
    label: 'Last feed',
    section: 'Logs',
    getter: snake => {
      const entry = getLatestLogEntry(snake?.logs, 'feeds');
      if (!entry) return '';
      const parts = [];
      if (entry.feed) parts.push(entry.feed);
      if (entry.size) parts.push(entry.size === 'Other' ? entry.sizeDetail || entry.size : entry.size);
      if (entry.refused) parts.push('Refused');
      if (entry.method) parts.push(entry.method === 'Other' ? entry.methodDetail || entry.method : entry.method);
      const summary = parts.filter(Boolean).join(' — ');
      return summary ? `${summary}${entry.date ? ` (${formatDateForDisplay(entry.date)})` : ''}` : (entry.date ? formatDateForDisplay(entry.date) : '');
    },
  },
  {
    key: 'lastFeedDate',
    label: 'Last feed date',
    section: 'Logs',
    getter: snake => {
      const entry = getLatestLogEntry(snake?.logs, 'feeds');
      return entry?.date ? formatDateForDisplay(entry.date) : '';
    },
  },
];

export const DEFAULT_ANIMAL_EXPORT_FIELDS = [
  'name',
  'id',
  'sex',
  'genetics',
  'status',
  'weight',
  'lastFeed',
  'groups',
  'tags',
  'projects',
];

export const PAIRING_EXPORT_FIELD_DEFS = [
  {
    key: 'label',
    label: 'Project label',
    section: 'Summary',
    getter: (pairing, ctx = {}) => ctx.displayLabel || pairing?.label || pairing?.id || '',
  },
  {
    key: 'id',
    label: 'Pairing ID',
    section: 'Summary',
    getter: pairing => pairing?.id || '',
  },
  {
    key: 'cycleYear',
    label: 'Cycle year',
    section: 'Summary',
    getter: (pairing, ctx = {}) => ctx.cycleYear || '',
  },
  {
    key: 'status',
    label: 'Project status',
    section: 'Summary',
    getter: (pairing, ctx = {}) => summarizePairingStatus(ctx.derived),
  },
  {
    key: 'goals',
    label: 'Goals',
    section: 'Summary',
    getter: pairing => joinTokens(pairing?.goals),
  },
  {
    key: 'hatchlingsCount',
    label: 'Hatchlings produced',
    section: 'Summary',
    getter: (pairing, ctx = {}) => (Array.isArray(ctx.hatchlings) ? ctx.hatchlings.length : ''),
  },
  {
    key: 'femaleId',
    label: 'Female ID',
    section: 'Participants',
    getter: pairing => pairing?.femaleId || '',
  },
  {
    key: 'femaleName',
    label: 'Female name',
    section: 'Participants',
    getter: (pairing, ctx = {}) => ctx.femaleName || pairing?.femaleId || '',
  },
  {
    key: 'femaleGenetics',
    label: 'Female genetics',
    section: 'Participants',
    getter: (pairing, ctx = {}) => ctx.femaleGenetics || '',
  },
  {
    key: 'maleId',
    label: 'Male ID',
    section: 'Participants',
    getter: pairing => pairing?.maleId || '',
  },
  {
    key: 'maleName',
    label: 'Male name',
    section: 'Participants',
    getter: (pairing, ctx = {}) => ctx.maleName || pairing?.maleId || '',
  },
  {
    key: 'maleGenetics',
    label: 'Male genetics',
    section: 'Participants',
    getter: (pairing, ctx = {}) => ctx.maleGenetics || '',
  },
  {
    key: 'startDate',
    label: 'Start date',
    section: 'Timeline',
    getter: pairing => (pairing?.startDate ? formatDateForDisplay(pairing.startDate) : ''),
  },
  {
    key: 'ovulationDate',
    label: 'Ovulation date',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.ovulationDate ? formatDateForDisplay(ctx.derived.ovulationDate) : ''),
  },
  {
    key: 'preLayDate',
    label: 'Pre-lay shed',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.preLayDate ? formatDateForDisplay(ctx.derived.preLayDate) : ''),
  },
  {
    key: 'clutchDate',
    label: 'Clutch date',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.clutchDate ? formatDateForDisplay(ctx.derived.clutchDate) : ''),
  },
  {
    key: 'eggsTotal',
    label: 'Eggs laid',
    section: 'Outcomes',
    getter: pairing => {
      const value = pairing?.clutch?.eggsTotal;
      if (Number.isFinite(Number(value))) return Number(value);
      return value || '';
    },
  },
  {
    key: 'fertileEggs',
    label: 'Fertile eggs',
    section: 'Outcomes',
    getter: pairing => {
      const value = pairing?.clutch?.fertileEggs;
      if (Number.isFinite(Number(value))) return Number(value);
      return value || '';
    },
  },
  {
    key: 'slugs',
    label: 'Slugs',
    section: 'Outcomes',
    getter: pairing => {
      const value = pairing?.clutch?.slugs;
      if (Number.isFinite(Number(value))) return Number(value);
      return value || '';
    },
  },
  {
    key: 'hatchDate',
    label: 'Hatch date',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.hatchDate ? formatDateForDisplay(ctx.derived.hatchDate) : ''),
  },
  {
    key: 'hatchScheduledDate',
    label: 'Scheduled hatch',
    section: 'Timeline',
    getter: (pairing, ctx = {}) => (ctx.derived?.hatchScheduledDate ? formatDateForDisplay(ctx.derived.hatchScheduledDate) : ''),
  },
  {
    key: 'hatchedCount',
    label: 'Hatched count',
    section: 'Outcomes',
    getter: pairing => {
      const value = pairing?.hatch?.hatchedCount;
      if (Number.isFinite(Number(value))) return Number(value);
      return value || '';
    },
  },
];

export const DEFAULT_PAIRING_EXPORT_FIELDS = [
  'label',
  'cycleYear',
  'femaleName',
  'maleName',
  'clutchDate',
  'eggsTotal',
  'hatchDate',
  'hatchedCount',
  'status',
];

function normalizeExportFieldSelection(selection, fallback, definitions) {
  const allowed = new Set(definitions.map(def => def.key));
  const cleaned = Array.isArray(selection)
    ? selection.filter(key => allowed.has(key))
    : [];
  return cleaned.length ? cleaned : [...fallback];
}

function buildAnimalExportDataset(snakes = [], pairings = [], selected = DEFAULT_ANIMAL_EXPORT_FIELDS) {
  const normalizedFields = normalizeExportFieldSelection(selected, DEFAULT_ANIMAL_EXPORT_FIELDS, ANIMAL_EXPORT_FIELD_DEFS);
  const defByKey = new Map(ANIMAL_EXPORT_FIELD_DEFS.map(def => [def.key, def]));
  const selectedDefs = normalizedFields.map(key => defByKey.get(key)).filter(Boolean);
  const snakeMap = makeSnakeMap(snakes);
  const pairingsBySnakeId = groupPairingsBySnake(pairings, snakeMap);
  const context = { snakes, pairings, snakeMap, pairingsBySnakeId };
  const rows = [];
  (Array.isArray(snakes) ? snakes : []).forEach(snake => {
    if (!snake) return;
    const row = {};
    selectedDefs.forEach(def => {
      const raw = typeof def.getter === 'function' ? def.getter(snake, context) : snake[def.key];
      row[def.key] = formatExportValue(raw);
    });
    rows.push(row);
  });
  return {
    columns: selectedDefs.map(def => ({ key: def.key, label: def.label })),
    rows,
  };
}

function buildAnimalListDataset(snakesSubset = [], options = {}) {
  const {
    allSnakes = snakesSubset,
    pairings = [],
    labels = {},
  } = options || {};
  const columnLabel = (key, fallback) => labels[key] || fallback;
  const columns = [
    { key: 'animal', label: columnLabel('animal', 'Animal') },
    { key: 'id', label: columnLabel('id', 'ID') },
    { key: 'sex', label: columnLabel('sex', 'Sex') },
    { key: 'genetics', label: columnLabel('genetics', 'Genetics') },
    { key: 'status', label: columnLabel('status', 'Status') },
    { key: 'weight', label: columnLabel('weight', 'Weight') },
    { key: 'lastFeed', label: columnLabel('lastFeed', 'Last feed') },
    { key: 'groups', label: columnLabel('groups', 'Groups') },
    { key: 'tags', label: columnLabel('tags', 'Tags') },
    { key: 'projects', label: columnLabel('projects', 'Projects') },
  ];

  const snakeMap = makeSnakeMap(allSnakes);
  const pairingsBySnakeId = groupPairingsBySnake(pairings, snakeMap);

  const formatWeightSummary = (snake) => {
    const manualWeight = Number(snake?.weight);
    if (Number.isFinite(manualWeight) && manualWeight > 0) {
      const dateMark = snake?.weightDate ? ` (${formatDateForDisplay(snake.weightDate)})` : '';
      return `${manualWeight} g${dateMark}`;
    }
    const weightEntry = getLatestLogEntry(snake?.logs, 'weights');
    const loggedWeight = Number(weightEntry?.grams ?? weightEntry?.weightGrams ?? weightEntry?.weight);
    if (Number.isFinite(loggedWeight) && loggedWeight > 0) {
      const dateMark = weightEntry?.date ? ` (${formatDateForDisplay(weightEntry.date)})` : '';
      return `${loggedWeight} g${dateMark}`;
    }
    return labels.noData || 'No data';
  };

  const formatFeedSummary = (snake) => {
    const entry = getLatestLogEntry(snake?.logs, 'feeds');
    if (!entry) {
      return labels.noData || 'No data';
    }
    const dateMark = entry.date ? ` (${formatDateForDisplay(entry.date)})` : '';
    if (entry.refused) {
      return `${labels.refused || 'Refused feed'}${dateMark}`;
    }
    const feedParts = [];
    if (entry.feed) feedParts.push(entry.feed);
    const sizeToken = entry.size === 'Other' ? entry.sizeDetail : entry.size;
    if (sizeToken) feedParts.push(sizeToken);
    const grams = Number(entry.weightGrams ?? entry.grams);
    if (Number.isFinite(grams) && grams > 0) feedParts.push(`${grams} g`);
    const method = entry.method === 'Other' ? entry.methodDetail : entry.method;
    if (method) feedParts.push(method);
    const summary = feedParts.length ? feedParts.join(' — ') : (labels.feedDefault || 'Feed');
    return `${summary}${dateMark}`.trim();
  };

  const rows = (Array.isArray(snakesSubset) ? snakesSubset : [])
    .filter(Boolean)
    .map(snake => {
      const geneticsTokens = combineMorphsAndHetsForDisplay(snake?.morphs, snake?.hets, snake?.possibleHets);
      const statusLabel = typeof snake?.status === 'string' && snake.status.trim()
        ? snake.status.trim()
        : labels.statusPlaceholder || 'Status';
      const normalizedSex = normalizeSexValue(snake?.sex);
      const sexLabel = normalizedSex === 'M'
        ? labels.sexMale || 'Male'
        : normalizedSex === 'F'
          ? labels.sexFemale || 'Female'
          : labels.sexUnknown || 'Unknown';
      const groupsText = joinTokens(snake?.groups) || labels.noGroup || 'No group';
      const tagsText = joinTokens(snake?.tags);
      const relatedPairings = pairingsBySnakeId.get(snake?.id) || [];
      const projectLabels = relatedPairings.map(item => item?.label).filter(Boolean);
      return {
        animal: snake?.name || labels.unnamed || 'Unnamed',
        id: snake?.id || '—',
        sex: sexLabel,
        genetics: joinTokens(geneticsTokens),
        status: statusLabel,
        weight: formatWeightSummary(snake),
        lastFeed: formatFeedSummary(snake),
        groups: groupsText,
        tags: tagsText,
        projects: joinTokens(projectLabels),
      };
    });

  return { columns, rows };
}

function escapeCsvValue(value) {
  if (value === null || typeof value === 'undefined') return '';
  const normalized = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[",\n]/.test(normalized)) {
    return '"' + normalized.replace(/"/g, '""') + '"';
  }
  return normalized;
}

async function exportAnimalListToCsv(snakesSubset = [], options = {}) {
  const dataset = buildAnimalListDataset(snakesSubset, {
    allSnakes: options.allSnakes || snakesSubset,
    pairings: options.pairings || [],
    labels: options.labels || {},
  });
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const columnKeys = columns.map(column => column.key);
  const csvRows = [];
  csvRows.push(columns.map(column => escapeCsvValue(column.label || column.key || '')));
  rows.forEach(row => {
    const line = columnKeys.map(key => escapeCsvValue(row?.[key]));
    csvRows.push(line);
  });
  const csvContent = csvRows.map(line => line.join(',')).join('\n');
  const csvWithBom = '\uFEFF' + csvContent;
  const fileName = options.fileName || 'animal-list.csv';

  const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
  if (bridge?.saveFile) {
    try {
      await bridge.saveFile({
        data: csvWithBom,
        fileName,
        encoding: 'utf8',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      return;
    } catch (error) {
      console.warn('Electron saveFile bridge failed; falling back to browser download.', error);
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('CSV export requires a browser environment.');
  }
  const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function exportDatasetToCsv(dataset, options = {}) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  if (!columns.length) {
    throw new Error('CSV export requires at least one column.');
  }
  const columnKeys = columns.map(column => column.key);
  const csvRows = [];
  csvRows.push(columns.map(column => escapeCsvValue(column.label || column.key || '')));
  rows.forEach(row => {
    const line = columnKeys.map(key => escapeCsvValue(row?.[key]));
    csvRows.push(line);
  });
  const csvContent = csvRows.map(line => line.join(',')).join('\n');
  const csvWithBom = '\uFEFF' + csvContent;
  const fileName = options.fileName || 'export.csv';

  const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
  if (bridge?.saveFile) {
    try {
      await bridge.saveFile({
        data: csvWithBom,
        fileName,
        encoding: 'utf8',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      return;
    } catch (error) {
      console.warn('Electron saveFile bridge failed; falling back to browser download.', error);
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('CSV export requires a browser environment.');
  }
  const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function buildPairingExportDataset(pairings = [], snakes = [], selected = DEFAULT_PAIRING_EXPORT_FIELDS) {
  const normalizedFields = normalizeExportFieldSelection(selected, DEFAULT_PAIRING_EXPORT_FIELDS, PAIRING_EXPORT_FIELD_DEFS);
  const defByKey = new Map(PAIRING_EXPORT_FIELD_DEFS.map(def => [def.key, def]));
  const selectedDefs = normalizedFields.map(key => defByKey.get(key)).filter(Boolean);
  const snakeMap = makeSnakeMap(snakes);
  const hatchlingsByPairing = groupHatchlingsByPairing(snakes);
  const rows = [];
  (Array.isArray(pairings) ? pairings : []).forEach(rawPairing => {
    if (!rawPairing) return;
    const pairing = withPairingLifecycleDefaults({ ...rawPairing });
    const derived = getBreedingCycleDerived(pairing);
    const femaleSnake = pairing?.femaleId ? snakeMap.get(pairing.femaleId) : null;
    const maleSnake = pairing?.maleId ? snakeMap.get(pairing.maleId) : null;
    const displayLabel = resolvePairingLabel(pairing, femaleSnake, maleSnake);
    const cycleYear = computeBreedingCycleYear({
      clutchDate: derived.clutchDate,
      preLayDate: derived.preLayDate,
      ovulationDate: derived.ovulationDate,
      hatchDate: derived.hatchDate,
      startDate: pairing.startDate || '',
    });
    const hatchlings = hatchlingsByPairing.get(pairing.id) || [];
    const context = {
      snakes,
      pairings,
      snakeMap,
      derived,
      displayLabel,
      femaleSnake,
      femaleName: femaleSnake?.name || pairing.femaleId || '',
      femaleGenetics: joinTokens(combineMorphsAndHetsForDisplay(femaleSnake?.morphs, femaleSnake?.hets, femaleSnake?.possibleHets)),
      maleSnake,
      maleName: maleSnake?.name || pairing.maleId || '',
      maleGenetics: joinTokens(combineMorphsAndHetsForDisplay(maleSnake?.morphs, maleSnake?.hets, maleSnake?.possibleHets)),
      cycleYear,
      hatchlings,
    };
    const row = {};
    selectedDefs.forEach(def => {
      const raw = typeof def.getter === 'function' ? def.getter(pairing, context) : pairing[def.key];
      row[def.key] = formatExportValue(raw);
    });
    rows.push(row);
  });
  return {
    columns: selectedDefs.map(def => ({ key: def.key, label: def.label })),
    rows,
  };
}

function resolveAnimalCode(animal) {
  if (!animal || typeof animal !== 'object') return '';
  const candidates = [animal.code, animal.displayId, animal.externalId, animal.id, animal.name];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

function getPairingSeasonToken(pairing) {
  if (!pairing || typeof pairing !== 'object') return null;
  if (pairing.seasonId) return String(pairing.seasonId);
  if (pairing.season?.id) return String(pairing.season.id);
  if (typeof pairing.cycleYear !== 'undefined' && pairing.cycleYear !== null) {
    return String(pairing.cycleYear);
  }
  if (pairing.seasonKey) return String(pairing.seasonKey);
  return null;
}

function resolvePairingSeasonName(pairing) {
  if (!pairing || typeof pairing !== 'object') return '';
  if (typeof pairing.seasonName === 'string' && pairing.seasonName.trim()) {
    return pairing.seasonName.trim();
  }
  if (pairing.season && typeof pairing.season === 'object') {
    if (typeof pairing.season.label === 'string' && pairing.season.label.trim()) {
      return pairing.season.label.trim();
    }
    if (typeof pairing.season.name === 'string' && pairing.season.name.trim()) {
      return pairing.season.name.trim();
    }
  }
  if (typeof pairing.cycleYear !== 'undefined' && pairing.cycleYear !== null) {
    return String(pairing.cycleYear);
  }
  return '';
}

function getPairingExportRows(pairings = [], snakes = [], options = {}) {
  const {
    seasonId = null,
    statuses = [],
    includeUnpaired = false,
  } = options || {};
  const normalizedSeasonId = typeof seasonId === 'string' && seasonId.trim()
    ? seasonId.trim()
    : (seasonId === 0 ? '0' : null);
  const normalizedStatuses = Array.isArray(statuses)
    ? statuses.map(value => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : [];
  const snakeMap = makeSnakeMap(snakes);
  const rows = [];
  const pairedMaleIds = new Set();
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const sourcePairings = Array.isArray(pairings) ? pairings : [];

  sourcePairings.forEach(pairing => {
    if (!pairing) return;
    if (normalizedSeasonId) {
      const token = getPairingSeasonToken(pairing);
      if (!token || token !== normalizedSeasonId) {
        return;
      }
    }
    if (normalizedStatuses.length) {
      const statusValue = typeof pairing.status === 'string' ? pairing.status.trim() : '';
      if (!normalizedStatuses.includes(statusValue)) {
        return;
      }
    }
    const maleSnake = pairing.maleId ? snakeMap.get(pairing.maleId) : null;
    const femaleSnake = pairing.femaleId ? snakeMap.get(pairing.femaleId) : null;
    const maleCode = resolveAnimalCode(maleSnake) || resolveAnimalCode({ id: pairing.maleId, name: pairing.maleName, code: pairing.maleCode });
    const femaleCode = resolveAnimalCode(femaleSnake) || resolveAnimalCode({ id: pairing.femaleId, name: pairing.femaleName, code: pairing.femaleCode });
    const numericSortIndex = Number.isFinite(Number(pairing.sortIndex)) ? Number(pairing.sortIndex) : null;
    const orderWarning = numericSortIndex === null ? 'order not set' : null;
    const row = {
      pairingId: pairing.id,
      maleId: pairing.maleId || maleCode,
      maleCode: maleCode || pairing.maleId || '',
      maleName: maleSnake?.name || pairing.maleName || pairing.maleId || '',
      femaleId: pairing.femaleId || femaleCode,
      femaleCode: femaleCode || pairing.femaleId || '',
      femaleName: femaleSnake?.name || pairing.femaleName || pairing.femaleId || '',
      pairingOrder: numericSortIndex,
      pairingOrderDisplay: numericSortIndex === null ? 'order not set' : numericSortIndex,
      status: pairing.status || '',
      seasonName: resolvePairingSeasonName(pairing),
      startDate: pairing.startDate || '',
      notes: pairing.notes || '',
      sortIndex: numericSortIndex,
      orderWarning,
    };
    if (row.maleId) {
      pairedMaleIds.add(row.maleId);
    } else if (row.maleCode) {
      pairedMaleIds.add(row.maleCode);
    }
    rows.push(row);
  });

  if (includeUnpaired) {
    (Array.isArray(snakes) ? snakes : []).forEach(snake => {
      if (!snake) return;
      if (normalizeSexValue(snake.sex) !== 'M') return;
      const candidateId = snake.id || resolveAnimalCode(snake);
      if (!candidateId || pairedMaleIds.has(candidateId)) return;
      const fallbackCode = resolveAnimalCode(snake) || snake.id || snake.name || '';
      rows.push({
        pairingId: null,
        maleId: snake.id || fallbackCode,
        maleCode: fallbackCode,
        maleName: snake.name || fallbackCode || 'Unidentified male',
        femaleId: '',
        femaleCode: '',
        femaleName: '',
        pairingOrder: null,
        pairingOrderDisplay: 'order not set',
        status: 'Unpaired',
        seasonName: '',
        startDate: '',
        notes: 'No recorded pairings for the selected filters.',
        sortIndex: null,
        orderWarning: 'order not set',
      });
    });
  }

  rows.sort((a, b) => {
    const maleCompare = collator.compare(a.maleCode || a.maleName || '', b.maleCode || b.maleName || '');
    if (maleCompare !== 0) return maleCompare;
    const orderA = Number.isFinite(a.sortIndex) ? a.sortIndex : Number.POSITIVE_INFINITY;
    const orderB = Number.isFinite(b.sortIndex) ? b.sortIndex : Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;
    return collator.compare(a.femaleCode || a.femaleName || '', b.femaleCode || b.femaleName || '');
  });

  return rows;
}

function buildPairingMatrixExportDataset(pairings = [], snakes = [], options = {}) {
  const rows = getPairingExportRows(pairings, snakes, options);
  const columns = [
    { key: 'maleCode', label: 'Male code' },
    { key: 'maleName', label: 'Male name' },
    { key: 'femaleCode', label: 'Female code' },
    { key: 'femaleName', label: 'Female name' },
    { key: 'pairingOrder', label: 'Pairing order' },
    { key: 'status', label: 'Status' },
    { key: 'seasonName', label: 'Season' },
    { key: 'startDate', label: 'Start date' },
    { key: 'notes', label: 'Notes' },
  ];

  const formattedRows = rows.map(row => {
    const noteSegments = [];
    if (row.notes) noteSegments.push(row.notes);
    if (row.orderWarning && !noteSegments.includes(row.orderWarning)) {
      noteSegments.push(row.orderWarning);
    }
    return {
      maleCode: row.maleCode || row.maleName || '',
      maleName: row.maleName || '',
      femaleCode: row.femaleCode || row.femaleName || '',
      femaleName: row.femaleName || '',
      pairingOrder: row.pairingOrderDisplay ?? row.pairingOrder ?? '',
      status: row.status || '',
      seasonName: row.seasonName || '',
      startDate: row.startDate ? formatDateForDisplay(row.startDate) : '',
      notes: noteSegments.filter(Boolean).join(' — '),
    };
  });

  return { columns, rows: formattedRows };
}

function formatExportValue(value) {
  if (value === null || typeof value === 'undefined') return '';
  if (Array.isArray(value)) {
    const parts = value
      .map(item => {
        const formatted = formatExportValue(item);
        if (formatted === null || typeof formatted === 'undefined') return '';
        if (typeof formatted === 'number') return String(formatted);
        return formatted;
      })
      .filter(Boolean);
    return parts.join(', ');
  }
  if (value instanceof Date) {
    return formatDateForDisplay(value) || value.toISOString();
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return value;
}

function joinTokens(values) {
  if (!Array.isArray(values)) {
    if (values === null || typeof values === 'undefined') return '';
    return String(values);
  }
  return values
    .map(value => (value === null || typeof value === 'undefined' ? '' : String(value).trim()))
    .filter(Boolean)
    .join(', ');
}

function getLatestLogEntry(logs, key) {
  if (!logs || typeof logs !== 'object') return null;
  const entries = Array.isArray(logs[key]) ? logs[key] : [];
  if (!entries.length) return null;
  return entries[entries.length - 1];
}

function makeSnakeMap(snakes = []) {
  const map = new Map();
  (Array.isArray(snakes) ? snakes : []).forEach(snake => {
    if (snake && snake.id) {
      map.set(snake.id, snake);
    }
  });
  return map;
}

function groupPairingsBySnake(pairings = [], snakeMap = new Map()) {
  const map = new Map();
  (Array.isArray(pairings) ? pairings : []).forEach(rawPairing => {
    if (!rawPairing) return;
    const pairing = withPairingLifecycleDefaults({ ...rawPairing });
    const femaleSnake = pairing.femaleId ? snakeMap.get(pairing.femaleId) : null;
    const maleSnake = pairing.maleId ? snakeMap.get(pairing.maleId) : null;
    const label = resolvePairingLabel(pairing, femaleSnake, maleSnake);
    if (pairing.femaleId) {
      if (!map.has(pairing.femaleId)) map.set(pairing.femaleId, []);
      map.get(pairing.femaleId).push({ id: pairing.id, label });
    }
    if (pairing.maleId) {
      if (!map.has(pairing.maleId)) map.set(pairing.maleId, []);
      map.get(pairing.maleId).push({ id: pairing.id, label });
    }
  });
  return map;
}

function groupHatchlingsByPairing(snakes = []) {
  const map = new Map();
  (Array.isArray(snakes) ? snakes : []).forEach(snake => {
    if (!snake) return;
    const pairingId = snake.pairingId || snake?.metadata?.pairingId || null;
    if (!pairingId) return;
    if (!map.has(pairingId)) map.set(pairingId, []);
    map.get(pairingId).push(snake);
  });
  return map;
}

function resolvePairingLabel(pairing, femaleSnake, maleSnake) {
  if (pairing?.label && pairing.label.trim()) return pairing.label.trim();
  const femaleName = femaleSnake?.name || pairing?.femaleId || 'Female';
  const maleName = maleSnake?.name || pairing?.maleId || 'Male';
  return `${femaleName} \u00D7 ${maleName}`;
}

function summarizePairingStatus(derived) {
  if (!derived) return 'Planned';
  if (derived.hatchedRecorded) return 'Hatched';
  if (derived.clutchRecorded) return 'Eggs laid';
  if (derived.preLayObserved) return 'Pre-lay shed';
  if (derived.ovulationObserved) return 'Ovulation observed';
  return 'Planned';
}

function describePairingStage(pairing) {
  if (!pairing) return '';
  const normalized = withPairingLifecycleDefaults({ ...pairing });
  const derived = getBreedingCycleDerived(normalized);
  const baseStatus = summarizePairingStatus(derived);

  const appointments = Array.isArray(normalized.appointments) ? normalized.appointments.slice() : [];
  const comparableAppointments = appointments
    .map(appt => {
      const date = new Date(appt.date || appt.start || appt.end || '');
      if (Number.isNaN(date.getTime())) return null;
      date.setHours(0, 0, 0, 0);
      return { info: appt, date };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = comparableAppointments.find(item => item.date.getTime() >= today.getTime());
  const latestPast = comparableAppointments
    .filter(item => item.date.getTime() < today.getTime())
    .pop();

  const detailParts = [];

  if (normalized?.clutch?.recorded && normalized?.clutch?.date) {
    detailParts.push(`Clutch on ${formatDateForDisplay(normalized.clutch.date)}`);
  } else if (normalized?.ovulation?.observed && normalized?.ovulation?.date) {
    detailParts.push(`Ovulation recorded ${formatDateForDisplay(normalized.ovulation.date)}`);
  }

  if (upcoming) {
    detailParts.push(`Next appointment ${formatDateForDisplay(upcoming.date)}`);
  } else if (latestPast) {
    detailParts.push(`Last appointment ${formatDateForDisplay(latestPast.date)}`);
  }

  return detailParts.length ? `${baseStatus} — ${detailParts.join(' — ')}` : baseStatus;
}

async function exportDatasetToPdf(dataset, options = {}) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const { title = '', subtitle = '', fileName = 'export.pdf', orientation = 'landscape' } = options;
  const { jsPDF } = await import(/* webpackMode: "eager" */ 'jspdf');
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  await applyPdfUnicodeFont(doc);
  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 8;
  const rowPadding = 2;
  const baseLineHeight = 4.5;

  let y = margin;
  doc.setFontSize(14);
  if (title) {
    doc.text(title, margin, y);
    y += 7;
  }
  if (subtitle) {
    doc.setFontSize(10);
    doc.text(subtitle, margin, y);
    y += 6;
  }
  doc.setFontSize(9);

  if (!columns.length) {
    doc.text('No columns selected.', margin, y + 5);
    doc.save(fileName);
    return;
  }

  const availableWidth = pageWidth - margin * 2;
  const minWidth = 22;
  let baseWidth = availableWidth / columns.length;
  let widths = columns.map(() => baseWidth);
  if (baseWidth > minWidth) {
    widths = columns.map(() => Math.max(minWidth, baseWidth));
    const total = widths.reduce((sum, value) => sum + value, 0);
    if (total > availableWidth) {
      const scale = availableWidth / total;
      widths = widths.map(value => value * scale);
    }
  } else {
    widths = columns.map(() => baseWidth);
  }

  const renderHeader = () => {
    let x = margin;
    doc.setFontSize(9);
    setPdfFont(doc, 'bold');
    columns.forEach((column, index) => {
      doc.setFillColor(237, 242, 247);
      doc.setDrawColor(210);
      doc.rect(x, y, widths[index], headerHeight, 'FD');
      doc.setTextColor(51, 65, 85);
      const label = column.label || column.key || `Column ${index + 1}`;
      doc.text(label, x + 2, y + headerHeight - 2);
      x += widths[index];
    });
    setPdfFont(doc, 'normal');
    doc.setTextColor(17, 24, 39);
    y += headerHeight;
  };

  renderHeader();

  rows.forEach(row => {
    const cellLines = columns.map((column, index) => {
      const raw = row[column.key];
      const value = raw === null || typeof raw === 'undefined' ? '' : raw;
      const text = typeof value === 'number' ? String(value) : String(value || '');
      const wrapWidth = Math.max(10, widths[index] - 4);
      return doc.splitTextToSize(text, wrapWidth);
    });
    const maxLines = cellLines.reduce((max, lines) => Math.max(max, lines.length || 1), 1);
    const rowHeight = Math.max(headerHeight, maxLines * baseLineHeight + rowPadding * 2);
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage(undefined, orientation);
      y = margin;
      renderHeader();
    }
    let x = margin;
    columns.forEach((column, index) => {
      const lines = cellLines[index];
      doc.setDrawColor(230);
      doc.rect(x, y, widths[index], rowHeight);
      doc.text(lines, x + 2, y + rowPadding + 3);
      x += widths[index];
    });
    y += rowHeight;
  });

  const generatedAt = new Date().toISOString();
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Generated ${formatDateTimeForDisplay(generatedAt) || generatedAt}`, margin, pageHeight - margin + 4);
  doc.save(fileName);
}

async function exportDatasetToXlsx(dataset, options = {}) {
  const columns = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset?.rows) ? dataset.rows : [];
  const { fileName = 'export.xlsx' } = options;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Spreadsheet export is only supported in a browser environment.');
  }
  let XLSX;
  try {
    XLSX = await import(/* webpackMode: "eager" */ 'xlsx');
  } catch (err) {
    throw new Error('XLSX library is unavailable.');
  }
  if (!XLSX || !XLSX.utils) {
    throw new Error('XLSX library is unavailable.');
  }
  const headerLabels = columns.map(column => column.label || column.key);
  const sheetRows = rows.map(row => {
    const entry = {};
    columns.forEach(column => {
      const key = column.label || column.key;
      const value = row[column.key];
      entry[key] = value === null || typeof value === 'undefined' ? '' : value;
    });
    return entry;
  });
  const worksheet = XLSX.utils.json_to_sheet(sheetRows, { header: headerLabels });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Export');
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function groupFieldDefsBySection(defs = []) {
  const sections = new Map();
  defs.forEach(def => {
    const key = def.section || 'Other';
    if (!sections.has(key)) {
      sections.set(key, []);
    }
    sections.get(key).push(def);
  });
  return Array.from(sections.entries()).map(([section, fields]) => ({ section, fields }));
}

function normalizeBackupSettings(raw) {
  const defaults = { frequency: 'off', lastRun: null, maxVaultEntries: DEFAULT_BACKUP_LIMIT };
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const frequency = BACKUP_FREQUENCIES.includes(raw.frequency) ? raw.frequency : defaults.frequency;
  const lastRun = typeof raw.lastRun === 'string' && raw.lastRun ? raw.lastRun : null;
  let maxVaultEntries = defaults.maxVaultEntries;
  if (raw.maxVaultEntries === 'unlimited' || raw.maxVaultEntries === null) {
    maxVaultEntries = null;
  } else {
    const parsed = parseInt(raw.maxVaultEntries, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      maxVaultEntries = Math.min(parsed, 200);
    }
  }
  return { frequency, lastRun, maxVaultEntries };
}

function backupFrequencyToMs(freq) {
  switch (freq) {
    case 'nightly':
      return 24 * 60 * 60 * 1000;
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function normalizeBackupSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const savedAt = typeof raw.savedAt === 'string' && raw.savedAt ? raw.savedAt : null;
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
  if (!savedAt || !payload) return null;
  return { savedAt, payload };
}

const LEGACY_DEFAULT_ID_TEMPLATE = '[YR][PREFIX]-[SEQ]';

const DEFAULT_ID_GENERATOR_CONFIG = Object.freeze({
  template: '[YROB][GEN3][-][SEX]-[SEQ]',
  sequencePadding: 1,
  uppercase: false,
  customText: '',
});

function getDefaultIdGeneratorConfig() {
  return { ...DEFAULT_ID_GENERATOR_CONFIG };
}

function normalizeIdGeneratorConfig(raw) {
  const base = getDefaultIdGeneratorConfig();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const result = { ...base, ...raw };
  result.template = String(result.template || base.template);
  const pad = parseInt(result.sequencePadding, 10);
  result.sequencePadding = Number.isFinite(pad) && pad > 0 ? Math.min(pad, 6) : base.sequencePadding;
  result.uppercase = result.uppercase !== false;
  result.customText = String(
    typeof result.customText === 'string'
      ? result.customText
      : (result.customText ?? base.customText ?? '')
  );
  return result;
}

function normalizeBreederInfo(raw) {
  const base = {
    name: '',
    businessName: '',
    email: '',
    phone: '',
    street: '',
    postalCode: '',
    city: '',
    country: '',
    logoUrl: '',
    idGenerator: getDefaultIdGeneratorConfig(),
    pdfLabelSettings: normalizePdfLabelSettings(null),
    labLabelSettings: getDefaultLabLabelSizeSettings(),
  };
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const info = { ...base, ...raw };
  const rawIdGenerator = raw?.idGenerator;
  let normalizedConfig = normalizeIdGeneratorConfig(info.idGenerator);
  const shouldUpgradeTemplate =
    !rawIdGenerator ||
    (typeof rawIdGenerator === 'object' &&
      (!Object.prototype.hasOwnProperty.call(rawIdGenerator, 'template') ||
        String(rawIdGenerator.template || '').trim() === LEGACY_DEFAULT_ID_TEMPLATE) &&
      !Object.prototype.hasOwnProperty.call(rawIdGenerator, 'customText') &&
      !Object.prototype.hasOwnProperty.call(rawIdGenerator, 'uppercase') &&
      !Object.prototype.hasOwnProperty.call(rawIdGenerator, 'sequencePadding'));
  if (shouldUpgradeTemplate) {
    normalizedConfig = {
      ...normalizedConfig,
      template: DEFAULT_ID_GENERATOR_CONFIG.template,
    };
  }
  info.idGenerator = normalizeIdGeneratorConfig(normalizedConfig);
  info.pdfLabelSettings = normalizePdfLabelSettings(raw?.pdfLabelSettings || info.pdfLabelSettings);
  info.labLabelSettings = normalizeLabLabelSizeSettings(raw?.labLabelSettings || info.labLabelSettings);
  return info;
}

const ID_TEMPLATE_TOKENS = [
  { token: '[YR]', description: 'Last two digits of the year (e.g., 25).' },
  { token: '[YEAR]', description: 'Full four-digit year (e.g., 2025).' },
  { token: '[YROB]', description: 'Last two digits of the birth year.' },
  { token: '[YEAROB]', description: 'Full four-digit birth year.' },
  { token: '[PREFIX]', description: 'Legacy prefix derived from the name (or sire — dam pattern).' },
  { token: '[PREFIXU]', description: 'Prefix in uppercase.' },
  { token: '[PREFIXL]', description: 'Prefix in lowercase.' },
  { token: '[NAME]', description: 'Letters from the name in Title Case.' },
  { token: '[NAMEU]', description: 'Letters from the name in uppercase.' },
  { token: '[NAMEL]', description: 'Letters from the name in lowercase.' },
  { token: '[INITIALS]', description: 'Initials from each word of the name.' },
  { token: '[SLUG]', description: 'Letters and numbers condensed to lowercase.' },
  { token: '[SLUGU]', description: 'Letters and numbers condensed to uppercase.' },
  { token: '[PAREN]', description: 'Code from a leading parentheses block (e.g., (DH)).' },
  { token: '[HETS]', description: 'Compact het markers (e.g., 50%Hclo).' },
  { token: '[SEX]', description: 'Animal sex (F or M).' },
  { token: '[TEXT]', description: 'Free text snippet from the wizard.' },
  { token: '[GEN3]', description: 'First three letters of each gene (e.g., Enchi Fire Clown ? EncFirClo).' },
  { token: '[SEQ]', description: 'Running sequence number with optional padding.' },
  { token: '[-]', description: 'Literal dash separator.' },
];

function loadStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (err) {
    console.warn(`Failed to read ${key} from storage`, err);
    return fallback;
  }
}

function saveStoredJson(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to persist ${key} to storage`, err);
  }
}

function getStoredBackupPayloadCandidates() {
  const candidates = [];
  const snapshot = loadStoredJson(STORAGE_KEYS.backupSnapshot, null);
  if (snapshot?.payload && typeof snapshot.payload === 'object') {
    candidates.push({
      savedAt: snapshot.savedAt || snapshot.payload.generatedAt || '',
      payload: snapshot.payload,
    });
  }

  const vault = loadStoredJson(STORAGE_KEYS.backupVault, []);
  (Array.isArray(vault) ? vault : []).forEach(entry => {
    const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : null;
    if (!payload) return;
    candidates.push({
      savedAt: entry.updatedAt || entry.createdAt || payload.generatedAt || '',
      payload,
    });
  });

  candidates.sort((a, b) => {
    const aTime = new Date(a.savedAt || 0).getTime();
    const bTime = new Date(b.savedAt || 0).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
  return candidates;
}

function recoverStoredPairingsFromBackups() {
  for (const candidate of getStoredBackupPayloadCandidates()) {
    const rawPairings = candidate?.payload?.pairings;
    if (!Array.isArray(rawPairings) || rawPairings.length === 0) continue;
    const recovered = rawPairings.map(sanitizePairingRecord).filter(Boolean);
    if (recovered.length) return recovered;
  }
  return [];
}

function loadStoredPairingsForBrowser() {
  const stored = loadStoredJson(STORAGE_KEYS.pairings, null);
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.map(sanitizePairingRecord).filter(Boolean);
  }
  const recovered = recoverStoredPairingsFromBackups();
  return recovered.length ? recovered : createFreshPairings();
}

function cloneLogs(logs = {}) {
  return {
    feeds: [...(logs.feeds || [])],
    weights: [...(logs.weights || [])],
    sheds: [...(logs.sheds || [])],
    cleanings: [...(logs.cleanings || [])],
    meds: [...(logs.meds || [])],
  };
}

const MAX_PHOTOS_PER_SNAKE = 60;

function normalizePhotoEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = typeof raw.url === 'string' && raw.url.trim()
    ? raw.url.trim()
    : (typeof raw.dataUrl === 'string' && raw.dataUrl.trim() ? raw.dataUrl.trim() : null);
  if (!url) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uid('photo');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const addedAt = typeof raw.addedAt === 'string' && raw.addedAt ? raw.addedAt : new Date().toISOString();
  const source = raw.source === 'camera' ? 'camera' : 'upload';
  const type = typeof raw.type === 'string' ? raw.type : '';
  const sizeValue = Number(raw.size);
  const size = Number.isFinite(sizeValue) && sizeValue >= 0 ? sizeValue : null;
  const note = typeof raw.note === 'string' ? raw.note : '';
  return { id, url, name, addedAt, source, type, size, note };
}

function normalizeSnakePhotos(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(normalizePhotoEntry).filter(Boolean);
}

function trimSnakePhotoList(list, limit = MAX_PHOTOS_PER_SNAKE) {
  if (!Array.isArray(list)) return [];
  if (typeof limit !== 'number' || limit <= 0) return list;
  if (list.length <= limit) return list;
  return list.slice(list.length - limit);
}

function normalizeLabGeneticsConfirmation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const markers = Array.isArray(raw.markers)
    ? raw.markers
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => {
          const marker = typeof entry.marker === 'string' ? entry.marker.trim() : '';
          const outcome = typeof entry.outcome === 'string' ? entry.outcome.trim() : '';
          const confirmedAt = typeof entry.confirmedAt === 'string' && entry.confirmedAt
            ? entry.confirmedAt
            : new Date().toISOString();
          if (!marker || !outcome) return null;
          return {
            marker,
            outcome,
            orderId: typeof entry.orderId === 'string' && entry.orderId.trim() ? entry.orderId.trim() : undefined,
            resultId: typeof entry.resultId === 'string' && entry.resultId.trim() ? entry.resultId.trim() : undefined,
            confirmedAt,
          };
        })
        .filter(Boolean)
    : [];
  if (!markers.length) return null;
  return {
    source: raw.source === 'genetic-test' ? 'genetic-test' : 'genetic-test',
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : 'Confirmed by shed test',
    confirmedAt: typeof raw.confirmedAt === 'string' && raw.confirmedAt
      ? raw.confirmedAt
      : markers.reduce((latest, entry) => entry.confirmedAt > latest ? entry.confirmedAt : latest, markers[0].confirmedAt),
    markers,
  };
}

function sanitizeSnakeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const snake = { ...raw };
  snake.morphs = Array.isArray(raw.morphs) ? raw.morphs.map(token => String(token || '').trim()).filter(Boolean) : [];
  snake.hets = Array.isArray(raw.hets) ? raw.hets.map(token => String(token || '').trim()).filter(Boolean) : [];
  snake.possibleHets = Array.isArray(raw.possibleHets)
    ? raw.possibleHets.map(token => String(token || '').trim()).filter(Boolean)
    : (typeof raw.possibleHets === 'string'
      ? String(raw.possibleHets)
          .split(/[,\n]/)
          .map(token => String(token || '').trim())
          .filter(Boolean)
      : []);
  snake.tags = Array.isArray(raw.tags) ? raw.tags.map(token => String(token || '').trim()).filter(Boolean) : [];
  snake.groups = Array.isArray(raw.groups)
    ? raw.groups.map(token => String(token || '').trim()).filter(Boolean)
    : normalizeSingleGroupValue(raw.groups);
  snake.logs = cloneLogs(raw.logs);
  snake.photos = normalizeSnakePhotos(raw.photos);
  snake.labGeneticsConfirmation = normalizeLabGeneticsConfirmation(raw.labGeneticsConfirmation);
  if (snake.metadata && typeof snake.metadata === 'object') {
    snake.metadata = { ...snake.metadata };
  }
  return snake;
}

function sanitizePairingRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return withPairingLifecycleDefaults({ ...raw });
}

function normalizeBackupFileEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
  if (!payload) return null;
  const source = raw.source === 'auto' ? 'auto' : 'manual';
  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString();
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : createdAt;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `${source === 'auto' ? 'Auto' : 'Manual'} backup ${formatDateTimeForDisplay(createdAt)}`;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uid('backup');
  return {
    id,
    name,
    createdAt,
    updatedAt,
    source,
    payload,
  };
}

function normalizeBackupVault(raw) {
  if (!Array.isArray(raw)) return [];
  const entries = raw.map(normalizeBackupFileEntry).filter(Boolean);
  entries.sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });
  return entries;
}

const DIMENSION_UNITS = ['cm', 'mm', 'in'];

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeUnit(unit) {
  const normalized = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  return DIMENSION_UNITS.includes(normalized) ? normalized : 'cm';
}

function normalizeDimensionTriple(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const w = Number(raw.w);
  const d = Number(raw.d);
  const h = Number(raw.h);
  if (![w, d, h].every(value => Number.isFinite(value) && value > 0)) {
    return null;
  }
  return { w, d, h, unit: sanitizeUnit(raw.unit) };
}

function ensureTimestamp(value) {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return nowIsoString();
}

function computeTotalTubs(columns, levels, depthRows = 1) {
  return Math.max(1, columns) * Math.max(1, levels) * Math.max(1, depthRows || 1);
}

function generateRackSlots(columns, levels, previousSlots = []) {
  const slots = [];
  const prior = Array.isArray(previousSlots) ? previousSlots : [];
  for (let levelIndex = 0; levelIndex < Math.max(1, levels); levelIndex += 1) {
    for (let columnIndex = 0; columnIndex < Math.max(1, columns); columnIndex += 1) {
      const existing = prior.find(slot => slot?.levelIndex === levelIndex && slot?.columnIndex === columnIndex);
      slots.push({
        levelIndex,
        columnIndex,
        snakeId: typeof existing?.snakeId === 'string' && existing.snakeId.trim() ? existing.snakeId.trim() : null,
      });
    }
  }
  return slots;
}

function normalizeHeatRackRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const roomId = typeof raw.roomId === 'string' && raw.roomId.trim() ? raw.roomId.trim() : null;
  if (!roomId) return null;
  const columns = clampInt(raw.columns, { min: 1, fallback: 1 });
  const levels = clampInt(raw.levels, { min: 1, fallback: 1 });
  const tubSizeLabel = String(raw.tubSizeLabel || '').trim() || 'Custom';
  const tubDimensions = normalizeDimensionTriple(raw.tubDimensions);
  const slots = generateRackSlots(columns, levels, raw.slots);
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uid('rack'),
    roomId,
    name: String(raw.name || '').trim() || 'Rack',
    tubSizeLabel,
    tubDimensions: tubDimensions || null,
    columns,
    levels,
    totalTubs: computeTotalTubs(columns, levels),
    slots,
    createdAt: ensureTimestamp(raw.createdAt),
    updatedAt: ensureTimestamp(raw.updatedAt),
  };
}

function normalizeTerrariumRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const roomId = typeof raw.roomId === 'string' && raw.roomId.trim() ? raw.roomId.trim() : null;
  if (!roomId) return null;
  const dimensions = normalizeDimensionTriple(raw.dimensions);
  const occupantIds = Array.isArray(raw.occupantIds)
    ? raw.occupantIds.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  const capacity = clampInt(raw.capacity, { min: 1, fallback: Math.max(1, occupantIds.length || 1) });
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uid('terrarium'),
    roomId,
    name: String(raw.name || '').trim() || 'Terrarium',
    dimensions: dimensions || null,
    occupantIds,
    capacity,
    createdAt: ensureTimestamp(raw.createdAt),
    updatedAt: ensureTimestamp(raw.updatedAt),
  };
}

function normalizeRoomRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uid('room'),
    name: String(raw.name || '').trim() || 'Room',
    description: String(raw.description || '').trim(),
    createdAt: ensureTimestamp(raw.createdAt),
    updatedAt: ensureTimestamp(raw.updatedAt),
    rackIds: Array.isArray(raw.rackIds)
      ? raw.rackIds.map(value => String(value || '').trim()).filter(Boolean)
      : [],
    terrariumIds: Array.isArray(raw.terrariumIds)
      ? raw.terrariumIds.map(value => String(value || '').trim()).filter(Boolean)
      : [],
  };
}

function syncRoomAssetLinks(rooms, racks, terrariums) {
  const rackLookup = new Map();
  racks.forEach(rack => {
    if (!rackLookup.has(rack.roomId)) {
      rackLookup.set(rack.roomId, []);
    }
    rackLookup.get(rack.roomId).push(rack.id);
  });
  const terrariumLookup = new Map();
  terrariums.forEach(terrarium => {
    if (!terrariumLookup.has(terrarium.roomId)) {
      terrariumLookup.set(terrarium.roomId, []);
    }
    terrariumLookup.get(terrarium.roomId).push(terrarium.id);
  });
  return rooms.map(room => ({
    ...room,
    rackIds: Array.from(new Set(rackLookup.get(room.id) || [])),
    terrariumIds: Array.from(new Set(terrariumLookup.get(room.id) || [])),
  }));
}

function convertLegacySpaces(legacyRooms) {
  const rooms = [];
  const heatRacks = [];
  const terrariums = [];
  (Array.isArray(legacyRooms) ? legacyRooms : []).forEach(legacyRoom => {
    const roomId = typeof legacyRoom.id === 'string' && legacyRoom.id.trim() ? legacyRoom.id.trim() : uid('room');
    const normalizedRoom = normalizeRoomRecord({
      ...legacyRoom,
      id: roomId,
      rackIds: [],
      terrariumIds: [],
    });
    rooms.push(normalizedRoom);
    const legacyRacks = Array.isArray(legacyRoom.racks) ? legacyRoom.racks : [];
    legacyRacks.forEach(legacyRack => {
      const normalizedRack = normalizeHeatRackRecord({
        ...legacyRack,
        roomId,
        tubSizeLabel: legacyRack.tubSize || legacyRack.customTub || 'Custom',
        columns: legacyRack.cols,
        levels: legacyRack.rows,
        name: legacyRack.name || legacyRack.type,
      });
      if (normalizedRack) {
        heatRacks.push(normalizedRack);
      }
    });
    const legacyTerrariums = Array.isArray(legacyRoom.terrariums) ? legacyRoom.terrariums : [];
    legacyTerrariums.forEach(legacyTerrarium => {
      const normalizedTerrarium = normalizeTerrariumRecord({
        ...legacyTerrarium,
        roomId,
        name: legacyTerrarium.name,
        dimensions: {
          w: Number(legacyTerrarium.width) || 0,
          d: Number(legacyTerrarium.depth) || 0,
          h: Number(legacyTerrarium.height) || 0,
          unit: 'cm',
        },
      });
      if (normalizedTerrarium) {
        terrariums.push({ ...normalizedTerrarium, occupantIds: [] });
      }
    });
  });
  return {
    rooms: syncRoomAssetLinks(rooms, heatRacks, terrariums),
    heatRacks,
    terrariums,
  };
}

function normalizeSpacesDataset(raw) {
  if (!raw) {
    return { rooms: [], heatRacks: [], terrariums: [] };
  }
  if (Array.isArray(raw)) {
    return convertLegacySpaces(raw);
  }
  const rooms = Array.isArray(raw.rooms)
    ? raw.rooms.map(normalizeRoomRecord).filter(Boolean)
    : [];
  const roomIdSet = new Set(rooms.map(room => room.id));
  const rackSource = Array.isArray(raw.heatRacks)
    ? raw.heatRacks
    : Array.isArray(raw.racks)
      ? raw.racks
      : [];
  const heatRacks = rackSource
    .map(normalizeHeatRackRecord)
    .filter(rack => rack && roomIdSet.has(rack.roomId));
  const terrariumSource = Array.isArray(raw.terrariums) ? raw.terrariums : [];
  const terrariums = terrariumSource
    .map(normalizeTerrariumRecord)
    .filter(terrarium => terrarium && roomIdSet.has(terrarium.roomId));
  return {
    rooms: syncRoomAssetLinks(rooms, heatRacks, terrariums),
    heatRacks,
    terrariums,
  };
}

function buildLegacySpacesSnapshot(rooms = [], heatRacks = [], terrariums = []) {
  const rackLookup = new Map();
  heatRacks.forEach(rack => {
    const summary = {
      id: rack.id,
      name: rack.name,
      type: rack.tubSizeLabel,
      tubSize: rack.tubSizeLabel,
      customTub: rack.tubDimensions ? `${rack.tubDimensions.w}x${rack.tubDimensions.d}x${rack.tubDimensions.h}${rack.tubDimensions.unit}` : '',
      rows: rack.levels,
      cols: rack.columns,
      occupiedSlots: Array.isArray(rack.slots) ? rack.slots.filter(slot => slot?.snakeId).length : 0,
      notes: '',
    };
    const collection = rackLookup.get(rack.roomId) || [];
    collection.push(summary);
    rackLookup.set(rack.roomId, collection);
  });

  const terrariumLookup = new Map();
  terrariums.forEach(terrarium => {
    const summary = {
      id: terrarium.id,
      name: terrarium.name,
      type: 'Terrarium',
      height: terrarium.dimensions?.h ? `${terrarium.dimensions.h}${terrarium.dimensions.unit}` : '',
      width: terrarium.dimensions?.w ? `${terrarium.dimensions.w}${terrarium.dimensions.unit}` : '',
      depth: terrarium.dimensions?.d ? `${terrarium.dimensions.d}${terrarium.dimensions.unit}` : '',
      capacity: Math.max(1, Array.isArray(terrarium.occupantIds) ? terrarium.occupantIds.length : 1),
      occupants: Array.isArray(terrarium.occupantIds) ? terrarium.occupantIds.length : 0,
      notes: '',
    };
    const collection = terrariumLookup.get(terrarium.roomId) || [];
    collection.push(summary);
    terrariumLookup.set(terrarium.roomId, collection);
  });

  return rooms.map(room => ({
    id: room.id,
    name: room.name,
    racks: rackLookup.get(room.id) || [],
    terrariums: terrariumLookup.get(room.id) || [],
  }));
}

function createRoomRecord(name) {
  return normalizeRoomRecord({ id: uid('room'), name: String(name || '').trim() || 'Room', rackIds: [], terrariumIds: [] });
}

const seedSnakes = [
  {
    id: '25Ath-1',
    name: 'Athena - DEMO',
    sex: 'F',
    morphs: ['Clown', 'Pastel'],
    hets: ['Hypo'],
    possibleHets: [],
    weight: 850,
    year: 2025,
    birthDate: '2024-06-15',
    tags: ['proven', 'female'],
    groups: ['Breeders'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  {
    id: '25Bor-1',
    name: 'Boris - DEMO',
    sex: 'M',
    morphs: ['Pinstripe', 'Albino'],
    hets: [],
    possibleHets: [],
    weight: 1020,
    year: 2023,
    birthDate: '2023-08-02',
    tags: ['male'],
    groups: ['Breeders'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  {
    id: '25Jun-1',
    name: 'Juniper - DEMO',
    sex: 'F',
    morphs: ['GHI'],
    hets: [],
    possibleHets: [],
    weight: 460,
    year: 2024,
    birthDate: '2024-04-11',
    tags: ['holdback'],
    groups: ['Holdbacks'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  },
  {
    id: '25Neo-1',
    name: 'Neo - DEMO',
    sex: 'M',
    morphs: ['Normal'],
    hets: [],
    possibleHets: [],
    weight: 180,
    year: 2025,
    birthDate: '2025-05-01',
    tags: ['hatchling'],
    groups: ['Hatchlings 2025'],
    status: 'Active',
    imageUrl: undefined,
    isDemo: true,
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] }
  }
];

const BORIS_DEMO_SEED = seedSnakes.find(s => s?.name === 'Boris - DEMO');
const BORIS_PREVIEW_DEFAULTS = {
  name: BORIS_DEMO_SEED?.name || 'Boris - DEMO',
  year: BORIS_DEMO_SEED?.year || extractYearFromDateString(BORIS_DEMO_SEED?.birthDate) || new Date().getFullYear(),
  birthYear: extractYearFromDateString(BORIS_DEMO_SEED?.birthDate) || BORIS_DEMO_SEED?.year || new Date().getFullYear(),
  sex: ensureSex(BORIS_DEMO_SEED?.sex, 'M'),
  genes: (() => {
    const morphs = Array.isArray(BORIS_DEMO_SEED?.morphs) ? BORIS_DEMO_SEED.morphs : [];
    const hets = Array.isArray(BORIS_DEMO_SEED?.hets) ? BORIS_DEMO_SEED.hets : [];
    const combined = [...morphs, ...hets].map(token => String(token || '').trim()).filter(Boolean);
    return combined.length ? combined.join(', ') : '';
  })(),
};

const seedPairings = [];
const DEFAULT_GROUPS = ["Breeders", "Holdbacks", "Hatchlings 2024", "Hatchlings 2025"];
const DEFAULT_STATUS_TAGS = ['Active', 'Holdback', 'Grow-out', 'Breeder', 'Quarantine', 'For sell', 'Sold', 'On loan', 'MorphMarket', 'On hold', 'Retired', 'Deceased'];
const STATUS_TAG_TRANSLATIONS = Object.freeze({
  'active': 'ui.animals.addAnimal.active',
  'holdback': 'ui.animals.addAnimal.holdback',
  'grow-out': 'ui.animals.addAnimal.growOut',
  'breeder': 'ui.animals.addAnimal.breeder',
  'quarantine': 'ui.animals.addAnimal.quarantine',
  'sold': 'ui.animals.addAnimal.sold',
  'on loan': 'ui.animals.addAnimal.onLoan',
  'morphmarket': 'ui.animals.addAnimal.morphMarket',
  'on hold': 'ui.animals.addAnimal.onHold',
  'retired': 'ui.animals.addAnimal.retired',
  'deceased': 'ui.animals.addAnimal.deceased',
});

function getStatusTagTranslationKey(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return STATUS_TAG_TRANSLATIONS[normalized] || null;
}
const SCAN_MODE_STORAGE_KEY = 'breedingPlannerScanMode';
const BREEDING_DASHBOARD_URGENCY_STYLES = {
  overdue: 'border-rose-200 bg-rose-50 text-rose-700',
  due: 'border-amber-200 bg-amber-50 text-amber-700',
  soon: 'border-sky-200 bg-sky-50 text-sky-700',
  upcoming: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  none: 'border-neutral-200 bg-neutral-50 text-neutral-600',
};

function createFreshSnakes() {
  return seedSnakes.map(s => {
    const existingSequence = Number(s?.idSequence);
    const resolvedSequence = Number.isFinite(existingSequence) && existingSequence > 0
      ? existingSequence
      : (extractSequenceFromId(s?.id) || null);
    return {
      ...s,
      idSequence: resolvedSequence,
      morphs: [...(s.morphs || [])],
      hets: [...(s.hets || [])],
      possibleHets: Array.isArray(s.possibleHets) ? [...s.possibleHets] : [],
      tags: [...(s.tags || [])],
      groups: normalizeSingleGroupValue(s.groups),
      logs: cloneLogs(s.logs),
      photos: normalizeSnakePhotos(s.photos),
    };
  });
}

function createFreshPairings() {
  return seedPairings.map(p => withPairingLifecycleDefaults({
    ...p,
    goals: [...(p.goals || [])],
    notes: p.notes || '',
    appointments: (p.appointments || []).map(ap => ({ ...ap })),
  }));
}

function formatDateForDisplay(dateLike) {
  if (!dateLike) return '';
  if (typeof dateLike === 'string') {
    const yearOnly = dateLike.match(/^(\d{4})$/);
    if (yearOnly) return yearOnly[1];
    const monthYear = dateLike.match(/^(\d{4})-(\d{2})$/);
    if (monthYear) return `${monthYear[2]}/${monthYear[1]}`;
    const m = dateLike.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const parsed = new Date(dateLike);
    if (!isNaN(parsed)) {
      const dd = String(parsed.getDate()).padStart(2, '0');
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const yyyy = parsed.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    return dateLike;
  }
  if (dateLike instanceof Date) {
    const dd = String(dateLike.getDate()).padStart(2, '0');
    const mm = String(dateLike.getMonth() + 1).padStart(2, '0');
    const yyyy = dateLike.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  try {
    const parsed = new Date(dateLike);
    if (!isNaN(parsed)) {
      const dd = String(parsed.getDate()).padStart(2, '0');
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const yyyy = parsed.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  } catch (e) {
    // ignore
  }
  return String(dateLike);
}

function normalizeBirthDateValue(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return trimmed;
  if (/^(0[1-9]|1[0-2])[\/\-](\d{4})$/.test(trimmed)) {
    const [, mm, yyyy] = trimmed.match(/^(0[1-9]|1[0-2])[\/\-](\d{4})$/) || [];
    if (mm && yyyy) return `${yyyy}-${mm}`;
  }
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(trimmed)) return trimmed;
  return normalizeDateInput(trimmed);
}
function withPairingLifecycleDefaults(pairing = {}) {
  const defaults = pairingLifecycleDefaults();
  const ovulation = { ...defaults.ovulation, ...(pairing.ovulation || {}) };
  const preLayShed = { ...defaults.preLayShed, ...(pairing.preLayShed || {}) };
  const clutch = { ...defaults.clutch, ...(pairing.clutch || {}) };
  const hatch = { ...defaults.hatch, ...(pairing.hatch || {}) };

  const toCountOrNull = (value) => {
    if (value === '' || value === null || typeof value === 'undefined') return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return null;
    return num;
  };

  const clutchRecorded = !!clutch.recorded;
  let fertileCount = toCountOrNull(clutch.fertileEggs);
  let slugCount = toCountOrNull(clutch.slugs);
  let totalCount = toCountOrNull(clutch.eggsTotal);

  if (!clutchRecorded) {
    clutch.fertileEggs = '';
    clutch.slugs = '';
    clutch.eggsTotal = '';
  } else {
    if (fertileCount === null && totalCount !== null) {
      const safeSlugs = slugCount ?? 0;
      fertileCount = Math.max(0, totalCount - safeSlugs);
    }
    if (slugCount === null) slugCount = 0;
    if (fertileCount === null) fertileCount = 0;

    fertileCount = Math.max(0, fertileCount);
    slugCount = Math.max(0, slugCount);
    totalCount = fertileCount + slugCount;

    clutch.fertileEggs = fertileCount;
    clutch.slugs = slugCount;
    clutch.eggsTotal = totalCount;
  }

  hatch.hatchedCount = Number(hatch.hatchedCount || 0);
  if (!Number.isFinite(hatch.hatchedCount) || hatch.hatchedCount < 0) hatch.hatchedCount = 0;

  const hatchLimit = typeof clutch.fertileEggs === 'number' && Number.isFinite(clutch.fertileEggs)
    ? Math.max(0, clutch.fertileEggs)
    : (typeof clutch.eggsTotal === 'number' && Number.isFinite(clutch.eggsTotal) ? Math.max(0, clutch.eggsTotal) : null);

  if (typeof hatchLimit === 'number' && Number.isFinite(hatchLimit)) {
    hatch.hatchedCount = Math.min(Math.max(0, hatch.hatchedCount), hatchLimit);
  } else {
    hatch.hatchedCount = Math.max(0, hatch.hatchedCount);
  }

  const appointments = Array.isArray(pairing.appointments)
    ? pairing.appointments.map((appointment) => {
      const appt = appointment && typeof appointment === 'object' ? appointment : {};
      const appointmentDone = typeof appt.appointmentDone === 'boolean'
        ? appt.appointmentDone
        : !!appt.pairingObserved;
      const pairingDate = normalizeDateInput(appt.pairingDate || appt.pairingLoggedAt || (appointmentDone ? appt.date : ''));
      const lockDate = getLockRecordedDate(appt);
      return {
        ...appt,
        notes: appt.notes || '',
        appointmentDone,
        pairingDate: pairingDate || null,
        pairingObserved: !!appt.pairingObserved || appointmentDone,
        pairingLoggedAt: pairingDate || appt.pairingLoggedAt || null,
        lockDate: lockDate || null,
        lockObserved: !!appt.lockObserved,
        lockLoggedAt: lockDate || appt.lockLoggedAt || null,
      };
    })
    : [];

  return {
    ...pairing,
    ovulation,
    preLayShed,
    clutch,
    hatch,
    appointments,
  };
}

function initSnakeDraft(s) {
  if (!s) return { name:'', sex:'F', status:'Active', morphs:[], hets:[], tags:[], groups:[], logs: cloneLogs(), idSequence: null };
  const existingSequence = Number(s?.idSequence);
  const resolvedSequence = Number.isFinite(existingSequence) && existingSequence > 0
    ? existingSequence
    : (extractSequenceFromId(s?.id) || null);
  return {
    ...s,
    status: (typeof s?.status === 'string' && s.status.trim()) ? s.status.trim() : 'Active',
    idSequence: resolvedSequence,
    sex: ensureSex(s.sex, 'F'),
    morphs: s.morphs || [],
    hets: s.hets || [],
    tags: s.tags || [],
    groups: normalizeSingleGroupValue(s.groups),
    logs: cloneLogs(s.logs),
    photos: normalizeSnakePhotos(s.photos),
  };
}

function createEmptyNewAnimalDraft() {
  return {
    id: "",
    autoId: true,
    idSequence: null,
    name: "",
    sex: "",
  status: "Active",
    morphHetInput: "",
    morphs: [],
    hets: [],
    weight: "",
    price: "",
    year: "",
    birthDate: "",
    notes: "",
    imageUrl: "",
    photos: [],
    groups: [],
    logs: cloneLogs()
  };
}

function hasMeaningfulAnimalDraftContent(draft) {
  if (!draft || typeof draft !== 'object') return false;
  if (String(draft.name || '').trim()) return true;
  if (String(draft.id || '').trim()) return true;
  if (String(draft.morphHetInput || '').trim()) return true;
  if (Array.isArray(draft.morphs) && draft.morphs.some(entry => String(entry || '').trim())) return true;
  if (Array.isArray(draft.hets) && draft.hets.some(entry => String(entry || '').trim())) return true;
  if (Number.isFinite(Number(draft.weight)) && Number(draft.weight) > 0) return true;
  if (String(draft.price || '').trim()) return true;
  if (Number.isFinite(Number(draft.year)) && Number(draft.year) > 0) return true;
  if (String(draft.birthDate || '').trim()) return true;
  if (String(draft.notes || '').trim()) return true;
  if (Array.isArray(draft.groups) && draft.groups.some(entry => String(entry || '').trim())) return true;
  if (Array.isArray(draft.photos) && draft.photos.length > 0) return true;
  return false;
}

function snakeById(list, id) {
  if (!Array.isArray(list)) return null; return list.find(x => x && x.id === id) || null;
}

function normalizeSexValue(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return 'UNKNOWN';
  if (value === 'm' || value === 'male') return 'M';
  if (value === 'f' || value === 'female') return 'F';
  if (/^male\b/.test(value)) return 'M';
  if (/^female\b/.test(value)) return 'F';
  if (/^supermale\b/.test(value)) return 'M';
  if (/^superfemale\b/.test(value)) return 'F';
  if (/^1[\s.:/]*0$/.test(value)) return 'M';
  if (/^0[\s.:/]*1$/.test(value)) return 'F';
  if (/^m/.test(value)) return 'M';
  if (/^f/.test(value)) return 'F';
  return 'UNKNOWN';
}

function ensureSex(raw, fallback = 'F') {
  const normalized = normalizeSexValue(raw);
  return normalized === 'UNKNOWN' ? fallback : normalized;
}

function isFemaleSnake(snake) {
  return normalizeSexValue(snake?.sex) === 'F';
}

function isMaleSnake(snake) {
  return normalizeSexValue(snake?.sex) === 'M';
}

function formatHetForDisplay(rawHet) {
  if (rawHet === null || rawHet === undefined) return null;
  let text = String(rawHet).replace(/\s+/g, ' ').trim();
  if (!text) return null;

  let working = text;
  const prefixes = [];

  const percentMatch = working.match(/^(\d{1,3}%)(?:\s+)(.*)$/i);
  if (percentMatch) {
    prefixes.push(percentMatch[1].trim());
    working = percentMatch[2].trim();
  }

  const qualifierMatch = working.match(/^(pos(?:s?i?a?ble)?|probable|maybe|ph)\b\s*(.*)$/i);
  if (qualifierMatch) {
    const qualifierWord = qualifierMatch[1].toLowerCase();
    const qualifierLookup = {
      pos: 'Possible',
      possiable: 'Possible',
      posible: 'Possible',
      possible: 'Possible',
      probable: 'Probable',
      maybe: 'Maybe',
      ph: 'Possible'
    };
    prefixes.push(qualifierLookup[qualifierWord] || cap(qualifierWord));
    working = qualifierMatch[2].trim();
  }

  let base = working;
  if (/\bhet\b/i.test(base)) {
    base = base.replace(/\bhet\b/gi, '').trim();
  }

  if (base) {
    const canonicalBase = resolveCanonicalGene(base, lookupCanonicalGene);
    base = (canonicalBase || base)
      .split(/\s+/)
      .map(segment => {
        if (!segment) return '';
        const upper = segment.toUpperCase();
        if (segment === upper) return segment;
        return segment.charAt(0).toUpperCase() + segment.slice(1);
      })
      .join(' ')
      .trim();
  }

  const parts = [...prefixes, 'Het'];
  if (base) parts.push(base);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function uniqueGeneTokens(tokens = []) {
  const seen = new Set();
  const result = [];
  tokens.forEach(token => {
    const key = String(token).replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(token);
  });
  return result;
}

function getDisplayedSnakeGeneticsTokens(snake) {
  return combineMorphsAndHetsForDisplay(snake?.morphs, snake?.hets, snake?.possibleHets);
}

function extractSuperGeneBase(token) {
  if (!token) return null;
  const trimmed = String(token).replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  const spacedMatch = trimmed.match(/^super[\s-]+(.+)$/i);
  if (spacedMatch && spacedMatch[1]) return spacedMatch[1].trim();
  const camelMatch = trimmed.match(/^super([A-Z].*)$/);
  if (camelMatch && camelMatch[1]) return camelMatch[1].trim();
  const pascalMatch = trimmed.match(/^Super([A-Z].*)$/);
  if (pascalMatch && pascalMatch[1]) return pascalMatch[1].trim();
  const loudMatch = trimmed.match(/^SUPER([A-Z].*)$/);
  if (loudMatch && loudMatch[1]) return loudMatch[1].trim();
  return null;
}

function getSuperGeneInfo(token) {
  const base = extractSuperGeneBase(token);
  if (!base) return null;
  return {
    base: base.replace(/\s+/g, ' ').trim(),
  };
}

function isSuperCodominantGeneToken(token, existingGroup, cachedInfo) {
  const info = cachedInfo || getSuperGeneInfo(token);
  if (!info) return false;
  const inferredGroup = existingGroup
    || getGeneDisplayGroup(info.base)
    || getGeneDisplayGroup(token);
  if (inferredGroup && inferredGroup !== 'Other') {
    return inferredGroup === 'Incomplete Dominant';
  }
  return true;
}

function combineMorphsAndHetsForDisplay(morphs = [], hets = [], possibleHets = []) {
  const morphList = Array.isArray(morphs) ? morphs : (morphs ? [morphs] : []);
  const hetList = Array.isArray(hets) ? hets : (hets ? [hets] : []);
  const possibleList = Array.isArray(possibleHets) ? possibleHets : (possibleHets ? [possibleHets] : []);
  const normalizedMorphs = morphList.map(m => String(m).trim()).filter(Boolean);
  const normalizedHets = hetList.map(formatHetForDisplay).filter(Boolean);
  const normalizedPossible = possibleList.map(formatHetForDisplay).filter(Boolean);
  const combined = uniqueGeneTokens([...normalizedMorphs, ...normalizedHets, ...normalizedPossible]);
  const groupWeight = {
    'Dominant': 0,
    'Incomplete Dominant': 1,
    'Recessive': 2,
    'Other': 3
  };
  const weighted = combined.map((token, index) => {
    const group = getGeneDisplayGroup(token) || 'Other';
    const superInfo = getSuperGeneInfo(token);
    const isSuperCodominant = isSuperCodominantGeneToken(token, group, superInfo);
    const normalizedGroup = isSuperCodominant ? 'Incomplete Dominant' : group;
    const baseWeight = typeof groupWeight[normalizedGroup] === 'number' ? groupWeight[normalizedGroup] : groupWeight.Other;
    const weight = baseWeight + (isSuperCodominant ? -0.5 : 0);
    return { token, index, weight };
  });
  weighted.sort((a, b) => {
    if (a.weight !== b.weight) return a.weight - b.weight;
    return a.index - b.index;
  });
  return weighted.map(item => item.token);
}

function isHetDescriptorToken(token) {
  if (!token) return false;
  const lower = String(token).toLowerCase();
  if (lower.includes('het')) return true;
  if (/(^|\s)(pos(?:s?i?a?ble)?|probable|maybe|ph)(\s|$)/i.test(lower)) return true;
  if (/\d{1,3}%/.test(lower)) return true;
  return false;
}

function isHetGeneToken(token) {
  if (!token) return false;
  const normalizedRaw = String(token).replace(/\s+/g, ' ').trim();
  if (!normalizedRaw) return false;
  const lower = normalizedRaw.toLowerCase();
  const hetPrefixPattern = /^(?:\d{1,3}%\s*)?(?:(?:pos(?:s?i?a?ble)?|probable|maybe|ph)\s+)?het\b/;
  if (hetPrefixPattern.test(lower)) {
    return true;
  }
  return isHetDescriptorToken(token);
}

function normalizeHetInputToken(token) {
  if (!token) return null;
  let working = String(token).replace(/\s+/g, ' ').trim();
  if (!working) return null;

  let percent = '';
  const percentMatch = working.match(/^(\d{1,3}%)(?:\s*)(.*)$/i);
  if (percentMatch) {
    percent = percentMatch[1].toUpperCase();
    working = percentMatch[2].trim();
  }

  let qualifier = '';
  const qualifierMatch = working.match(/^(pos(?:s?i?a?ble)?|probable|maybe|ph)(?:\s*)(.*)$/i);
  if (qualifierMatch) {
    qualifier = qualifierMatch[1].toLowerCase();
    working = qualifierMatch[2].trim();
  }

  working = working
    .replace(/\bhet\b/gi, ' ')
    .replace(/^het(?=[A-Za-z])/i, '')
    .trim();

  const qualifierMap = {
    pos: 'Possible',
    ph: 'Possible',
    possible: 'Possible',
    possiable: 'Possible',
    posible: 'Possible',
    probable: 'Probable',
    maybe: 'Maybe',
  };

  const qualifierText = qualifierMap[qualifier] || '';

  const parts = [];
  if (qualifierText) parts.push(qualifierText);
  if (working) parts.push(working);
  let result = parts.join(' ').trim();
  if (percent) result = `${percent} ${result}`.trim();
  return result || null;
}

const geneLookupCache = {
  map: null,
  compactMap: null,
  maxWords: 1,
  maxCompactLength: 0,
};

function normalizeGeneLookupKey(value) {
  return String(value || '')
    .replace(/[()[\]]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function ensureGeneLookupCache() {
  if (geneLookupCache.map) return geneLookupCache;
  if (typeof GENE_GROUPS === 'undefined') {
    return geneLookupCache;
  }
  const lookup = new Map();
  const addVariant = (raw, canonical) => {
    const key = normalizeGeneLookupKey(raw);
    if (!key) return;
    if (!lookup.has(key)) {
      lookup.set(key, canonical);
    }
  };

  Object.values(GENE_GROUPS).forEach(list => {
    (list || []).forEach(name => {
      if (!name) return;
      addVariant(name, name);
      const withoutParens = name.replace(/\(.*?\)/g, '').trim();
      if (withoutParens && withoutParens !== name) addVariant(withoutParens, name);
    });
  });

  if (typeof GENE_ALIASES === 'object' && GENE_ALIASES) {
    Object.entries(GENE_ALIASES).forEach(([alias, canonical]) => {
      if (!alias) return;
      if (canonical) addVariant(canonical, canonical);
      addVariant(alias, canonical || alias);
    });
  }

  const compactLookup = new Map();
  let maxWords = 1;
  let maxCompactLength = 0;

  const addCompactVariant = (key, canonicalDisplay) => {
    const compactKey = key.replace(/\s+/g, '');
    if (!compactKey) return;
    if (!compactLookup.has(compactKey)) {
      compactLookup.set(compactKey, { display: canonicalDisplay, sourceKey: compactKey });
      if (compactKey.length > maxCompactLength) maxCompactLength = Math.max(maxCompactLength, compactKey.length);
    }
  };

  lookup.forEach((canonical, key) => {
    const words = key.split(' ').filter(Boolean);
    if (words.length > maxWords) maxWords = words.length;
    addCompactVariant(key, canonical);

    const canonicalLower = String(canonical || '').toLowerCase();
    if (!canonicalLower.startsWith('super ')) {
      const superKey = `super${key.replace(/\s+/g, '')}`;
      const superDisplay = `Super ${canonical}`;
      addCompactVariant(superKey, superDisplay);
    }
  });

  geneLookupCache.map = lookup;
  geneLookupCache.compactMap = compactLookup;
  geneLookupCache.maxWords = maxWords;
  geneLookupCache.maxCompactLength = maxCompactLength;
  return geneLookupCache;
}

function lookupCanonicalGene(raw) {
  if (!raw) return null;
  const cache = ensureGeneLookupCache();
  const lookup = cache.map;
  if (!lookup) return null;
  const key = normalizeGeneLookupKey(raw);
  if (!key) return null;
  return lookup.get(key) || null;
}

function splitWordsByGeneList(words) {
  const result = [];
  if (!Array.isArray(words) || !words.length) return result;
  const cache = ensureGeneLookupCache();
  const maxWords = cache.maxWords || 1;

  let i = 0;
  while (i < words.length) {
    const current = words[i];
    if (!current) {
      i += 1;
      continue;
    }
    const lower = current.toLowerCase();

    if (lower === 'super' && i + 1 < words.length) {
      let matched = null;
      let consumed = 0;
      for (let len = Math.min(maxWords, words.length - (i + 1)); len >= 1; len--) {
        const candidateWords = words.slice(i + 1, i + 1 + len);
        const candidateSource = candidateWords.join(' ');
        const canonical = resolveCanonicalGene(candidateSource, lookupCanonicalGene);
        if (canonical) {
          matched = {
            display: `Super ${canonical}`,
            source: `Super ${candidateSource}`,
          };
          consumed = len + 1;
          break;
        }
      }
      if (matched) {
        result.push(matched);
        i += consumed;
        continue;
      }
      const fallbackWord = words[i + 1];
      if (fallbackWord) {
        result.push({
          display: `Super ${fallbackWord}`,
          source: `Super ${fallbackWord}`,
        });
        i += 2;
        continue;
      }
    }

    let matched = null;
    let consumed = 0;
    for (let len = Math.min(maxWords, words.length - i); len >= 1; len--) {
      const candidateWords = words.slice(i, i + len);
      const candidateSource = candidateWords.join(' ');
      const canonical = resolveCanonicalGene(candidateSource, lookupCanonicalGene);
      if (canonical) {
        matched = {
          display: canonical,
          source: candidateSource,
        };
        consumed = len;
        break;
      }
    }

    if (matched) {
      result.push(matched);
      i += consumed;
      continue;
    }

    result.push({ display: current, source: current });
    i += 1;
  }

  return result;
}

function splitCompactGeneString(text) {
  if (!text) return [];
  const cache = ensureGeneLookupCache();
  const compactMap = cache.compactMap;
  if (!compactMap || !compactMap.size) return [];

  const normalized = normalizeGeneLookupKey(text);
  const compact = normalized.replace(/\s+/g, '');
  if (!compact) return [];

  const maxLen = cache.maxCompactLength || compact.length;
  const memo = new Map();

  const dfs = (index) => {
    if (index === compact.length) return [[]];
    if (memo.has(index)) return memo.get(index);

    const results = [];
    const limit = Math.min(maxLen, compact.length - index);
    for (let len = limit; len >= 1; len--) {
      const slice = compact.slice(index, index + len);
      const entry = compactMap.get(slice);
      if (!entry) continue;
      const tails = dfs(index + len);
      tails.forEach(tail => {
        results.push([entry, ...tail]);
      });
    }

    memo.set(index, results);
    return results;
  };

  const combos = dfs(0).filter(combo => combo.length);
  if (!combos.length) return [];
  combos.sort((a, b) => a.length - b.length);
  const bestLength = combos[0].length;
  const best = combos.find(combo => combo.length === bestLength) || combos[0];
  return best.map(entry => ({ display: entry.display, source: entry.sourceKey }));
}

function splitSegmentIntoTokens(segment) {
  if (!segment) return [];
  const original = String(segment).replace(/[+]+/g, ' ');
  let working = original;
  const entries = [];
  const ranges = [];
  let order = 0;

  const overlaps = (start, end) => ranges.some(range => Math.max(range.start, start) < Math.min(range.end, end));
  const shouldAttemptCompactSplit = (value) => {
    const text = String(value || '').trim();
    if (!text) return false;
    if (/\s/.test(text)) return false;
    if (/\d+%/.test(text)) return false;
    if (/\b(?:het|heterozygous|possible|pos|ph)\b/i.test(text)) return false;
    return /^[a-z0-9-]+$/i.test(text);
  };
  const pushEntry = (token, start) => {
    const trimmed = String(token || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) return;
    const position = Number.isFinite(start) ? start : Number.POSITIVE_INFINITY;
    entries.push({ token: trimmed, start: position, order: order++ });
  };
  const addRange = (start, end) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    ranges.push({ start, end });
  };

  const hetRegex = /(?:\d{1,3}%\s*)?(?:pos(?:s?i?a?ble)?|probable|maybe|ph)?\s*het\s*[A-Za-z][A-Za-z\s-]*/gi;
  let match;
  while ((match = hetRegex.exec(working)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end)) continue;
    pushEntry(match[0], start);
    addRange(start, end);
  }

  const percentRegex = /\d{1,3}%\s*[A-Za-z][A-Za-z\s-]*/gi;
  while ((match = percentRegex.exec(working)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end)) continue;
    pushEntry(match[0], start);
    addRange(start, end);
  }

  if (ranges.length) {
    let rebuilt = '';
    let previousIndex = 0;
    const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
    sortedRanges.forEach(range => {
      rebuilt += working.slice(previousIndex, range.start);
      rebuilt += ' ';
      previousIndex = range.end;
    });
    rebuilt += working.slice(previousIndex);
    working = rebuilt;
  }

  const originalLower = original.toLowerCase();
  let searchCursor = 0;

  const findPosition = source => {
    if (!source) return Number.POSITIVE_INFINITY;
    const target = String(source).toLowerCase();
    let idx = originalLower.indexOf(target, searchCursor);
    while (idx !== -1) {
      const start = idx;
      const end = start + target.length;
      if (!overlaps(start, end)) {
        addRange(start, end);
        searchCursor = end;
        return start;
      }
      idx = originalLower.indexOf(target, end);
    }
    idx = originalLower.indexOf(target);
    while (idx !== -1) {
      const start = idx;
      const end = start + target.length;
      if (!overlaps(start, end)) {
        addRange(start, end);
        searchCursor = end;
        return start;
      }
      idx = originalLower.indexOf(target, end);
    }
    return Number.POSITIVE_INFINITY;
  };

  const leftoverWords = working.split(/\s+/).filter(Boolean);
  const leftoverPairs = splitWordsByGeneList(leftoverWords);
  if (leftoverPairs.length) {

    leftoverPairs.forEach(pair => {
      const isFallback = pair.display === pair.source;
      if (isFallback && shouldAttemptCompactSplit(pair.source)) {
        const compactPairs = splitCompactGeneString(pair.source) || [];
        const differsFromOriginal = compactPairs.length > 1 || (compactPairs.length === 1 && compactPairs[0].display !== pair.display);
        if (differsFromOriginal && compactPairs.length) {
          compactPairs.forEach(tokenPair => {
            if (!tokenPair || !tokenPair.display) return;
            const searchCandidates = [tokenPair.source, tokenPair.display].filter(Boolean);
            let start = Number.POSITIVE_INFINITY;
            for (const candidate of searchCandidates) {
              start = findPosition(candidate);
              if (Number.isFinite(start)) break;
            }
            pushEntry(tokenPair.display, start);
          });
          return;
        }
      }

      const start = findPosition(pair.source);
      pushEntry(pair.display, start);
    });
  }

  const sortedAfterPairs = [...ranges].sort((a, b) => a.start - b.start);
  let cursor = 0;
  const uncoveredFragments = [];
  sortedAfterPairs.forEach(range => {
    if (range.start > cursor) {
      const fragment = original.slice(cursor, range.start);
      if (fragment && /[A-Za-z]/.test(fragment)) {
        uncoveredFragments.push(fragment);
      }
    }
    cursor = Math.max(cursor, range.end);
  });
  if (cursor < original.length) {
    const fragment = original.slice(cursor);
    if (fragment && /[A-Za-z]/.test(fragment)) {
      uncoveredFragments.push(fragment);
    }
  }

  if (uncoveredFragments.length) {
    uncoveredFragments.forEach(fragment => {
      if (!shouldAttemptCompactSplit(fragment)) return;
      const compactPairs = splitCompactGeneString(fragment) || [];
      compactPairs.forEach(pair => {
        if (!pair || !pair.display) return;
        const searchCandidates = [pair.source, pair.display].filter(Boolean);
        let start = Number.POSITIVE_INFINITY;
        for (const candidate of searchCandidates) {
          start = findPosition(candidate);
          if (Number.isFinite(start)) break;
        }
        pushEntry(pair.display, start);
      });
    });
  }

  entries.sort((a, b) => {
    if (a.start === b.start) return a.order - b.order;
    return a.start - b.start;
  });

  return entries.map(entry => entry.token);
}

function splitMorphHetInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return { morphs: [], hets: [] };

  const segments = raw
    .split(/[\n\r,;|/+]+/)
    .map(segment => segment.trim())
    .filter(Boolean);

  const tokens = segments.flatMap(splitSegmentIntoTokens);
  return normalizeMorphHetLists(tokens);
}

function formatMorphHetForInput(morphs = [], hets = []) {
  const morphTokens = (Array.isArray(morphs) ? morphs : [])
    .map(m => String(m).trim())
    .filter(Boolean);
  const hetTokens = (Array.isArray(hets) ? hets : [])
    .map(formatHetForDisplay)
    .filter(Boolean);
  return [...morphTokens, ...hetTokens].join(', ');
}

function buildQuickAddGeneticsSource(snakes = [], morphAliases = [], geneAliases = []) {
  const live = collectLiveGenetics(Array.isArray(snakes) ? snakes : []);
  const sourceMap = new Map();
  Object.values(GENE_GROUPS || {}).forEach(groupList => {
    (groupList || []).forEach(name => {
      const display = String(name || '').trim();
      if (!display) return;
      const key = normalizeGeneCandidate(display);
      if (!key || sourceMap.has(key)) return;
      sourceMap.set(key, { name: display, aliases: [] });
    });
  });

  live.forEach(item => {
    const display = String(item?.name || '').trim();
    if (!display) return;
    const key = normalizeGeneCandidate(display);
    if (!key) return;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { name: display, aliases: [] });
    }
    const entry = sourceMap.get(key);
    const aliases = Array.isArray(item?.aliases) ? item.aliases : [];
    aliases.forEach(alias => {
      const cleanedAlias = String(alias || '').trim();
      if (!cleanedAlias) return;
      if (!entry.aliases.some(existing => existing.toLowerCase() === cleanedAlias.toLowerCase())) {
        entry.aliases.push(cleanedAlias);
      }
    });
  });

  Object.entries(GENE_ALIASES || {}).forEach(([alias, canonical]) => {
    const canonicalKey = normalizeGeneCandidate(canonical || '');
    if (!canonicalKey || !sourceMap.has(canonicalKey)) return;
    const entry = sourceMap.get(canonicalKey);
    const cleanedAlias = String(alias || '').trim();
    if (!cleanedAlias) return;
    if (!entry.aliases.some(existing => existing.toLowerCase() === cleanedAlias.toLowerCase())) {
      entry.aliases.push(cleanedAlias);
    }
  });

  // Morph aliases (e.g. "Batman", "Blackhead DG Clown") are registered by their exact
  // alias name only. We intentionally do NOT auto-generate prefix shorthands here because
  // short prefixes (e.g. "Black" from "BlackheadDGClown") would match unrelated genes
  // and corrupt free-text parsing.
  (Array.isArray(morphAliases) ? morphAliases : []).forEach((entry) => {
    const alias = String(entry?.alias || '').trim();
    const key = normalizeGeneCandidate(alias);
    if (!alias || !key) return;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { name: alias, aliases: [], shorthand: [] });
    }
  });

  (Array.isArray(geneAliases) ? geneAliases : []).forEach((row) => {
    const geneName = String(row?.geneName || '').trim();
    const key = normalizeGeneCandidate(geneName);
    if (!geneName || !key) return;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { name: geneName, aliases: [], shorthand: [] });
    }
    const target = sourceMap.get(key);
    if (!Array.isArray(target.aliases)) target.aliases = [];
    if (!Array.isArray(target.shorthand)) target.shorthand = [];

    const aliasValues = Array.isArray(row?.aliases) ? row.aliases : [];
    aliasValues.forEach((alias) => {
      const cleaned = String(alias || '').trim();
      if (!cleaned) return;
      if (!target.aliases.some(existing => existing.toLowerCase() === cleaned.toLowerCase())) {
        target.aliases.push(cleaned);
      }
    });

    const shorthandValues = Array.isArray(row?.shorthand) ? row.shorthand : [];
    shorthandValues.forEach((value) => {
      const cleaned = String(value || '').trim();
      if (!cleaned) return;
      if (!target.shorthand.some(existing => existing.toLowerCase() === cleaned.toLowerCase())) {
        target.shorthand.push(cleaned);
      }
    });
  });

  return [...sourceMap.values()];
}

function genMonthlyAppointments(startDate, months=3) {
  const out = [];
  const start = new Date(startDate || new Date());
  for (let i=0;i<months;i++) {
    const d = new Date(start.getFullYear(), start.getMonth()+i, start.getDate());
    out.push({
      id: uid('ap'),
      date: localYMD(d),
      notes: '',
      appointmentDone: false,
      pairingDate: null,
      lockObserved: false,
      lockDate: null,
      lockLoggedAt: null,
    });
  }
  return out;
}

function addMonthsClamped(date, months) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return new Date();
  const next = new Date(date.getTime());
  const desiredDay = next.getDate();
  next.setMonth(next.getMonth() + months, 1);
  const maxDay = daysInMonth(next.getFullYear(), next.getMonth());
  next.setDate(Math.min(desiredDay, maxDay));
  return next;
}

function datesApproximatelyEqual(a, b, toleranceMs = 36 * 60 * 60 * 1000) {
  if (!(a instanceof Date) || Number.isNaN(a.getTime())) return false;
  if (!(b instanceof Date) || Number.isNaN(b.getTime())) return false;
  return Math.abs(a.getTime() - b.getTime()) <= toleranceMs;
}

function getEarliestAppointmentTimestamp(appointments = [], fallbackStartDate) {
  const timestamps = [];
  (appointments || []).forEach(ap => {
    if (!ap || !ap.date) return;
    const parsed = parseYmd(ap.date);
    if (parsed && !Number.isNaN(parsed.getTime())) {
      timestamps.push(parsed.getTime());
    }
  });
  if (!timestamps.length && fallbackStartDate) {
    const parsedFallback = parseYmd(fallbackStartDate);
    if (parsedFallback && !Number.isNaN(parsedFallback.getTime())) {
      return parsedFallback.getTime();
    }
  }
  if (!timestamps.length) return Number.POSITIVE_INFINITY;
  return Math.min(...timestamps);
}

function cloneAndShiftDays(baseDate, days) {
  const shifted = new Date(baseDate.getTime());
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function blockMaleSpan(maleSchedule, maleId, date) {
  if (!maleId || !(date instanceof Date) || Number.isNaN(date.getTime())) return;
  const set = maleSchedule.get(maleId) || new Set();
  for (let offset = 0; offset < 3; offset++) {
    const spanDate = cloneAndShiftDays(date, offset);
    set.add(localYMD(spanDate));
  }
  maleSchedule.set(maleId, set);
}

function isMaleSpanBlocked(maleSchedule, maleId, date) {
  if (!maleId || !(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const set = maleSchedule.get(maleId);
  if (!set) return false;
  for (let offset = 0; offset < 3; offset++) {
    const spanDate = cloneAndShiftDays(date, offset);
    if (set.has(localYMD(spanDate))) return true;
  }
  return false;
}

function findNextAvailableDate(preferred, maleId, maleSchedule) {
  if (!maleId) return preferred;
  let candidate = new Date(preferred.getTime());
  for (let i = 0; i < 120; i++) {
    if (!isMaleSpanBlocked(maleSchedule, maleId, candidate)) {
      return candidate;
    }
    candidate = cloneAndShiftDays(candidate, 1);
  }
  return candidate;
}

function autoAdjustPairingAppointments(pairing, maleSchedule) {
  if (!pairing) return pairing;
  const sourceAppointments = Array.isArray(pairing.appointments) ? pairing.appointments : [];
  if (!sourceAppointments.length) return pairing;

  const orderedAppointments = [...sourceAppointments].sort((a, b) => {
    const aDate = a?.date || '';
    const bDate = b?.date || '';
    return aDate.localeCompare(bDate);
  });

  const adjusted = [];
  const fallbackStart = pairing.startDate ? parseYmd(pairing.startDate) : null;
  let previousDate = null;

  orderedAppointments.forEach((appt, idx) => {
    const originalDate = appt?.date ? parseYmd(appt.date) : null;
    let target = null;
    if (idx === 0) {
      target = (originalDate && !Number.isNaN(originalDate.getTime()))
        ? originalDate
        : (fallbackStart && !Number.isNaN(fallbackStart.getTime()) ? new Date(fallbackStart.getTime()) : new Date());
    } else if (originalDate && !Number.isNaN(originalDate.getTime())) {
      const expected = previousDate ? addMonthsClamped(previousDate, 1) : originalDate;
      if (datesApproximatelyEqual(originalDate, expected)) {
        target = expected;
      } else {
        target = originalDate;
      }
    } else if (previousDate) {
      target = addMonthsClamped(previousDate, 1);
    } else {
      target = new Date();
    }

    if (!(target instanceof Date) || Number.isNaN(target.getTime())) {
      target = previousDate ? addMonthsClamped(previousDate, 1) : new Date();
    }

    const conflictFree = findNextAvailableDate(target, pairing.maleId, maleSchedule);
    blockMaleSpan(maleSchedule, pairing.maleId, conflictFree);
    previousDate = new Date(conflictFree.getTime());
    adjusted.push({ ...appt, date: localYMD(conflictFree) });
  });

  return {
    ...pairing,
    appointments: adjusted,
    startDate: adjusted[0]?.date || pairing.startDate || null,
  };
}

function autoAdjustAllPairingAppointments(pairings = []) {
  if (!Array.isArray(pairings) || !pairings.length) return pairings;
  const maleSchedule = new Map();
  const order = pairings
    .map(p => ({ pairing: p, key: getEarliestAppointmentTimestamp(p.appointments, p.startDate) }))
    .sort((a, b) => a.key - b.key);
  const updated = new Map();
  order.forEach(({ pairing }) => {
    const adjusted = autoAdjustPairingAppointments(pairing, maleSchedule);
    updated.set(pairing.id, adjusted);
  });
  return pairings.map(p => updated.get(p.id) || p);
}

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
}

function scaleDimensions(width, height, maxDimension = 1024) {
  if (!width || !height) return { width: 0, height: 0 };
  const largest = Math.max(width, height);
  if (!maxDimension || largest <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / largest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function decodeQrFromImageFile(file, { maxDimension = 1024 } = {}) {
  if (!file) return null;
  const blobUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(blobUrl);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) {
      throw new Error('Invalid image dimensions');
    }

    const { width, height } = scaleDimensions(naturalWidth, naturalHeight, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Canvas context not available');
    }
    context.drawImage(image, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    if (result && typeof result.data === 'string') {
      return result.data;
    }
    return null;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function extractDecodedText(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.decodedText === 'string') return payload.decodedText;
    if (typeof payload.data === 'string') return payload.data;
    if (Array.isArray(payload) && payload.length > 0) {
      return extractDecodedText(payload[0]);
    }
  }
  return null;
}

function extractSnakeIdFromPayload(decoded) {
  if (decoded == null) return null;
  const raw = String(decoded).trim();
  if (!raw) return null;
  const decodeValue = (value) => {
    if (value == null) return null;
    const cleaned = String(value).replace(/\+/g, ' ');
    try {
      return decodeURIComponent(cleaned);
    } catch {
      return cleaned;
    }
  };

  const matchGeneralSnakeParam = () => {
    const re = /(?:#|[?&])snake=([^&#\s]+)/i;
    const m = raw.match(re);
    if (m && m[1]) return decodeValue(m[1]);
    return null;
  };

  const matchPrefixedSnake = () => {
    const re = /^#?snake[:=]([^&#\s]+)/i;
    const m = raw.match(re);
    if (m && m[1]) return decodeValue(m[1]);
    return null;
  };

  const tryUrlParsing = () => {
    try {
      const url = raw.includes('://')
        ? new URL(raw)
        : new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://local');
      if (url.searchParams.has('snake')) {
        const found = url.searchParams.get('snake');
        if (found) return decodeValue(found);
      }
      const hashMatch = url.hash && url.hash.match(/snake=([^&#\s]+)/i);
      if (hashMatch && hashMatch[1]) {
        return decodeValue(hashMatch[1]);
      }
    } catch {
      // ignore malformed URLs
    }
    return null;
  };

  const extractor = matchGeneralSnakeParam() || matchPrefixedSnake() || tryUrlParsing();
  if (extractor) return extractor;
  const fallback = decodeValue(raw);
  return fallback || null;
}

// lightweight logs helpers
function updateLog(target, key, idxOrEntry, maybePatch) {
  // If first arg is a setter function (used by LogsEditor), apply an in-place update
  if (typeof target === 'function') {
    const setDraft = target;
    const idx = idxOrEntry;
    const patch = maybePatch || {};
    setDraft(d => {
      const logs = { ...(d.logs || {}) };
      const arr = Array.isArray(logs[key]) ? [...logs[key]] : [];
      // if idx is a number, merge patch into that index
      if (typeof idx === 'number') {
        const existing = arr[idx] || {};
        arr[idx] = { ...existing, ...patch };
      } else if (idxOrEntry && typeof idxOrEntry === 'object') {
        // allow calling updateLog(setDraft, key, newEntry) to append
        arr.push(idxOrEntry);
      }
      return { ...d, logs: { ...logs, [key]: arr } };
    });
    return;
  }

  // Backwards-compatible: if first arg is a snake object, return a new snake with an appended entry
  const snake = target;
  if (!snake) return snake;
  const entry = idxOrEntry;
  const logs = { ...(snake.logs || {}) };
  logs[key] = [...(logs[key]||[]), entry];
  return { ...snake, logs };
}

// LogsEditor is implemented later in the file; stub removed.


function parseReptileBuddyText(raw) {
  if (!raw) return [];
  // more robust heuristic parser: split by blank lines into blocks and try several common patterns
  const blocks = raw.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  const out = [];
  for (const b of blocks) {
  let lines = b.split(/\n/).map(l=>l.trim()).filter(Boolean);
  // ignore species line 'Ball Python (Python regius)'
  lines = lines.filter(l => !/^ball python\s*\(python regius\)$/i.test(l));
    const obj = { name: '', sex: 'F', morphs: [], hets: [], tags: [], groups: [], imageUrl: undefined };

    // helper to split a comma/slash separated list into array
    const splitList = s => (s || '').split(/[,/]/).map(x=>x.trim()).filter(Boolean);

    // Special-case: many PDFs export records as 4-line blocks:
    // 1: Name (ID)
    // 2: Species (latin)
    // 3: Gender
    // 4: Genetics (e.g. "Pinstripe, Albino (Heterozygous)")
    // If we detect this pattern, parse it strictly.
    if (lines.length >= 4) {
      const mNameId = lines[0].match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      const genderLine = lines[2].toLowerCase();
      if (mNameId && /female|male|f|m/i.test(genderLine)) {
        obj.name = mNameId[1].trim();
        obj.id = mNameId[2].trim();
        obj.sex = /female/i.test(genderLine) ? 'F' : (/male/i.test(genderLine) ? 'M' : 'F');

        // parse genetics line
        const genLine = lines[3];
        // match tokens like "Albino (Heterozygous)" or plain "Pinstripe"
        const tokenRe = /([^,]+(?:\([^)]*\))?)/g;
        const tokens = [];
        let tk;
        while ((tk = tokenRe.exec(genLine)) !== null) {
          const t = tk[1].trim();
          if (t) tokens.push(t);
        }

        for (let t of tokens) {
          // extract annotation in parentheses if present
          const ma = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
          let gene = t;
          let anno = null;
          if (ma) { gene = ma[1].trim(); anno = ma[2].trim().toLowerCase(); }
          // normalize common annotation names
          if (!anno) {
            // plain token -> treat as visual (morph)
            obj.morphs.push(gene);
          } else if (/regular/i.test(anno)) {
            // Regular means it's a visual form
            obj.morphs.push(gene);
          } else if (/heterozygous66|heterozygous 66|66%|\b66\b/i.test(anno)) {
            obj.hets.push(`66% ${gene}`);
          } else if (/heterozygous50|heterozygous 50|50%|\b50\b/i.test(anno)) {
            obj.hets.push(`50% ${gene}`);
          } else if (/heterozygous|het/i.test(anno)) {
            obj.hets.push(`${gene}`);
          } else if (/\bpos(?:s?i?a?ble)?\b/i.test(anno)) {
            obj.hets.push(`${gene} (possible)`);
          } else {
            // unknown annotation - add to hets conservatively
            obj.hets.push(`${gene} (${anno})`);
          }
        }

        if (obj.name) out.push(obj);
        continue; // done with this block
      }
    }

    // Try to detect "Name:" style and explicit fields first
    for (const l of lines) {
      const low = l.toLowerCase();
      if (low.startsWith('name:')) obj.name = l.split(':').slice(1).join(':').trim();
      if (low.startsWith('sex:')) {
        if (/female/i.test(l)) obj.sex = 'F';
        else if (/male/i.test(l)) obj.sex = 'M';
      }
      if (low.startsWith('morphs:') || low.startsWith('morph:') || low.includes('morph')) {
        // capture after ':' if present, otherwise try to take rest of line
        const parts = l.split(':');
        const payload = parts.length > 1 ? parts.slice(1).join(':') : l.replace(/morphs?:/i, '').trim();
        obj.morphs = splitList(payload);
      }
      if (low.startsWith('hets:') || low.startsWith('het:') || low.includes('het')) {
        const parts = l.split(':');
        const payload = parts.length > 1 ? parts.slice(1).join(':') : l.replace(/hets?:/i, '').trim();
        obj.hets = splitList(payload);
      }
    }

    // If no explicit name found, try some common line patterns
    if (!obj.name && lines.length) {
      const first = lines[0];
      // patterns: "Name (Female)", "Name - Female - Clown", "Name — Female"
      const mParen = first.match(/^(.+?)\s*\((male|female|m|f)\)/i);
      if (mParen) {
        obj.name = mParen[1].trim();
        obj.sex = /male/i.test(mParen[2]) ? 'M' : 'F';
      } else {
        const parts = first.split(/[-–—|\t]/).map(p=>p.trim()).filter(Boolean);
        if (parts.length >= 2 && /^(male|female|m|f)$/i.test(parts[1])) {
          obj.name = parts[0];
          obj.sex = /male/i.test(parts[1]) ? 'M' : 'F';
          // remaining parts could include morphs
          if (parts.length > 2) obj.morphs = splitList(parts.slice(2).join(', '));
        } else {
          // fallback: use first line as name
          obj.name = first;
        }
      }
    }

    // Try to extract sex from any line if not set
    if ((!obj.sex || obj.sex === '') && lines.some(l=>/male|female|\bM\b|\bF\b/i.test(l))) {
      for (const l of lines) {
        if (/female/i.test(l)) { obj.sex = 'F'; break; }
        if (/male/i.test(l)) { obj.sex = 'M'; break; }
      }
    }

    // Try to find morphs/hets in other lines if still empty
    if ((!obj.morphs || !obj.morphs.length) && lines.length > 1) {
      for (const l of lines.slice(1)) {
        if (/morphs?:|visuals?:/i.test(l) || /,/.test(l) || /\//.test(l)) {
          const parts = l.split(/:|–|-|—/).map(p=>p.trim()).filter(Boolean);
          const payload = parts.length>1 ? parts.slice(1).join(':') : parts[0];
          const arr = splitList(payload);
          if (arr.length) { obj.morphs = arr; break; }
        }
      }
    }

    if ((!obj.hets || !obj.hets.length) && lines.length > 1) {
      for (const l of lines.slice(1)) {
        if (/hets?:/i.test(l) || /het\b/i.test(l)) {
          const parts = l.split(/:|–|-|—/).map(p=>p.trim()).filter(Boolean);
          const payload = parts.length>1 ? parts.slice(1).join(':') : parts[0];
          const arr = splitList(payload);
          if (arr.length) { obj.hets = arr; break; }
        }
      }
    }

    // normalize: ensure arrays and trim name
    obj.name = (obj.name || '').trim();
    obj.morphs = Array.isArray(obj.morphs) ? obj.morphs.map(x=>x.trim()).filter(Boolean) : (obj.morphs ? [String(obj.morphs).trim()] : []);
    obj.hets = Array.isArray(obj.hets) ? obj.hets.map(x=>x.trim()).filter(Boolean) : (obj.hets ? [String(obj.hets).trim()] : []);

    if (obj.name) out.push(obj);
  }
  return out;
}

// Strict parser for 4-line blocks as described by user:
// Line1: Name (ID)
// Line2: species (ignored)
// Line3: gender
// Line4: genetics tokens with optional annotations
function parseFourLineBlocks(raw) {
  if (!raw) return [];
  const blocks = raw.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  const out = [];
  for (const b of blocks) {
  // remove any species line like 'Ball Python (Python regius)'
  let lines = b.split(/\n/).map(l=>l.trim()).filter(Boolean);
  lines = lines.filter(l => !/^ball python\s*\(python regius\)$/i.test(l));
  if (lines.length < 3) continue;
    // line1: Name (ID)
    const m = lines[0].match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!m) continue;
    const name = m[1].trim();
    const id = m[2].trim();
  // line2: gender (after removing species line, gender will be at index 1)
  const g = lines[1] ? lines[1].toLowerCase() : '';
  const sex = /female/i.test(g) ? 'F' : (/male/i.test(g) ? 'M' : 'F');
  // line3: genetics (after removing species)
  const genLine = lines[2] || '';
    const tokens = genLine.split(',').map(t=>t.trim()).filter(Boolean);
    const morphs = [];
    const hets = [];
    for (const t of tokens) {
      const ma = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      let gene = t;
      let anno = null;
      if (ma) { gene = ma[1].trim(); anno = ma[2].trim().toLowerCase(); }
      if (!anno) {
        morphs.push(gene);
      } else if (/regular/i.test(anno)) {
        morphs.push(gene);
      } else if (/heterozygous66|heterozygous 66|66%|\b66\b/i.test(anno)) {
        hets.push(`66% ${gene}`);
      } else if (/heterozygous50|heterozygous 50|50%|\b50\b/i.test(anno)) {
        hets.push(`50% ${gene}`);
      } else if (/heterozygous|het/i.test(anno)) {
        hets.push(`${gene}`);
      } else if (/\bpos(?:s?i?a?ble)?\b/i.test(anno)) {
        hets.push(`${gene} (possible)`);
      } else {
        hets.push(`${gene} (${anno})`);
      }
    }
    out.push({ name, id, sex, morphs, hets });
  }
  return out;
}

function convertParsedToSnake(p, idConfig = null) {
  // p: { name, id?, sex, morphs, hets, year? }
  const sex = ensureSex(p.sex, 'F');
  // normalize tokens possibly present in morphs/hets/genetics
  const combined = [
    ...(Array.isArray(p.morphs) ? p.morphs : (p.morphs ? [String(p.morphs)] : [])),
    ...(Array.isArray(p.hets) ? p.hets : (p.hets ? [String(p.hets)] : [])),
    ...(Array.isArray(p.genetics) ? p.genetics : (p.genetics ? [String(p.genetics)] : []))
  ];
  const norm = normalizeMorphHetLists(combined);
  const birthDate = normalizeDateInput(p.birthDate || p.hatchDate || p.birthdate || null);
  const birthYear = birthDate ? extractYearFromDateString(birthDate) : null;

  const providedIdRaw = (p.id || '').toString().trim();
  const existingRecordsRaw = Array.isArray(p.__existingRecords) ? p.__existingRecords : null;
  const existingIdsRaw = Array.isArray(p.__existingIds) ? p.__existingIds : [];
  const existingEntries = (existingRecordsRaw && existingRecordsRaw.length)
    ? existingRecordsRaw
        .map(record => {
          if (!record) return null;
          if (typeof record === 'string') {
            const id = record;
            return { id, idSequence: extractSequenceFromId(id, idConfig) };
          }
          const id = record.id != null ? String(record.id) : '';
          if (!id) return null;
          const seqValue = Number(record.idSequence);
          const normalizedSeq = Number.isFinite(seqValue) && seqValue > 0
            ? Math.floor(seqValue)
            : extractSequenceFromId(id, idConfig);
          return { id, idSequence: normalizedSeq };
        })
        .filter(Boolean)
    : existingIdsRaw
        .map(id => String(id))
        .filter(Boolean)
        .map(id => ({ id, idSequence: extractSequenceFromId(id, idConfig) }));
  const existingIdSet = new Set(existingEntries.map(entry => entry.id));

  let yearVal = Number(p.year);
  if (!Number.isFinite(yearVal) || yearVal <= 0) yearVal = new Date().getFullYear();
  let nameForId = p.name || '';
  let hadYear = false;
  if (p.name) {
  const m = String(p.name).trim().match(/^(20\d{2})\b[-\s:/]*(.*)$/);
    if (m) {
      hadYear = true;
      yearVal = Number(m[1]) || yearVal;
      nameForId = (m[2] || '').trim() || nameForId;
    }
  }
  if (Number.isFinite(birthYear)) {
    yearVal = birthYear;
  }

  let resolvedId = '';
  if (providedIdRaw) {
    let candidate = providedIdRaw;
    if (existingIdSet.has(candidate)) {
      let counter = 2;
      while (existingIdSet.has(`${providedIdRaw}-${counter}`)) counter += 1;
      candidate = `${providedIdRaw}-${counter}`;
    }
    resolvedId = candidate;
  }

  const idSource = providedIdRaw || p.name || '';
  const suffixMatch = String(idSource).match(/-(\d+)$/);
  const suffixNum = suffixMatch ? Number(suffixMatch[1]) : null;

  const generatedId = resolvedId || generateSnakeId(
    nameForId || (sex === 'F' ? 'NewFemale' : 'NewMale'),
    yearVal,
    existingEntries,
    suffixNum,
    {
      hadYear,
      originalRawName: String(p.name || ''),
      morphs: norm.morphs,
      hets: norm.hets,
      idConfig,
      sex,
      birthYear,
    }
  );
  const idSequence = extractSequenceFromId(generatedId, idConfig);

  const weightValue = Number(p.weight);
  const weight = Number.isFinite(weightValue) ? weightValue : 0;
  const rawGroups = Array.isArray(p.groups) ? p.groups : splitMultiValueCell(p.groups);
  const groups = rawGroups.map(g => String(g).trim()).filter(Boolean);
  const rawTags = Array.isArray(p.tags) ? p.tags : splitMultiValueCell(p.tags);
  const tags = rawTags.map(t => String(t).trim()).filter(Boolean);
  const status = String(p.status || 'Active').trim() || 'Active';
  const notes = typeof p.notes === 'string' ? p.notes.trim() : '';
  const imageUrl = p.imageUrl ? String(p.imageUrl) : undefined;
  const photos = normalizeSnakePhotos(p.photos);
  const primaryImageUrl = imageUrl || (photos.length ? photos[photos.length - 1].url : undefined);

  return {
    id: generatedId,
    name: (nameForId && nameForId.length) ? nameForId : (p.name || (sex === 'F' ? 'New Female' : 'New Male')),
    sex,
    morphs: norm.morphs,
    hets: norm.hets,
    weight,
    year: yearVal,
    birthDate,
    tags,
    groups,
    status,
    notes,
  imageUrl: primaryImageUrl,
    photos,
    idSequence,
    logs: { feeds:[], weights:[], sheds:[], cleanings:[], meds:[] }
  };
}

const SEQ_PLACEHOLDER = '__SEQ_PLACEHOLDER__';

function escapeRegexSpecial(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function padSequenceNumber(value, padding = 1) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    const fallback = Number.isFinite(num) ? Math.max(1, Math.floor(num) || 1) : 1;
    return String(fallback);
  }
  const str = String(Math.floor(num));
  if (!padding || padding <= 1) return str;
  return str.padStart(padding, '0');
}

function ensureTemplateHasSequence(template) {
  const base = String(template || '').trim();
  if (/\[SEQ\]/i.test(base)) return base;
  if (!base) return DEFAULT_ID_GENERATOR_CONFIG.template;
  if (/(?:-|_|\.|#|\/|\s)$/.test(base)) {
    return `${base}[SEQ]`;
  }
  return `${base}-[SEQ]`;
}

function computeHetSegment(hets = []) {
  const list = Array.isArray(hets) ? hets : [];
  const segments = [];
  for (const h of list) {
    const hh = String(h || '').trim();
    if (!hh) continue;
    const pct = hh.match(/(\d+)%\s*(.*)$/i);
    if (pct) {
      const num = pct[1];
      const gene = (pct[2] || '')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toLowerCase();
      if (gene) segments.push(`${num}%H${gene}`);
      continue;
    }
  const poss = hh.match(/^(.+?)\s*\(pos(?:s?i?a?ble)?\)$/i);
    let geneName = hh;
    if (poss) geneName = poss[1];
    geneName = geneName.replace(/[^A-Za-z]/g, '').slice(0, 3).toLowerCase();
    if (geneName) segments.push(`H${geneName}`);
  }
  return segments.join('');
}

function sanitizeGeneForAbbreviation(token) {
  return String(token || '')
    .replace(/\bhet\b/gi, '')
    .replace(/\bpos(?:s?i?a?ble)?\b|\bprobable\b|\bmaybe\b|\bph\b/gi, '')
    .replace(/\d{1,3}%/g, '')
    .replace(/[()]/g, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function abbreviateGeneToken(token) {
  const sanitized = sanitizeGeneForAbbreviation(token);
  if (!sanitized) return '';
  const custom = {
    monarch: 'MONA',
    monsoon: 'MONS',
  };
  const key = sanitized.replace(/[^A-Za-z]/g, '').toLowerCase();
  if (custom[key]) return custom[key];
  const words = sanitized
    .split(/\s+/)
    .map(word => word.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean);
  if (!words.length) return '';
  if (words.length >= 2) {
    return words.map(word => word.charAt(0).toUpperCase()).join('');
  }
  const upper = words[0].toUpperCase();
  return upper.length <= 3 ? upper : upper.slice(0, 3);
}

function computeGeneInitialSegment(morphs = [], hets = []) {
  const morphList = Array.isArray(morphs) ? morphs : (morphs ? [morphs] : []);
  const hetList = Array.isArray(hets) ? hets : (hets ? [hets] : []);

  const morphCodes = morphList
    .map(token => abbreviateGeneToken(token))
    .filter(Boolean);

  const hetCodes = hetList
    .map(token => {
      const raw = String(token || '').trim();
      if (!raw) return '';
      const percentMatch = raw.match(/(\d{1,3}%)/);
      const percent = percentMatch ? percentMatch[1] : '';
      const isPossibleHet = /\bpos(?:s?i?a?ble)?\b/i.test(raw) || /\bph\b/i.test(raw) || /\bmaybe\b/i.test(raw) || /\bprobable\b/i.test(raw);
      const geneCode = abbreviateGeneToken(raw);
      if (!geneCode) return '';
      const prefixes = [];
      if (percent) prefixes.push(percent);
      if (isPossibleHet && !prefixes.includes('pos')) {
        prefixes.push('pos');
      }
      return `${prefixes.join('')}h${geneCode}`;
    })
    .filter(Boolean);

  const combined = [...morphCodes, ...hetCodes];
  if (combined.length) return combined.join('');
  return '';
}

function titleCaseWords(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function computeIdNameSegments(nameInput = '') {
  const rawName = String(nameInput ?? '');
  const name = rawName.trim();
  const lettersOnly = name.replace(/[^A-Za-z]/g, '');
  const sanitizedAlnum = name.replace(/[^A-Za-z0-9]/g, '');
  const prefixCore = sanitizedAlnum || lettersOnly || 'X';
  const prefixUpper = prefixCore.toUpperCase();
  const prefixLower = prefixCore.toLowerCase();
  const nameTitle = name ? titleCaseWords(name) : prefixUpper;
  const nameUpper = name ? name.toUpperCase() : prefixUpper;
  const nameLower = name ? name.toLowerCase() : prefixLower;
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words.length
    ? words.map(w => w.charAt(0).toUpperCase()).join('')
    : prefixUpper.charAt(0) || 'X';
  const parenMatch = name.match(/^\s*\(([^)]+)\)/);
  let parenChunk = '';
  if (parenMatch) {
    const inside = parenMatch[1].replace(/[^A-Za-z0-9]/g, '');
    if (inside) {
      const base = inside.toUpperCase().slice(0, 3);
      parenChunk = `(${base})`;
    }
  }

  return {
    rawName,
    lettersOnly,
    sanitizedAlnum,
    prefixCore,
    prefixUpper,
    prefixLower,
    nameTitle,
    nameUpper,
    nameLower,
    initials: initials || prefixUpper.charAt(0) || 'X',
    slugLower: sanitizedAlnum ? sanitizedAlnum.toLowerCase() : prefixLower,
    slugUpper: sanitizedAlnum ? sanitizedAlnum.toUpperCase() : prefixUpper,
    parenChunk,
  };
}

function buildIdTemplateContext({ name, rawName, morphs, hets, year, sex, birthYear }) {
  const yearValue = Number(year) || new Date().getFullYear();
  const birthYearValue = Number(birthYear);
  const resolvedBirthYear = Number.isFinite(birthYearValue) && birthYearValue > 0 ? birthYearValue : yearValue;
  const birthYearShort = String(resolvedBirthYear).slice(-2).padStart(2, '0');
  const segments = computeIdNameSegments(name || rawName);
  const geneInitials = computeGeneInitialSegment(morphs, hets);
  return {
    ...segments,
    hetSegment: computeHetSegment(hets),
    yearFull: yearValue,
    yearShort: String(yearValue).slice(-2).padStart(2, '0'),
    birthYearFull: resolvedBirthYear,
    birthYearShort,
    sexCode: String(sex || 'U').trim().charAt(0).toUpperCase() || 'U',
    geneInitials,
  };
}

function buildIdFromTemplateNormalized(config, context, sequenceValue = SEQ_PLACEHOLDER) {
  const template = ensureTemplateHasSequence(config.template);
  const replacements = {
    '[YEAR]': String(context.yearFull),
    '[YR]': context.yearShort,
    '[YEAROB]': String(context.birthYearFull ?? context.yearFull),
    '[YROB]': context.birthYearShort ?? context.yearShort,
    '[PREFIX]': context.prefixCore,
    '[PREFIXU]': context.prefixUpper,
    '[PREFIXL]': context.prefixLower,
    '[NAME]': context.nameTitle,
    '[NAMEU]': context.nameUpper,
    '[NAMEL]': context.nameLower,
    '[INITIALS]': context.initials,
    '[SLUG]': context.slugLower,
    '[SLUGU]': context.slugUpper,
    '[PAREN]': context.parenChunk,
    '[HETS]': context.hetSegment,
    '[SEX]': context.sexCode,
    '[TEXT]': config.customText || '',
    '[GEN3]': context.geneInitials || '',
    '[-]': '-',
  };

  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(escapeRegexSpecial(token), 'g'), value);
  }

  let sequenceString;
  if (sequenceValue === SEQ_PLACEHOLDER) {
    sequenceString = SEQ_PLACEHOLDER;
  } else if (Number.isFinite(Number(sequenceValue))) {
    sequenceString = padSequenceNumber(sequenceValue, config.sequencePadding);
  } else {
    sequenceString = String(sequenceValue || '');
  }
  output = output.replace(/\[SEQ\]/gi, sequenceString);

  if (config.uppercase) {
    output = output.toUpperCase();
  }

  return output.trim();
}

function buildSequenceRegexFromTemplate(template) {
  const ensured = ensureTemplateHasSequence(template);
  const tokenRegex = /\[([A-Z0-9-]+)\]/gi;
  let lastIndex = 0;
  const parts = [];
  let match;
  let seqCaptured = false;
  while ((match = tokenRegex.exec(ensured)) !== null) {
    const staticChunk = ensured.slice(lastIndex, match.index);
    if (staticChunk) {
      parts.push(escapeRegexSpecial(staticChunk));
    }
    const tokenName = (match[1] || '').toUpperCase();
    if (tokenName === 'SEQ') {
      if (!seqCaptured) {
        parts.push('(\\d+)');
        seqCaptured = true;
      } else {
        parts.push('(?:\\d+)');
      }
    } else if (tokenName === '-') {
      parts.push('(?:-)');
    } else {
      parts.push('(?:.*?)');
    }
    lastIndex = match.index + match[0].length;
  }
  const trailing = ensured.slice(lastIndex);
  if (trailing) {
    parts.push(escapeRegexSpecial(trailing));
  }
  return new RegExp(`^${parts.join('')}$`, 'i');
}

function extractSequenceFromId(id, idConfig = null) {
  if (!id) return null;
  const normalizedConfig = normalizeIdGeneratorConfig(idConfig);
  if (!normalizedConfig?.template) return null;
  const pattern = buildSequenceRegexFromTemplate(normalizedConfig.template);
  const match = String(id).match(pattern);
  if (!match || match.length < 2) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

// Generate snake id using configurable template rules
function generateSnakeId(name, year, existingSnakesOrIds = [], preferredNumber = null, opts = {}) {
  const {
    hadYear = false,
    originalRawName = '',
    morphs = [],
    hets = [],
    idConfig = null,
    sex = 'U',
    birthYear = null,
    forceSequence = null,
  } = opts || {};
  const normalizedConfig = normalizeIdGeneratorConfig(idConfig);

  const existingEntries = Array.isArray(existingSnakesOrIds)
    ? existingSnakesOrIds
        .map(item => {
          if (!item) return null;
          if (typeof item === 'string') {
            const id = item;
            return { id, idSequence: extractSequenceFromId(id, normalizedConfig) };
          }
          if (typeof item === 'object') {
            if (item.id || item.id === '') {
              const rawId = item.id;
              const id = typeof rawId === 'string' ? rawId : (rawId != null ? String(rawId) : '');
              if (!id) return null;
              const seqValue = Number(item.idSequence);
              const normalizedSeq = Number.isFinite(seqValue) && seqValue > 0
                ? Math.floor(seqValue)
                : extractSequenceFromId(id, normalizedConfig);
              return { id, idSequence: normalizedSeq };
            }
            const fallback = String(item);
            if (!fallback) return null;
            return { id: fallback, idSequence: extractSequenceFromId(fallback, normalizedConfig) };
          }
          const fallback = String(item);
          if (!fallback) return null;
          return { id: fallback, idSequence: extractSequenceFromId(fallback, normalizedConfig) };
        })
        .filter(entry => entry && entry.id)
    : [];

  const existingIds = existingEntries.map(entry => entry.id).filter(Boolean);
  const existingIdsLower = existingIds.map(id => id.toLowerCase());
  const existingIdSetLower = new Set(existingIdsLower);
  const existingUniqueCount = existingIdSetLower.size;
  const reservedSequences = new Set();
  existingEntries.forEach(entry => {
    const value = Number(entry.idSequence);
    if (Number.isFinite(value) && value > 0) {
      reservedSequences.add(Math.floor(value));
    }
  });

  const effectiveYear = Number(year) || new Date().getFullYear();
  const baseName = (name && String(name).trim())
    || (originalRawName && String(originalRawName).trim())
    || (sex === 'M' ? 'New Male' : 'New Female');

  const context = buildIdTemplateContext({
    name: baseName,
    rawName: hadYear ? originalRawName : name,
    morphs,
    hets,
    year: effectiveYear,
    sex,
    birthYear: birthYear ?? effectiveYear,
  });

  const buildCandidate = (num) => buildIdFromTemplateNormalized(normalizedConfig, context, num);
  const sequencePattern = buildSequenceRegexFromTemplate(normalizedConfig.template);

  for (const id of existingIds) {
    if (!id || typeof id !== 'string') continue;
    const match = id.match(sequencePattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      reservedSequences.add(Math.floor(value));
    }
  }

  const tryForcedSequence = Number(forceSequence);
  if (Number.isFinite(tryForcedSequence) && tryForcedSequence > 0) {
    const forced = Math.floor(tryForcedSequence);
    const candidate = buildCandidate(forced);
    if (!existingIdSetLower.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  let nextSequence = Math.max(1, existingUniqueCount + 1);
  while (reservedSequences.has(nextSequence)) {
    nextSequence += 1;
  }
  if (preferredNumber != null) {
    // Manual overrides are ignored to guarantee strictly increasing sequence values.
  }
  let candidate = buildCandidate(nextSequence);
  while (existingIdSetLower.has(candidate.toLowerCase())) {
    nextSequence += 1;
    while (reservedSequences.has(nextSequence)) {
      nextSequence += 1;
    }
    candidate = buildCandidate(nextSequence);
  }

  return candidate;
}

// Normalize a list of tokens into morphs (visuals) and hets (including % and possible)
function normalizeMorphHetLists(tokens) {
  const sourceArr = Array.isArray(tokens) ? tokens.slice() : (tokens ? String(tokens).split(GENE_TOKEN_SPLIT_REGEX).map(s=>s.trim()).filter(Boolean) : []);
  const hasLeucisticContext = hasLeucisticTriggerText(sourceArr.join(' '));
  const arr = [];
  sourceArr.forEach((token) => {
    const rawToken = String(token || '').trim();
    if (!rawToken) return;
    if (hasLeucisticContext && isLeucisticNoiseToken(rawToken)) return;
    const canonicalToken = resolveCanonicalGene(rawToken, lookupCanonicalGene);
    if (canonicalToken && !isHetDescriptorToken(rawToken)) {
      arr.push(canonicalToken);
      return;
    }
    if (isHetDescriptorToken(rawToken)) {
      arr.push(rawToken);
      return;
    }
    const aliasGenes = resolveMorphAliasGenes(rawToken, getActiveMorphAliases());
    if (Array.isArray(aliasGenes) && aliasGenes.length) {
      aliasGenes.forEach(gene => {
        const cleanedGene = String(gene || '').trim();
        if (cleanedGene) arr.push(cleanedGene);
      });
      return;
    }
    arr.push(rawToken);
  });

  const morphs = [];
  const hets = [];
  for (let t of arr) {
    if (!t) continue;
    const raw = String(t).trim();
    const low = raw.toLowerCase();
    // if token explicitly marks Regular in parentheses, treat as a morph and remove the annotation
    if (/\([^)]*\bregular\b[^)]*\)/i.test(raw)) {
      const gene = raw.replace(/\([^)]*\bregular\b[^)]*\)/i, '').replace(/[()]/g,'').trim();
      morphs.push(cap(gene));
      continue;
    }
    // detect percentage hets (e.g., '50% clown' or 'clown (heterozygous50)')
    const pctMatch = raw.match(/(\d+)%/);
    if (pctMatch) {
      const pct = pctMatch[1];
      // remove pct and het-like words to get gene name
      let gene = raw.replace(/(\d+)%/,'').replace(/\bheterozygous\b/ig,'').replace(/\bhet\b/ig,'').replace(/[()]/g,'').trim();
      gene = cap(gene) || gene;
      hets.push(`${pct}% ${gene}`);
      continue;
    }
    // 'possible' annotation
    if (/\bpos(?:s?i?a?ble)?\b/i.test(low)) {
      const gene = raw
        .replace(/\bpos(?:s?i?a?ble)?\b/ig,'')
        .replace(/\bheterozygous\b/ig,'')
        .replace(/\bhet\b/ig,'')
        .replace(/[()]/g,'')
        .trim();
      hets.push(`Possible ${cap(gene)}`);
      continue;
    }
    // explicit het words
    if (/\bheterozygous\b|\bhet\b/i.test(low)) {
      const gene = raw.replace(/\bheterozygous\b/ig,'').replace(/\bhet\b/ig,'').replace(/[()]/g,'').trim();
      hets.push(cap(gene));
      continue;
    }
    // otherwise treat as morph (visual)
    morphs.push(cap(raw));
  }
  const normalizedMorphs = uniqueGeneTokens(morphs.map(m => String(m).trim()).filter(Boolean));
  const normalizedHets = uniqueGeneTokens(
    hets
      .map(h => normalizeHetInputToken(h))
      .filter(Boolean)
  );
  return {
    morphs: normalizedMorphs,
    hets: normalizedHets
  };
}

function formatParsedPreview(p) {
  // p: { name, id, sex, morphs, hets }
  const name = p.name || '';
  const id = p.id || '';
  const gender = p.sex === 'M' ? 'Male' : (p.sex === 'F' ? 'Female' : 'Unknown');
  const geneticsTokens = combineMorphsAndHetsForDisplay(p.morphs, p.hets, p.possibleHets);
  const genetics = geneticsTokens.length ? geneticsTokens.join(', ') : '-';

  return `Name - ${name}\nID - ${id}\nGender - ${gender}\nGenetics - ${genetics}`;
}

/**
 * Parse a single-line snake description:
 * Name (ID) Ball Python (Python regius) Gender Trait1, Trait2 (Tag), ...
 * Returns { name, id, gender, genetics: [] }
 */
function parseOneLineSnake(line) {
  if (!line || typeof line !== 'string') return null;
  const input = line.trim();

  // extract Name (ID)
  const nameIdMatch = input.match(/^\s*(.*?)\s*\(([^)]+)\)\s*/);
  if (!nameIdMatch) return null;
  const name = nameIdMatch[1].trim();
  const id = nameIdMatch[2].trim();

  let rest = input.slice(nameIdMatch[0].length).trim();
  // remove species phrase if present
  rest = rest.replace(/Ball Python\s*\(Python regius\)/i, '').trim();

  // extract gender
  const genderMatch = rest.match(/^(Female|Male|Unknown)\b/i);
  const gender = genderMatch ? (genderMatch[1][0].toUpperCase() + genderMatch[1].slice(1).toLowerCase()) : 'Unknown';
  let geneticsPart = genderMatch ? rest.slice(genderMatch[0].length).trim() : rest;
  geneticsPart = geneticsPart.replace(/^[-\s:]+/, '').trim();

  if (!geneticsPart) return { name, id, gender, genetics: [] };

  const tokens = geneticsPart.split(',').map(t=>t.trim()).filter(Boolean);
  const genetics = tokens.map(token => {
    const m = token.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    const gene = m ? m[1].trim() : token;
    const tag = m ? m[2].trim().toLowerCase() : null;
    if (!tag) return gene;
    if (/^regular$/i.test(tag)) return gene;
    if (/heterozygous66|heterozygous 66|66%|^66$/i.test(tag)) return `66% ${gene}`;
    if (/heterozygous50|heterozygous 50|50%|^50$/i.test(tag)) return `50% ${gene}`;
    if (/heterozygous|^het$/i.test(tag)) return `${gene}`;
    if (/\bpos(?:s?i?a?ble)?\b/i.test(tag)) return `Possible het ${gene}`;
    return `het ${gene}`;
  });

  return { name, id, gender, genetics };
}

// Parse lines like: "name | gender | genetics" or "lady D | Female | Normal"
function normalizeTraitToken(token) {
  const t = (token || '').trim();
  const ma = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  const gene = ma ? ma[1].trim() : t;
  const tag = ma ? ma[2].trim().toLowerCase() : null;
  if (!tag) return gene;
  if (/^regular$/i.test(tag)) return gene;
  if (/heterozygous66|66%|^66$/i.test(tag)) return `66% het ${gene}`;
  if (/heterozygous50|50%|^50$/i.test(tag)) return `50% het ${gene}`;
  if (/heterozygous|^het$/i.test(tag)) return `het ${gene}`;
  if (/\bpos(?:s?i?a?ble)?\b/i.test(tag)) return `Possible het ${gene}`;
  return `het ${gene}`;
}

function parsePipeSeparatedLines(raw) {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    // expect at least two pipes: name | gender | genetics
    if (!/\|/.test(line)) continue;
    const parts = line.split('|').map(p=>p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const name = parts[0];
    const gender = parts[1].match(/female/i) ? 'F' : (parts[1].match(/male/i) ? 'M' : 'Unknown');
    const geneticsPart = parts.slice(2).join(', ');
    const tokens = geneticsPart ? geneticsPart.split(',').map(t=>t.trim()).filter(Boolean) : [];
    const genetics = tokens.map(normalizeTraitToken);
    out.push({ name, sex: gender, morphs: genetics.filter(g=>!/^het\b|^66%|^50%|^possible/i.test(g)), hets: genetics.filter(g=>/^het\b|^66%|^50%|^Possible/i.test(g)) });
  }
  return out;
}

// Simple CSV parser that returns rows (array of cells). Handles quoted fields.
function parseCsvToRows(csvText) {
  const rows = [];
  let i = 0;
  const len = csvText.length;
  let cur = '';
  let row = [];
  let inQuotes = false;
  while (i < len) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i+1 < len && csvText[i+1] === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cur += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(cur); cur = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
    cur += ch; i++;
  }
  // push last
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function normalizeHeaderLabel(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectHeaderKey(label) {
  const normalized = normalizeHeaderLabel(label);
  if (!normalized) return null;
  if (/^name$|^animal name$|^snake name$/.test(normalized)) return 'name';
  if (/^id$|^animal id$|^snake id$|^identifier$/.test(normalized)) return 'id';
  if (/(^|\s)(sex|gender)(\s|$)/.test(normalized)) return 'sex';
  if (/(^|\s)(morph|visual|combo)(s)?(\s|$)/.test(normalized)) return 'morphs';
  if (/(^|\s)(het|hetero)(s)?(\s|$)/.test(normalized)) return 'hets';
  if (/(^|\s)(genetic|gene|traits?)(s)?(\s|$)/.test(normalized)) return 'genetics';
  if (/(^|\s)(group|collection|category|rack)(s)?(\s|$)/.test(normalized)) return 'groups';
  if (/(^|\s)(tag|keyword)(s)?(\s|$)/.test(normalized)) return 'tags';
  if (/(^|\s)(birth|hatch|dob)(\s|$)/.test(normalized)) return 'birthDate';
  if (/^year$|^birth year$|^hatch year$/.test(normalized)) return 'year';
  if (/(^|\s)weight(\s|$)|(^|\s)grams?(\s|$)/.test(normalized)) return 'weight';
  if (/(^|\s)status(\s|$)/.test(normalized)) return 'status';
  if (/(^|\s)notes?(\s|$)|(^|\s)comments?(\s|$)/.test(normalized)) return 'notes';
  return null;
}

function splitMultiValueCell(value) {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(/[;|,/\n]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeSingleGroupValue(raw) {
  if (!raw && raw !== 0) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (const entry of list) {
    if (entry === null || typeof entry === 'undefined') continue;
    const trimmed = String(entry).trim();
    if (trimmed) return [trimmed];
  }
  return [];
}

function normalizeDateInput(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  return localYMD(parsed);
}

function buildHeaderIndex(headerRow = []) {
  const index = {};
  headerRow.forEach((cell, idx) => {
    const key = detectHeaderKey(cell);
    if (!key) return;
    if (!index[key]) index[key] = [];
    index[key].push(idx);
  });
  return { index, hasHeader: Object.keys(index).length > 0 };
}

function getHeaderValues(row = [], headerIndex = {}, key) {
  const positions = headerIndex[key];
  if (!positions || !positions.length) return [];
  return positions.map(pos => (row[pos] || '').toString()).filter(Boolean);
}

// Add Animal modal form
function deriveQuickAddName(text, parsed = {}) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) return '';

  const firstLine = lines[0];
  const parentheticalId = firstLine.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parentheticalId?.[1]) {
    return parentheticalId[1].trim();
  }

  const normalized = firstLine.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (/^(?:female|male|0\s*[.,/:]\s*1|1\s*[.,/:]\s*0|0\s*1|1\s*0|f|m)(?=\W|$)/i.test(normalized)) {
    return '';
  }

  const cutIndexes = [];
  const id = String(parsed?.id || '').trim();
  if (id) {
    const idIndex = normalized.toLowerCase().indexOf(id.toLowerCase());
    if (idIndex > 0) cutIndexes.push(idIndex);
  }

  const boundaryPatterns = [
    /\b(female|male|0\s*[.,/:]\s*1|1\s*[.,/:]\s*0)\b/i,
    /\b\d{2,5}\s*g\b/i,
    /\bborn\b/i,
    /\b(?:eating|feeding?|fed)\b/i,
    /\bbreeder\b/i,
    /\b(?:19\d{2}|20\d{2})\b/,
  ];
  boundaryPatterns.forEach(pattern => {
    const match = normalized.match(pattern);
    if (match && typeof match.index === 'number' && match.index > 0) {
      cutIndexes.push(match.index);
    }
  });

  const geneticsTokens = [
    ...(Array.isArray(parsed?.morphs) ? parsed.morphs : []),
    ...(Array.isArray(parsed?.hets) ? parsed.hets : []),
  ]
    .map(token => String(token || '')
      .replace(/^\d{1,3}%\s*/i, '')
      .replace(/^(possible|probable|maybe)\s+/i, '')
      .replace(/^het\s+/i, '')
      .trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  geneticsTokens.forEach(token => {
    const tokenIndex = normalized.toLowerCase().indexOf(token.toLowerCase());
    if (tokenIndex > 0) cutIndexes.push(tokenIndex);
  });

  const cutAt = cutIndexes.length ? Math.min(...cutIndexes) : normalized.length;
  const candidate = normalized
    .slice(0, cutAt)
    .replace(/[-–—,:;|/]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!candidate) return '';
  if (/^(?:female|male|0\s*[.,/:]\s*1|1\s*[.,/:]\s*0|0\s*1|1\s*0|f|m)$/i.test(candidate)) return '';
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length > 5) return '';
  return candidate;
}

function AddAnimalWizard({ newAnimal, setNewAnimal, groups, setGroups, statusOptions = [], customStatusTags = [], onCreateStatusTag, onDeleteStatusTag, onCancel, onAdd, onGenerateIdFromWizard, onResolveLeucisticText, onResolveLeucisticLists, availableGenetics = [], theme='blue' }) {
  const { t } = useTranslation();
  const clutchTitleLabel = t('clutch.clutchTitle', { defaultValue: 'Clutch' });
  const deleteLabel = t('clutch.delete', { defaultValue: 'Delete' });
  const collapseLabel = t('clutch.collapse', { defaultValue: 'Collapse' });
  const labelLabel = t('clutch.label', { defaultValue: 'Label' });
  const startingDateLabel = t('clutch.startingDate', { defaultValue: 'Starting date' });
  const appointmentsLabel = t('clutch.appointments', { defaultValue: 'Appointments' });
  const appointmentsHelp = t('clutch.appointmentsHelp', { defaultValue: 'Manage pairing touchpoints' });
  const generateMonthsLabel = t('clutch.generate5Months', { defaultValue: 'Generate 5 months' });
  const addAppointmentLabel = t('clutch.addAppointment', { defaultValue: '+ Add appointment' });
  const appointmentStatusLabel = t('clutch.appointmentStatus', { defaultValue: 'Appointment' });
  const pairingDateLabel = t('clutch.pairingDate', { defaultValue: 'Date of Pairing' });
  const lockLabel = t('clutch.lock', { defaultValue: 'Lock' });
  const lockDateLabel = t('clutch.lockDate', { defaultValue: 'Date of Lock' });
  const notesLabel = t('clutch.notes', { defaultValue: 'Notes' });
  const removeLabel = t('clutch.remove', { defaultValue: 'Remove' });
  const notesFieldLabel = t('clutch.notesField', { defaultValue: 'Notes' });
  const geneticsCalculatorLabel = t('clutch.geneticsCalculator', { defaultValue: 'Genetics calculator' });
  const showLabel = t('clutch.show', { defaultValue: 'Show' });
  const hideLabel = t('common.hide', { defaultValue: 'Hide' });
  const canSubmit = hasMeaningfulAnimalDraftContent(newAnimal);
  const selectedGroup = (Array.isArray(newAnimal.groups) && newAnimal.groups.length ? newAnimal.groups[0] : '') || '';
  const [statusTagInput, setStatusTagInput] = useState('');
  const [quickAddText, setQuickAddText] = useState('');
  const customTagLookup = useMemo(() => new Set(customStatusTags.map(tag => tag.toLowerCase())), [customStatusTags]);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef(null);

  const handleQuickAddUpdateFields = useCallback(async () => {
    const textForParse = typeof onResolveLeucisticText === 'function'
      ? await onResolveLeucisticText(quickAddText, 'Quick Add free text')
      : quickAddText;
    const parsed = parseAnimalText(textForParse, availableGenetics);
    const parsedName = deriveQuickAddName(textForParse, parsed);
    const hasAnyParsedValue = Boolean(
      parsedName
      || parsed.id
      || parsed.sex
      || parsed.weight
      || parsed.hatchYear
      || parsed.hatchDate
      || parsed.breeder
      || parsed.feedingInfo
      || (Array.isArray(parsed.morphs) && parsed.morphs.length)
      || (Array.isArray(parsed.hets) && parsed.hets.length)
      || parsed.unmatchedNotes
    );
    if (!hasAnyParsedValue) return;

    let parsedMorphs = Array.isArray(parsed.morphs) ? parsed.morphs : [];
    let parsedHets = Array.isArray(parsed.hets) ? parsed.hets : [];
    if (typeof onResolveLeucisticLists === 'function' && (parsedMorphs.length || parsedHets.length)) {
      const resolved = await onResolveLeucisticLists(parsedMorphs, parsedHets, 'Quick Add genetics');
      parsedMorphs = resolved?.morphs || parsedMorphs;
      parsedHets = resolved?.hets || parsedHets;
    }

    setNewAnimal(previous => {
      const next = { ...(previous || {}) };
      const isBlank = (value) => value === null || typeof value === 'undefined' || String(value).trim() === '';

      if (isBlank(next.id)) {
        if (parsed.id) {
          next.id = parsed.id;
          next.autoId = false;
        } else if (typeof onGenerateIdFromWizard === 'function') {
          const generated = onGenerateIdFromWizard({
            ...next,
            name: parsedName || next.name,
            sex: parsed.sex || next.sex,
            morphs: parsedMorphs.length ? parsedMorphs : next.morphs,
            hets: parsedHets.length ? parsedHets : next.hets,
            year: parsed.hatchYear || next.year,
            birthDate: parsed.hatchDate || next.birthDate,
          });
          if (generated) {
            next.id = generated;
            next.autoId = false;
          }
        }
      }

      if (isBlank(next.name) && parsedName) {
        next.name = parsedName;
      }

      if (isBlank(next.sex) && parsed.sex) {
        next.sex = parsed.sex;
      }

      if (isBlank(next.morphHetInput) && (parsedMorphs.length || parsedHets.length)) {
        const morphs = normalizeMorphHetLists(parsedMorphs).morphs;
        const hets = uniqueGeneTokens(
          parsedHets
            .map(h => normalizeHetInputToken(h))
            .filter(Boolean)
        );
        next.morphs = morphs;
        next.hets = hets;
        next.morphHetInput = formatMorphHetForInput(morphs, hets);
      }

      if ((isBlank(next.weight) || Number(next.weight) <= 0) && Number.isFinite(Number(parsed.weight)) && Number(parsed.weight) > 0) {
        next.weight = String(parsed.weight);
      }

      if (isBlank(next.birthDate) && parsed.hatchDate) {
        next.birthDate = normalizeBirthDateValue(parsed.hatchDate) || parsed.hatchDate;
      }

      if (isBlank(next.year) && Number.isFinite(Number(parsed.hatchYear)) && Number(parsed.hatchYear) > 0) {
        next.year = String(parsed.hatchYear);
      }

      const notesParts = [];
      if (parsed.breeder) notesParts.push(`Breeder: ${parsed.breeder}`);
      if (parsed.feedingInfo) notesParts.push(`Feeding: ${parsed.feedingInfo}`);
      if (parsed.unmatchedNotes) notesParts.push(parsed.unmatchedNotes);
      if (notesParts.length) {
        const currentNotes = String(next.notes || '').trim();
        const merged = [currentNotes, ...notesParts].filter(Boolean).join('\n').trim();
        next.notes = merged;
      }

      return next;
    });
  }, [availableGenetics, onGenerateIdFromWizard, onResolveLeucisticLists, onResolveLeucisticText, quickAddText, setNewAnimal]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const handleClickOutside = (event) => {
      if (!statusMenuRef.current) return;
      if (!statusMenuRef.current.contains(event.target)) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusMenuOpen]);

  useEffect(() => {
    setStatusMenuOpen(false);
  }, [statusOptions]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const handleClickOutside = (event) => {
      if (!statusMenuRef.current) return;
      if (!statusMenuRef.current.contains(event.target)) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusMenuOpen]);

  const handleAddStatusTag = useCallback(() => {
    const trimmed = (statusTagInput || '').trim();
    if (!trimmed) return;
    const created = typeof onCreateStatusTag === 'function' ? onCreateStatusTag(trimmed) : trimmed;
    if (!created) return;
    setNewAnimal(a => ({ ...a, status: created }));
    setStatusTagInput('');
  }, [statusTagInput, onCreateStatusTag, setNewAnimal]);

  const handleSelectStatus = useCallback((tag) => {
    setNewAnimal(a => ({ ...a, status: tag }));
    setStatusMenuOpen(false);
  }, [setNewAnimal]);

  const handleClearStatus = useCallback(() => {
    setNewAnimal(a => ({ ...a, status: '' }));
    setStatusMenuOpen(false);
  }, [setNewAnimal]);

  const handleDeleteStatus = useCallback((tag) => {
    if (typeof onDeleteStatusTag === 'function') {
      onDeleteStatusTag(tag);
    }
    setStatusMenuOpen(false);
    setNewAnimal(a => {
      if (!a) return a;
      const current = (a.status || '').trim();
      if (current.toLowerCase() === tag.toLowerCase()) {
        return { ...a, status: '' };
      }
      return a;
    });
  }, [onDeleteStatusTag, setNewAnimal]);

  const handleNewAnimalNameChange = useCallback((event) => {
    const value = event.target.value;
    setNewAnimal((previous) => ({
      ...(previous || {}),
      name: value,
    }));
  }, [setNewAnimal]);

  const handleNewAnimalIdChange = useCallback((event) => {
    const value = event.target.value;
    setNewAnimal((previous) => ({
      ...(previous || {}),
      id: value,
      autoId: false,
    }));
  }, [setNewAnimal]);

  const handleNewAnimalSexChange = useCallback((event) => {
    const value = event.target.value;
    setNewAnimal((previous) => ({
      ...(previous || {}),
      sex: value,
    }));
  }, [setNewAnimal]);

  const noTagText = t("snakeEdit.noTag", { defaultValue: "No tag" });
  const resolveStatusLabel = useCallback((value) => {
    if (!value) return noTagText;
    const key = getStatusTagTranslationKey(value);
    return key ? t(key) : value;
  }, [noTagText, t]);

  return (
    <div className="p-4">
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm max-h-[68vh] overflow-auto">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium">{t('ui.animals.addAnimal.quickAdd', { defaultValue: 'Quick Add / Free Text' })}</label>
          <textarea
            rows={4}
            className="mt-1 w-full border rounded-xl px-2 py-2 text-sm"
            value={quickAddText}
            onChange={e => setQuickAddText(e.target.value)}
            placeholder={t('ui.animals.addAnimal.quickAddPlaceholder', { defaultValue: 'Paste a full line like: MS-24-033 0.1 pastel clown het pied 620g born 2024 breeder John Doe eating rats weekly' })}
          />
          <div className="mt-2">
            <button
              type="button"
              className={cx('px-3 py-2 rounded-xl text-sm border', quickAddText.trim() ? primaryBtnClass(theme, true) : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed')}
              onClick={handleQuickAddUpdateFields}
              disabled={!quickAddText.trim()}
            >
              {t('ui.animals.addAnimal.updateFields', { defaultValue: 'Update Fields' })}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium">{t("ui.animals.addAnimal.name", { defaultValue: "Name" })}</label>
          <input
            className="mt-1 w-full border rounded-xl px-2 py-1 text-sm"
            value={(newAnimal && newAnimal.name) || ''}
            onChange={handleNewAnimalNameChange}
            placeholder={t("ui.animals.addAnimal.exampleName", { defaultValue: "e.g., Athena" })}
          />
        </div>

        <div>
          <label className="text-xs font-medium">{t("ui.animals.addAnimal.id", { defaultValue: "ID" })}</label>
          <input
            className="mt-1 w-full border rounded-xl px-2 py-1 text-sm font-mono"
            value={(newAnimal && newAnimal.id) || ''}
            onChange={handleNewAnimalIdChange}
            placeholder="Optional: custom ID (e.g., 25Ath-2)"
          />
          <div className="mt-1 text-[11px] text-neutral-500">
            {t("ui.animals.addAnimal.idHelp", {
              defaultValue: "If you leave this blank an ID will be generated. If the ID you enter already exists a suffix will be appended to make it unique.",
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium">{t("ui.animals.addAnimal.sex", { defaultValue: "Sex" })}</label>
          <select
            className="mt-1 w-full border rounded-xl px-2 py-1 bg-white text-sm"
            value={(newAnimal && newAnimal.sex) || 'F'}
            onChange={handleNewAnimalSexChange}
          >
            <option value="F">{t("ui.animals.addAnimal.female", { defaultValue: "Female" })}</option>
            <option value="M">{t("ui.animals.addAnimal.male", { defaultValue: "Male" })}</option>
            <option value="U">{t("ui.animals.addAnimal.unknown", { defaultValue: "Unknown" })}</option>
          </select>
        </div>

        <div ref={statusMenuRef} className="relative">
              <label className="text-xs font-medium">{t("ui.animals.addAnimal.tag", { defaultValue: "Tag" })}</label>
              <button
                type="button"
                className="status-tag-neutral-button mt-1 w-full border rounded-xl px-2 py-1 text-sm bg-white text-left flex items-center justify-between"
                onClick={() => setStatusMenuOpen(open => !open)}
              >
                <span>{(newAnimal.status || '').trim() ? resolveStatusLabel(newAnimal.status) : noTagText}</span>
                <span className="text-[10px] text-neutral-500">v</span>
              </button>
              {statusMenuOpen && (
                <div className="absolute z-40 mt-1 w-full rounded-xl border border-neutral-200 bg-white shadow-lg">
                  <button
                    type="button"
                    className="status-tag-menu-button w-full px-3 py-2 text-left text-sm hover:bg-neutral-100"
                    onClick={handleClearStatus}
                  >
                    {noTagText}
                  </button>
                  <div className="border-t border-neutral-100" />
                  {statusOptions.length ? (
                    statusOptions.map(option => (
                      <div key={option} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-50">
                        <button
                          type="button"
                          className="status-tag-menu-button flex-1 text-left"
                          onClick={() => handleSelectStatus(option)}
                        >
                          {resolveStatusLabel(option)}
                        </button>
                        <button
                          type="button"
                          className="status-tag-menu-button ml-3 text-sm font-semibold text-rose-500 hover:text-rose-600"
                          onClick={() => handleDeleteStatus(option)}
                          title="Delete tag"
                        >
                          -
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-neutral-400">{t("snakeEdit.noTagsYet", { defaultValue: "No tags available yet." })}</div>
                  )}
                </div>
              )}
              <div className="mt-2 grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  className="w-full border rounded-lg px-2 py-1 text-sm"
                  value={statusTagInput}
                  onChange={e => setStatusTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddStatusTag(); } }}
                  placeholder={t("ui.animals.addAnimal.createNewTag", { defaultValue: "Create new tag" })}
                />
                <button
                  type="button"
                  className={cx('status-tag-neutral-button px-2.5 py-1 rounded-lg text-sm border transition-colors whitespace-nowrap', statusTagInput.trim() ? 'text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed')}
                  onClick={handleAddStatusTag}
                  disabled={!statusTagInput.trim()}
                >
                  {t("ui.animals.addAnimal.addTag", { defaultValue: "Add tag" })}
                </button>
              </div>
              {Array.isArray(statusOptions) && statusOptions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {statusOptions.map(tag => {
                    const isCustom = customTagLookup.has(tag.toLowerCase());
                    return (
                      <span
                        key={tag}
                        className={cx(
                          'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]',
                          isCustom ? 'border border-neutral-200 bg-neutral-50 text-neutral-600' : 'border border-neutral-100 bg-white text-neutral-500'
                        )}
                      >
                        <span>{resolveStatusLabel(tag)}</span>
                        {typeof onDeleteStatusTag === 'function' && (
                          <button
                            type="button"
                            className="h-4 w-4 rounded-full border border-neutral-300 text-[10px] leading-[10px] text-neutral-500 hover:border-rose-400 hover:text-rose-500"
                            title="Delete tag"
                            onClick={() => onDeleteStatusTag(tag)}
                          >
                            x
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="mt-1 text-[11px] text-neutral-500">{t("ui.animals.addAnimal.tagHelp", { defaultValue: "Tags let you group animals for availability. Removing a tag clears it from any animals using it." })}</div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium">{t("ui.animals.addAnimal.genetics", { defaultValue: "Genetics (morphs & hets)" })}</label>
              <textarea
                rows={3}
                className="mt-1 w-full border rounded-xl px-2 py-2 text-sm"
                value={newAnimal.morphHetInput || ''}
                onChange={async e=>{
                  const value = e.target.value;
                  const resolvedText = typeof onResolveLeucisticText === 'function'
                    ? await onResolveLeucisticText(value, 'Add Animal genetics')
                    : value;
                  const { morphs, hets } = splitMorphHetInput(resolvedText);
                  setNewAnimal(a=>({ ...a, morphHetInput: resolvedText, morphs, hets }));
                }}
                placeholder={"Clown\nPastel\nHet Hypo"}
              />
              <div className="mt-1 text-[11px] text-neutral-500">
                {t("ui.animals.addAnimal.geneticsHelp", { defaultValue: "List each trait on its own line (commas, slashes, or percentages are still supported when pasting)." })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">{t("ui.animals.addAnimal.weight", { defaultValue: "Weight (g)" })}</label>
              <input type="number" className="mt-1 w-full border rounded-xl px-2 py-1 text-sm" value={newAnimal.weight} onChange={e=>setNewAnimal(a=>({...a,weight:e.target.value}))} placeholder="0" />
            </div>
            {isSnakeTaggedForSell(newAnimal) && (
              <div>
                <label className="text-xs font-medium">{t("ui.animals.addAnimal.price", { defaultValue: "Price" })}</label>
                <input
                  type="text"
                  className="mt-1 w-full border rounded-xl px-2 py-1 text-sm"
                  value={newAnimal.price || ''}
                  onChange={e=>setNewAnimal(a=>({...a,price:e.target.value}))}
                  placeholder={t("ui.animals.addAnimal.pricePlaceholder", { defaultValue: "e.g., 450" })}
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium">{t("ui.animals.addAnimal.year", { defaultValue: "Year" })}</label>
              <input type="number" className="mt-1 w-full border rounded-xl px-2 py-1 text-sm" value={newAnimal.year} onChange={e=>setNewAnimal(a=>({...a,year:e.target.value}))} placeholder="2025" />
            </div>
            <div>
              <label className="text-xs font-medium">{t("snakeEdit.birthDate", { defaultValue: "Birth date" })}</label>
              <input
                type="text"
                className="mt-1 w-full border rounded-xl px-2 py-1 text-sm"
                value={newAnimal.birthDate || ''}
                placeholder="YYYY-MM-DD, YYYY-MM, or YYYY"
                onChange={e => {
                  const raw = e.target.value;
                  setNewAnimal(prev => {
                    const normalized = raw ? normalizeBirthDateValue(raw) || raw : '';
                    const birthYear = extractYearFromDateString(normalized || raw);
                    const next = { ...prev, birthDate: normalized };
                    if (birthYear) {
                      next.year = String(birthYear);
                    } else if (!normalized) {
                      next.birthDate = '';
                    }
                    return next;
                  });
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium">{t("snakeEdit.group", { defaultValue: "Group" })}</label>
              {groups.length ? (
                <select
                  className="mt-1 w-full border rounded-xl px-2 py-2 text-sm bg-white"
                  value={selectedGroup}
                  onChange={e => {
                    const value = e.target.value.trim();
                    setNewAnimal(a => ({
                      ...a,
                      groups: value ? [value] : [],
                    }));
                  }}
                >
                  <option value="">{t("snakeEdit.noGroup", { defaultValue: "No group" })}</option>
                  {groups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              ) : (
                <div className="mt-1 text-xs text-neutral-500">{t("groups.noneAdd", { defaultValue: "No groups yet. Add one below." })}</div>
              )}
              <div className="mt-3 border border-dashed border-neutral-200 rounded-xl p-3 bg-white">
                <AddGroupInline onAdd={(g)=>{
                  if (!g) return;
                  setGroups(prev => prev.includes(g) ? prev : [...prev, g]);
                  setNewAnimal(a => ({ ...a, groups: [g] }));
                }} />
              </div>
            </div>
      </div>

      <div className="p-4 border-t flex items-center justify-between">
        <div className="text-xs text-neutral-500">{t("ui.animals.addAnimal.localData", { defaultValue: "This animal is saved in your planner on this device." })}</div>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded-xl text-sm border" onClick={onCancel}>{t("common.cancel")}</button>
          <button className={cx('px-3 py-2 rounded-xl text-sm text-white', canSubmit ? primaryBtnClass(theme,true) : primaryBtnClass(theme,false))} disabled={!canSubmit} onClick={onAdd}>
            {t("ui.animals.addAnimal.button")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BreedingPlannerApp() {
  const { t } = useTranslation();
  const { resolvedAppearance, effectiveThemeMode } = useAppearance();
  const { snapshot: sharedBackendSnapshot } = useSharedBackend();
  const theme = effectiveThemeMode;
  const appRootStyle = useMemo(() => ({
    backgroundColor: resolvedAppearance?.colors?.background || '#f6f7f9',
    color: resolvedAppearance?.colors?.text || '#0f172a',
  }), [resolvedAppearance]);
  // logs helpers are defined at module scope (updateLog, LogsEditor)
  // component state
  const [snakes, setSnakes] = useState(() => {
    // In Electron the bridge load-data effect (below) will overwrite this.
    // In browser mode there is no bridge, so seed from localStorage if available.
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (bridge?.loadData) return createFreshSnakes();
    const stored = loadStoredJson(STORAGE_KEYS.snakes, null);
    if (Array.isArray(stored) && stored.length > 0) {
      return stored.map(sanitizeSnakeRecord).filter(Boolean);
    }
    return createFreshSnakes();
  });
  const [pairings, setPairings] = useState(() => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (bridge?.loadData) return createFreshPairings();
    return loadStoredPairingsForBrowser();
  });
  const [tab, setTab] = useState('animals');
  const [pairingsView, setPairingsView] = useState('dashboard');
  const [completedYearFilter, setCompletedYearFilter] = useState('All');
  const [animalView, setAnimalView] = useState('all');
  const [animalLayout, setAnimalLayout] = useState(() => {
    if (typeof window === 'undefined') return 'cards';
    try {
      const stored = window.localStorage.getItem(STORAGE_KEYS.animalLayout);
      return stored === 'list' ? 'list' : 'cards';
    } catch (err) {
      console.warn('Failed to restore animal layout', err);
      return 'cards';
    }
  });
  const [query, setQuery] = useState('');
  const tag = 'all';
  const [groupFilter, setGroupFilter] = useState('all');
  const [showGroups, setShowGroups] = useState(() => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (bridge?.loadData) return [];
    const stored = loadStoredJson(STORAGE_KEYS.showGroups, []);
    return Array.isArray(stored) ? stored : [];
  });
  const [hiddenGroups, setHiddenGroups] = useState(() => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (bridge?.loadData) return [];
    const stored = loadStoredJson(STORAGE_KEYS.hiddenGroups, []);
    return Array.isArray(stored) ? stored : [];
  });
  const [selectedStatusTags, setSelectedStatusTags] = useState([]);
  const [customStatusTags, setCustomStatusTags] = useState(() => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (bridge?.loadData) return [];
    const stored = loadStoredJson(STORAGE_KEYS.customStatusTags, []);
    return Array.isArray(stored) ? stored : [];
  });
  const [removedStatusTags, setRemovedStatusTags] = useState(() => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (bridge?.loadData) return [];
    const stored = loadStoredJson(STORAGE_KEYS.removedStatusTags, []);
    return Array.isArray(stored) ? stored : [];
  });
  const [groups, setGroups] = useState(() => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (bridge?.loadData) return [...DEFAULT_GROUPS];
    const stored = loadStoredJson(STORAGE_KEYS.groups, null);
    if (Array.isArray(stored) && stored.length > 0) {
      return Array.from(new Set(stored.map(group => String(group || '').trim()).filter(Boolean)));
    }
    return [...DEFAULT_GROUPS];
  });
  const initialSpacesData = useMemo(() => normalizeSpacesDataset(loadStoredJson(STORAGE_KEYS.spaces, null)), []);
  const [spacesState, setSpacesState] = useState(initialSpacesData);
  const rooms = Array.isArray(spacesState?.rooms) ? spacesState.rooms : [];
  const heatRacks = Array.isArray(spacesState?.heatRacks) ? spacesState.heatRacks : [];
  const terrariums = Array.isArray(spacesState?.terrariums) ? spacesState.terrariums : [];
  const [breederInfo, setBreederInfo] = useState(() => {
    const stored = loadStoredJson(STORAGE_KEYS.breeder, null);
    return normalizeBreederInfo(stored);
  });
  const breederLogoBackground = useMemo(() => {
    const logo = typeof breederInfo?.logoUrl === 'string' && breederInfo.logoUrl.trim()
      ? breederInfo.logoUrl.trim()
      : '/app-icons/icon_512x512.png';
    return `url("${logo.replace(/["\\\n\r]/g, '')}")`;
  }, [breederInfo?.logoUrl]);
  const [morphAliases, setMorphAliases] = useState(() => {
    const stored = loadStoredJson(STORAGE_KEYS.morphAliases, null);
    const normalized = normalizeMorphAliasDatabase(stored);
    return normalized.length ? normalized : [...DEFAULT_MORPH_ALIASES];
  });
  const [geneAliases, setGeneAliases] = useState(() => {
    const stored = loadStoredJson(STORAGE_KEYS.geneAliases, null);
    return mergeGeneAliasRows(stored);
  });
  const [lastLeucisticType, setLastLeucisticType] = useState(() => {
    const stored = loadStoredJson(STORAGE_KEYS.leucisticType, 'bel');
    return stored === 'blackEye' ? 'blackEye' : 'bel';
  });
  const [leucisticModalState, setLeucisticModalState] = useState(null);
  const [leucisticTypeChoice, setLeucisticTypeChoice] = useState('bel');
  const [leucisticBelGene1, setLeucisticBelGene1] = useState(LEUCISTIC_BEL_GENE_OPTIONS[0]);
  const [leucisticBelGene2, setLeucisticBelGene2] = useState(LEUCISTIC_BEL_GENE_OPTIONS[1]);
  const [leucisticBlackGene, setLeucisticBlackGene] = useState(LEUCISTIC_BLACK_EYE_GENE_OPTIONS[0]);
  const leucisticResolverRef = useRef(null);
  const [backupSettings, setBackupSettings] = useState(() => normalizeBackupSettings(loadStoredJson(STORAGE_KEYS.backupSettings, null)));
  const [autoBackupSnapshot, setAutoBackupSnapshot] = useState(() => normalizeBackupSnapshot(loadStoredJson(STORAGE_KEYS.backupSnapshot, null)));
  const [backupVault, setBackupVault] = useState(() => normalizeBackupVault(loadStoredJson(STORAGE_KEYS.backupVault, [])));
  const quickAddAvailableGenetics = useMemo(
    () => buildQuickAddGeneticsSource(snakes, morphAliases, geneAliases),
    [snakes, morphAliases, geneAliases]
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleLabSnakeGeneticsUpdated = (event) => {
      const detail = event?.detail || {};
      const rawSnake = detail.snake;
      const snakeId = String(detail.snakeId || rawSnake?.id || '').trim();
      if (!snakeId || !rawSnake || typeof rawSnake !== 'object') return;

      const sanitized = sanitizeSnakeRecord(rawSnake);
      if (!sanitized) return;

      setSnakes(prev => {
        let changed = false;
        const next = prev.map(snake => {
          if (!snake || snake.id !== snakeId) return snake;
          changed = true;
          return sanitized;
        });
        return changed ? next : prev;
      });
    };

    window.addEventListener('lab:snake-genetics-updated', handleLabSnakeGeneticsUpdated);
    return () => window.removeEventListener('lab:snake-genetics-updated', handleLabSnakeGeneticsUpdated);
  }, []);
  const [animalExportFields, setAnimalExportFields] = useState(() => [...DEFAULT_ANIMAL_EXPORT_FIELDS]);
  const [pairingExportFields, setPairingExportFields] = useState(() => [...DEFAULT_PAIRING_EXPORT_FIELDS]);
  const [exportFeedback, setExportFeedback] = useState(null);
  const [listExportFeedback, setListExportFeedback] = useState(null);
  const [appDialog, setAppDialog] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAnimal, setNewAnimal] = useState(createEmptyNewAnimalDraft);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [testOrderSnake, setTestOrderSnake] = useState(null);
  const [panelRefreshToken, setPanelRefreshToken] = useState(0);
  const [returnToGroupsAfterEdit, setReturnToGroupsAfterEdit] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [pairingGuard, setPairingGuard] = useState(null);
  const [electronDataReady, setElectronDataReady] = useState(false);
  const backendPlannerSyncRef = useRef({
    status: 'idle',
    seeded: false,
    lastSavedSignature: '',
  });
  const latestPlannerSnapshotRef = useRef({ snakes: [], pairings: [] });
  const sharedBreederDataReady = sharedBackendSnapshot?.state === 'connected'
    && sharedBackendSnapshot?.authStatus === 'authorized';
  const handleAnimalViewTabChange = useCallback((nextView) => {
    if (!nextView || nextView === animalView) return;
    setAnimalView(nextView);
  }, [animalView]);

  const handleAnimalLayoutChange = useCallback((nextLayout) => {
    if (!nextLayout || nextLayout === animalLayout) return;
    setAnimalLayout(nextLayout);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.animalLayout, nextLayout);
    } catch (err) {
      console.warn('Failed to persist animal layout', err);
    }
  }, [animalLayout]);

  const [showPairingModal, setShowPairingModal] = useState(false);
  const [eggBoxModal, setEggBoxModal] = useState(null);
  const [draft, setDraft] = useState({
    maleId: "",
    femaleId: "",
    goals: [],
    notes: "",
    startDate: localYMD(new Date())
  });
  const [maleSearchQuery, setMaleSearchQuery] = useState("");
  const [femaleSearchQuery, setFemaleSearchQuery] = useState("");
  const [pairingSearchTarget, setPairingSearchTarget] = useState(null);
  const maleSearchInputRef = useRef(null);
  const femaleSearchInputRef = useRef(null);
  const [focusedPairingId, setFocusedPairingId] = useState(null);
  const [pairingsSearchQuery, setPairingsSearchQuery] = useState('');

  const generateIdFromWizardRules = useCallback((draft = {}) => {
    const sex = ensureSex(draft?.sex, 'F');
    const parsedMorphHet = splitMorphHetInput(draft?.morphHetInput || '');
    const morphList = Array.isArray(draft?.morphs)
      ? draft.morphs.map(entry => String(entry).trim()).filter(Boolean)
      : parsedMorphHet.morphs;
    const hetList = Array.isArray(draft?.hets)
      ? draft.hets.map(entry => String(entry).trim()).filter(Boolean)
      : parsedMorphHet.hets;
    const normalizedBirthDate = normalizeBirthDateValue(draft?.birthDate || null);
    const birthYear = extractYearFromDateString(normalizedBirthDate);
    const numericYear = Number(draft?.year);
    const fallbackYear = Number.isFinite(numericYear) && numericYear > 0
      ? numericYear
      : new Date().getFullYear();
    const derivedYear = birthYear ?? fallbackYear;

    return generateSnakeId(
      draft?.name,
      derivedYear,
      snakes,
      null,
      {
        idConfig: breederInfo?.idGenerator,
        sex,
        morphs: morphList,
        hets: hetList,
        birthYear,
      }
    );
  }, [breederInfo, snakes]);

  const openAppDialog = useCallback((config = {}) => new Promise(resolve => {
    const normalizedMessage = typeof config.message === 'string'
      ? config.message
      : String(config.message ?? '');
    setAppDialog({
      type: config.type || 'alert',
      title: typeof config.title === 'string' ? config.title : null,
      message: normalizedMessage,
      confirmLabel: config.confirmLabel || null,
      cancelLabel: config.cancelLabel || null,
      inputValue: config.inputValue ?? '',
      placeholder: config.placeholder || '',
      tone: config.tone || 'info',
      dismissible: config.dismissible !== false,
      resolve,
    });
  }), []);

  const handleAppDialogConfirm = useCallback(() => {
    setAppDialog(prev => {
      if (!prev) return prev;
      const result = prev.type === 'prompt' ? prev.inputValue : true;
      if (typeof prev.resolve === 'function') prev.resolve(result);
      return null;
    });
  }, []);

  const handleAppDialogCancel = useCallback(() => {
    setAppDialog(prev => {
      if (!prev) return prev;
      const result = prev.type === 'prompt' ? null : false;
      if (typeof prev.resolve === 'function') prev.resolve(result);
      return null;
    });
  }, []);

  const handleAppDialogBackdrop = useCallback(() => {
    setAppDialog(prev => {
      if (!prev || prev.dismissible === false) return prev;
      const shouldConfirm = prev.type === 'alert' && !prev.cancelLabel;
      const result = prev.type === 'prompt'
        ? (shouldConfirm ? prev.inputValue : null)
        : (shouldConfirm ? true : false);
      if (typeof prev.resolve === 'function') prev.resolve(result);
      return null;
    });
  }, []);

  const handleAppDialogInputChange = useCallback((event) => {
    const value = event?.target?.value ?? '';
    setAppDialog(prev => (prev ? { ...prev, inputValue: value } : prev));
  }, []);

  const showAppAlert = useCallback((message, options = {}) => openAppDialog({
    type: 'alert',
    message,
    title: options.title || null,
    confirmLabel: options.confirmLabel || t('common.ok', { defaultValue: 'OK' }),
    tone: options.tone || 'info',
  }), [openAppDialog, t]);

  const showAppConfirm = useCallback((message, options = {}) => openAppDialog({
    type: 'confirm',
    message,
    title: options.title || null,
    confirmLabel: options.confirmLabel || t('common.confirm', { defaultValue: 'Confirm' }),
    cancelLabel: options.cancelLabel || t('common.cancel', { defaultValue: 'Cancel' }),
    tone: options.tone || 'info',
  }), [openAppDialog, t]);

  const showAppPrompt = useCallback((message, options = {}) => openAppDialog({
    type: 'prompt',
    message,
    title: options.title || null,
    confirmLabel: options.confirmLabel || t('common.save', { defaultValue: 'Save' }),
    cancelLabel: options.cancelLabel || t('common.cancel', { defaultValue: 'Cancel' }),
    inputValue: options.defaultValue || '',
    placeholder: options.placeholder || '',
    tone: options.tone || 'info',
  }), [openAppDialog, t]);

  const openLeucisticSelector = useCallback((sourceLabel = 'Leucistic') => {
    return new Promise((resolve) => {
      leucisticResolverRef.current = resolve;
      const defaultType = lastLeucisticType === 'blackEye' ? 'blackEye' : 'bel';
      setLeucisticTypeChoice(defaultType);
      setLeucisticBelGene1(LEUCISTIC_BEL_GENE_OPTIONS[0]);
      setLeucisticBelGene2(LEUCISTIC_BEL_GENE_OPTIONS[1]);
      setLeucisticBlackGene(LEUCISTIC_BLACK_EYE_GENE_OPTIONS[0]);
      setLeucisticModalState({ sourceLabel });
    });
  }, [lastLeucisticType]);

  const cancelLeucisticSelector = useCallback(() => {
    if (leucisticResolverRef.current) {
      leucisticResolverRef.current({ cancelled: true, genes: [] });
      leucisticResolverRef.current = null;
    }
    setLeucisticModalState(null);
  }, []);

  const confirmLeucisticSelector = useCallback(() => {
    let genes = [];
    if (leucisticTypeChoice === 'blackEye') {
      const base = String(leucisticBlackGene || '').trim();
      if (base) genes = [`Super ${base}`];
    } else {
      const gene1 = String(leucisticBelGene1 || '').trim();
      const gene2 = String(leucisticBelGene2 || '').trim();
      if (gene1 && gene2 && gene1.toLowerCase() === gene2.toLowerCase()) return;
      if (gene1 && gene2) genes = [gene1, gene2];
    }
    if (!genes.length) return;
    setLastLeucisticType(leucisticTypeChoice === 'blackEye' ? 'blackEye' : 'bel');
    if (leucisticResolverRef.current) {
      leucisticResolverRef.current({ cancelled: false, genes });
      leucisticResolverRef.current = null;
    }
    setLeucisticModalState(null);
  }, [leucisticTypeChoice, leucisticBlackGene, leucisticBelGene1, leucisticBelGene2]);

  const resolveLeucisticInText = useCallback(async (rawText, sourceLabel = 'Leucistic') => {
    const text = String(rawText || '');
    if (!hasLeucisticTriggerText(text)) return text;
    const selection = await openLeucisticSelector(sourceLabel);
    if (!selection || selection.cancelled || !Array.isArray(selection.genes) || !selection.genes.length) {
      return stripLeucisticTriggerText(text);
    }
    const replacement = selection.genes.join(', ');
    return replaceLeucisticTriggerText(text, replacement);
  }, [openLeucisticSelector]);

  const resolveLeucisticInMorphHetLists = useCallback(async (morphs = [], hets = [], sourceLabel = 'Leucistic') => {
    const raw = formatMorphHetForInput(morphs, hets);
    const resolved = await resolveLeucisticInText(raw, sourceLabel);
    return splitMorphHetInput(resolved);
  }, [resolveLeucisticInText]);

  const appDialogOverlay = useMemo(() => {
    if (!appDialog) return null;
    const brandName = (breederInfo?.businessName && breederInfo.businessName.trim())
      ? breederInfo.businessName.trim()
      : (breederInfo?.name && breederInfo.name.trim()) || t('app.title');
    const brandCaption = breederInfo?.businessName && breederInfo.name
      ? breederInfo.name
      : t('app.title');
    const fallbackInitials = brandName
      .split(/\s+/)
      .map(part => part?.[0]?.toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join('') || 'BP';
    const confirmLabel = appDialog.confirmLabel || t('common.ok', { defaultValue: 'OK' });
    if (typeof document === 'undefined') return null;
    return createPortal((
      <div
        className={cx('fixed inset-0 flex items-center justify-center p-4 z-[10030]', overlayClass(theme))}
        onClick={handleAppDialogBackdrop}
      >
        <div
          className="relative z-[10031] bg-white w-full max-w-sm rounded-2xl shadow-2xl border p-5 space-y-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            {breederInfo?.logoUrl ? (
              <img
                src={breederInfo.logoUrl}
                alt={brandName}
                className="w-12 h-12 rounded-full object-cover border"
              />
            ) : (
              <div className="w-12 h-12 rounded-full border bg-neutral-50 flex items-center justify-center text-sm font-semibold text-neutral-600">
                {fallbackInitials}
              </div>
            )}
            <div>
              <div className="text-base font-semibold text-neutral-900">{brandName}</div>
              <div className="text-xs text-neutral-500">{brandCaption}</div>
            </div>
          </div>
          {appDialog.title && (
            <div className="text-sm font-semibold text-neutral-800">{appDialog.title}</div>
          )}
          <div className="text-sm text-neutral-700 whitespace-pre-line">
            {appDialog.message}
          </div>
          {appDialog.type === 'prompt' && (
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={appDialog.inputValue}
              onChange={handleAppDialogInputChange}
              placeholder={appDialog.placeholder || ''}
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            {appDialog.cancelLabel && (
              <button
                type="button"
                className="px-3 py-2 rounded-xl text-sm border"
                onClick={handleAppDialogCancel}
              >
                {appDialog.cancelLabel}
              </button>
            )}
            <button
              type="button"
              className={cx('px-3 py-2 rounded-xl text-sm text-white', primaryBtnClass(theme, true))}
              onClick={handleAppDialogConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    ), document.body);
  }, [appDialog, breederInfo, handleAppDialogBackdrop, handleAppDialogCancel, handleAppDialogConfirm, handleAppDialogInputChange, theme, t]);

  useEffect(() => {
    if (!showPairingModal) return;
    if (pairingSearchTarget === 'male' && maleSearchInputRef.current) {
      maleSearchInputRef.current.focus();
    } else if (pairingSearchTarget === 'female' && femaleSearchInputRef.current) {
      femaleSearchInputRef.current.focus();
    }
  }, [showPairingModal, pairingSearchTarget]);

  useEffect(() => {
    if (showPairingModal) return;
    setPairingSearchTarget(null);
    setMaleSearchQuery("");
    setFemaleSearchQuery("");
  }, [showPairingModal]);
  const updateSpacesState = useCallback((updater) => {
    setSpacesState(prev => {
      const base = {
        rooms: Array.isArray(prev?.rooms) ? prev.rooms : [],
        heatRacks: Array.isArray(prev?.heatRacks) ? prev.heatRacks : [],
        terrariums: Array.isArray(prev?.terrariums) ? prev.terrariums : [],
      };
      const draft = typeof updater === 'function' ? updater(base) : updater;
      const nextRooms = Array.isArray(draft?.rooms) ? draft.rooms : base.rooms;
      const nextHeatRacks = Array.isArray(draft?.heatRacks) ? draft.heatRacks : base.heatRacks;
      const nextTerrariums = Array.isArray(draft?.terrariums) ? draft.terrariums : base.terrariums;
      return {
        rooms: syncRoomAssetLinks(nextRooms, nextHeatRacks, nextTerrariums),
        heatRacks: nextHeatRacks,
        terrariums: nextTerrariums,
      };
    });
  }, []);

  useEffect(() => {
    latestPlannerSnapshotRef.current = { snakes, pairings };
  }, [snakes, pairings]);

  useEffect(() => {
    if (!electronDataReady || !sharedBreederDataReady) return;
    if (backendPlannerSyncRef.current.status !== 'idle') return;

    let cancelled = false;
    backendPlannerSyncRef.current.status = 'loading';

    fetchBreederSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        const backendSnakes = Array.isArray(snapshot?.animals)
          ? snapshot.animals.map(sanitizeSnakeRecord).filter(Boolean)
          : [];
        const backendPairings = Array.isArray(snapshot?.pairings)
          ? snapshot.pairings.map(sanitizePairingRecord).filter(Boolean)
          : [];

        if (backendSnakes.length || backendPairings.length) {
          setSnakes(backendSnakes);
          setPairings(backendPairings);
          backendPlannerSyncRef.current.seeded = true;
          backendPlannerSyncRef.current.status = 'ready';
          backendPlannerSyncRef.current.lastSavedSignature = JSON.stringify({
            snakes: backendSnakes,
            pairings: backendPairings,
          });
          return;
        }

        const localSnapshot = latestPlannerSnapshotRef.current;
        const hasLocalData = Array.isArray(localSnapshot.snakes) && localSnapshot.snakes.length > 0
          || Array.isArray(localSnapshot.pairings) && localSnapshot.pairings.length > 0;
        if (!hasLocalData) {
          backendPlannerSyncRef.current.seeded = true;
          backendPlannerSyncRef.current.status = 'ready';
          backendPlannerSyncRef.current.lastSavedSignature = JSON.stringify({ snakes: [], pairings: [] });
          return;
        }

        saveBreederSnapshot({
          animals: localSnapshot.snakes,
          pairings: localSnapshot.pairings,
          clutches: [],
        })
          .then(() => {
            if (cancelled) return;
            backendPlannerSyncRef.current.seeded = true;
            backendPlannerSyncRef.current.status = 'ready';
            backendPlannerSyncRef.current.lastSavedSignature = JSON.stringify(localSnapshot);
          })
          .catch((error) => {
            if (!cancelled) {
              backendPlannerSyncRef.current.status = 'idle';
              console.warn('Failed to seed shared breeder snapshot', error);
            }
          });
      })
      .catch((error) => {
        if (!cancelled) {
          backendPlannerSyncRef.current.status = 'idle';
          console.warn('Failed to load shared breeder snapshot', error);
        }
      });

    return () => {
      cancelled = true;
      if (!backendPlannerSyncRef.current.seeded && backendPlannerSyncRef.current.status === 'loading') {
        backendPlannerSyncRef.current.status = 'idle';
      }
    };
  }, [electronDataReady, sharedBreederDataReady]);

  useEffect(() => {
    let cancelled = false;
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!bridge?.loadData) {
      setElectronDataReady(true);
      return () => {
        cancelled = true;
      };
    }

    bridge
      .loadData()
      .then((payload) => {
        if (cancelled || !payload || typeof payload !== 'object') return;

        if (Array.isArray(payload.snakes)) {
          const sanitized = payload.snakes.map(sanitizeSnakeRecord).filter(Boolean);
          setSnakes(sanitized);
        }
        {
          const backupPairings = [
            payload.autoBackupSnapshot?.payload,
            ...(Array.isArray(payload.backupVault) ? payload.backupVault.map(entry => entry?.payload) : []),
          ]
            .map(candidate => Array.isArray(candidate?.pairings) ? candidate.pairings : [])
            .find(list => list.length > 0) || [];
          const rawPairings = Array.isArray(payload.pairings) && payload.pairings.length > 0
            ? payload.pairings
            : backupPairings;
          const sanitizedPairings = rawPairings.map(sanitizePairingRecord).filter(Boolean);
          setPairings(sanitizedPairings);
        }
        if (Array.isArray(payload.groups)) {
          setGroups(payload.groups);
        }
        const hasStructuredSpaces = Array.isArray(payload.rooms) || Array.isArray(payload.heatRacks) || Array.isArray(payload.terrariums);
        if (hasStructuredSpaces || Array.isArray(payload.spaces)) {
          const normalizedSpaces = hasStructuredSpaces
            ? normalizeSpacesDataset({
              rooms: Array.isArray(payload.rooms) ? payload.rooms : [],
              heatRacks: Array.isArray(payload.heatRacks) ? payload.heatRacks : [],
              terrariums: Array.isArray(payload.terrariums) ? payload.terrariums : [],
            })
            : normalizeSpacesDataset(payload.spaces || []);
          setSpacesState(normalizedSpaces);
        }
        if (Array.isArray(payload.showGroups)) {
          setShowGroups(payload.showGroups);
        }
        if (Array.isArray(payload.hiddenGroups)) {
          setHiddenGroups(payload.hiddenGroups);
        }
        if (Array.isArray(payload.customStatusTags)) {
          setCustomStatusTags(payload.customStatusTags);
        }
        if (Array.isArray(payload.removedStatusTags)) {
          setRemovedStatusTags(payload.removedStatusTags);
        }
        if (payload.breederInfo && typeof payload.breederInfo === 'object') {
          setBreederInfo(normalizeBreederInfo(payload.breederInfo));
        }
        if (Array.isArray(payload.morphAliases)) {
          const normalizedAliases = normalizeMorphAliasDatabase(payload.morphAliases);
          setMorphAliases(normalizedAliases.length ? normalizedAliases : [...DEFAULT_MORPH_ALIASES]);
        }
        if (Array.isArray(payload.geneAliases)) {
          setGeneAliases(mergeGeneAliasRows(payload.geneAliases));
        }
        if (payload.leucisticType === 'blackEye' || payload.leucisticType === 'bel') {
          setLastLeucisticType(payload.leucisticType);
        }
        if (payload.backupSettings && typeof payload.backupSettings === 'object') {
          setBackupSettings(normalizeBackupSettings(payload.backupSettings));
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'autoBackupSnapshot')) {
          if (payload.autoBackupSnapshot && typeof payload.autoBackupSnapshot === 'object') {
            setAutoBackupSnapshot(normalizeBackupSnapshot(payload.autoBackupSnapshot));
          } else {
            setAutoBackupSnapshot(null);
          }
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'backupVault')) {
          const vaultValue = Array.isArray(payload.backupVault) ? payload.backupVault : [];
          setBackupVault(normalizeBackupVault(vaultValue));
        }
        if (payload.lastFeedDefaults && typeof payload.lastFeedDefaults === 'object') {
          setLastFeedDefaults((prev) => ({ ...prev, ...payload.lastFeedDefaults }));
        }
      })
      .catch((error) => {
        console.error('Failed to load persisted Breeding Planner data', error);
      })
      .finally(() => {
        if (!cancelled) setElectronDataReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // edit snake
  const [editSnake, setEditSnake] = useState(null);
  const [editSnakeDraft, setEditSnakeDraft] = useState(null);
  const [editForSalePublishing, setEditForSalePublishing] = useState(false);
  const [editForSalePublishError, setEditForSalePublishError] = useState('');
  const [qrFor, setQrFor] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPairingQrModal, setShowPairingQrModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [passiveScanNotice, setPassiveScanNotice] = useState(null);
  const [pendingDeleteSnake, setPendingDeleteSnake] = useState(null);
  const [hatchWizard, setHatchWizard] = useState(null);
  const [photoGallerySnakeId, setPhotoGallerySnakeId] = useState(null);
  const editCameraInputRef = useRef(null);
  const editUploadInputRef = useRef(null);
  const [editUploadingPhoto, setEditUploadingPhoto] = useState(false);
  const [editStatusTagInput, setEditStatusTagInput] = useState('');
  const [editStatusMenuOpen, setEditStatusMenuOpen] = useState(false);
  const editStatusMenuRef = useRef(null);
  const [tagFilterMenuOpen, setTagFilterMenuOpen] = useState(false);
  const tagFilterMenuRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleLabSnakeEditorRefresh = (event) => {
      const detail = event?.detail || {};
      const rawSnake = detail.snake;
      const snakeId = String(detail.snakeId || rawSnake?.id || '').trim();
      if (!snakeId || !rawSnake || typeof rawSnake !== 'object') return;

      const sanitized = sanitizeSnakeRecord(rawSnake);
      if (!sanitized) return;

      setEditSnake(prev => (prev && prev.id === snakeId ? sanitized : prev));
      setEditSnakeDraft(prev => {
        if (!prev || prev.id !== snakeId) return prev;
        return initSnakeDraft(sanitized);
      });
    };

    window.addEventListener('lab:snake-genetics-updated', handleLabSnakeEditorRefresh);
    return () => window.removeEventListener('lab:snake-genetics-updated', handleLabSnakeEditorRefresh);
  }, []);
  const isAnimalScannerView = tab === 'animals' && animalView !== 'groups';
  const editDraftStatusValue = typeof editSnakeDraft?.status === 'string' ? editSnakeDraft.status : '';
  const statusTagOptions = useMemo(() => {
    const set = new Set(DEFAULT_STATUS_TAGS);
    customStatusTags.forEach(tag => {
      const trimmed = (tag || '').trim();
      if (trimmed) set.add(trimmed);
    });
    snakes.forEach(s => {
      const value = typeof s?.status === 'string' ? s.status.trim() : '';
      if (value) set.add(value);
    });
    const newDraftTag = typeof newAnimal?.status === 'string' ? newAnimal.status.trim() : '';
    if (newDraftTag) set.add(newDraftTag);
    const editTag = typeof editDraftStatusValue === 'string' ? editDraftStatusValue.trim() : '';
    if (editTag) set.add(editTag);
    const removedSet = new Set(removedStatusTags.map(tag => tag.toLowerCase()));
    return Array.from(set)
      .filter(option => !removedSet.has(option.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  }, [customStatusTags, removedStatusTags, snakes, newAnimal.status, editDraftStatusValue]);
  const currentEditStatus = (editDraftStatusValue || '').trim();
  useEffect(() => {
    setEditStatusMenuOpen(false);
    setTagFilterMenuOpen(false);
  }, [statusTagOptions]);

  useEffect(() => {
    if (!editStatusMenuOpen) return;
    const handleClickOutside = (event) => {
      if (!editStatusMenuRef.current) return;
      if (!editStatusMenuRef.current.contains(event.target)) {
        setEditStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editStatusMenuOpen]);

  useEffect(() => {
    if (!tagFilterMenuOpen) return;
    const handleClickOutside = (event) => {
      if (!tagFilterMenuRef.current) return;
      if (!tagFilterMenuRef.current.contains(event.target)) {
        setTagFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tagFilterMenuOpen]);

  useEffect(() => {
    if (!isAnimalScannerView) {
      setPassiveScanNotice(null);
    }
  }, [isAnimalScannerView]);

  useEffect(() => {
    if (!passiveScanNotice) return;
    const timeout = setTimeout(() => setPassiveScanNotice(null), 4000);
    return () => clearTimeout(timeout);
  }, [passiveScanNotice]);

  useEffect(() => {
    if (!listExportFeedback) return;
    const timeout = setTimeout(() => setListExportFeedback(null), 5000);
    return () => clearTimeout(timeout);
  }, [listExportFeedback]);

  const handleCreateStatusTag = useCallback((tag) => {
    const trimmed = (tag || '').trim();
    if (!trimmed) return '';
    const isDefaultTag = DEFAULT_STATUS_TAGS.some(t => t.toLowerCase() === trimmed.toLowerCase());
    setCustomStatusTags(prev => {
      const existsInCustom = prev.some(t => t.toLowerCase() === trimmed.toLowerCase());
      if (isDefaultTag) {
        return existsInCustom ? prev.filter(t => t.toLowerCase() !== trimmed.toLowerCase()) : prev;
      }
      if (existsInCustom) return prev;
      return [...prev, trimmed];
    });
    setRemovedStatusTags(prev => prev.filter(t => t.toLowerCase() !== trimmed.toLowerCase()));
    return trimmed;
  }, [setCustomStatusTags, setRemovedStatusTags]);

  const handleAddEditStatusTag = useCallback(() => {
    const trimmed = (editStatusTagInput || '').trim();
    if (!trimmed) return;
    const created = handleCreateStatusTag(trimmed);
    if (!created) return;
    setEditSnakeDraft(prev => prev ? ({ ...prev, status: created }) : prev);
    setEditStatusTagInput('');
  }, [editStatusTagInput, handleCreateStatusTag]);

  const handleSelectEditStatus = useCallback((tag) => {
    setEditSnakeDraft(prev => (prev ? { ...prev, status: tag } : prev));
    setEditStatusMenuOpen(false);
  }, [setEditSnakeDraft, setEditStatusMenuOpen]);

  const handleClearEditStatus = useCallback(() => {
    setEditSnakeDraft(prev => (prev ? { ...prev, status: '' } : prev));
    setEditStatusMenuOpen(false);
  }, [setEditSnakeDraft, setEditStatusMenuOpen]);

  const handleDeleteStatusTag = useCallback((tag) => {
    const trimmed = (tag || '').trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    setCustomStatusTags(prev => prev.filter(t => t.toLowerCase() !== lower));
    setRemovedStatusTags(prev => prev.some(t => t.toLowerCase() === lower) ? prev : [...prev, trimmed]);
    setSelectedStatusTags(prev => prev.filter(t => t.toLowerCase() !== lower));
    setSnakes(prev => prev.map(s => {
      const current = typeof s?.status === 'string' ? s.status.trim() : '';
      if (!current || current.toLowerCase() !== lower) return s;
      return { ...s, status: '' };
    }));
    setNewAnimal(prev => {
      if (!prev) return prev;
      const current = (prev.status || '').trim();
      if (!current || current.toLowerCase() !== lower) return prev;
      return { ...prev, status: '' };
    });
    setEditSnakeDraft(prev => {
      if (!prev) return prev;
      const current = (prev.status || '').trim();
      if (!current || current.toLowerCase() !== lower) return prev;
      return { ...prev, status: '' };
    });
  }, [setCustomStatusTags, setRemovedStatusTags, setSelectedStatusTags, setSnakes, setNewAnimal, setEditSnakeDraft]);

  const handleDeleteEditStatus = useCallback((tag) => {
    handleDeleteStatusTag(tag);
    setEditSnakeDraft(prev => {
      if (!prev) return prev;
      const current = typeof prev.status === 'string' ? prev.status.trim().toLowerCase() : '';
      const candidate = typeof tag === 'string' ? tag.trim().toLowerCase() : '';
      if (!current || !candidate || current !== candidate) return prev;
      return { ...prev, status: '' };
    });
  }, [handleDeleteStatusTag, setEditSnakeDraft]);

  const toggleStatusTagFilter = useCallback((tag) => {
    const trimmed = (tag || '').trim();
    setSelectedStatusTags(trimmed ? [trimmed] : []);
  }, []);

  const clearStatusTagFilters = useCallback(() => {
    setSelectedStatusTags([]);
  }, []);

  // last feed defaults (persisted) - store feed/form/size/etc but not grams
  const [lastFeedDefaults, setLastFeedDefaults] = useState(() => {
    const stored = loadStoredJson(STORAGE_KEYS.lastFeedDefaults, DEFAULT_LAST_FEED_DEFAULTS) || DEFAULT_LAST_FEED_DEFAULTS;
    return { ...DEFAULT_LAST_FEED_DEFAULTS, ...stored };
  });
  useEffect(() => { saveStoredJson(STORAGE_KEYS.lastFeedDefaults, lastFeedDefaults); }, [lastFeedDefaults]);
  useEffect(() => {
    saveStoredJson(STORAGE_KEYS.spaces, { rooms, heatRacks, terrariums });
  }, [rooms, heatRacks, terrariums]);

  useEffect(() => { saveStoredJson(STORAGE_KEYS.breeder, normalizeBreederInfo(breederInfo)); }, [breederInfo]);
  useEffect(() => {
    const normalized = normalizeMorphAliasDatabase(morphAliases);
    const next = normalized.length ? normalized : [...DEFAULT_MORPH_ALIASES];
    setActiveMorphAliases(next);
    saveStoredJson(STORAGE_KEYS.morphAliases, next);
  }, [morphAliases]);
  useEffect(() => {
    const next = mergeGeneAliasRows(geneAliases);
    setActiveGeneAliasRows(next);
    saveStoredJson(STORAGE_KEYS.geneAliases, next);
  }, [geneAliases]);

  useEffect(() => {
    if (!electronDataReady) return;
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!bridge?.saveData) return;
    const payload = {
      snakes,
      pairings,
      groups,
      rooms,
      heatRacks,
      terrariums,
      spaces: buildLegacySpacesSnapshot(rooms, heatRacks, terrariums),
      showGroups,
      hiddenGroups,
      customStatusTags,
      removedStatusTags,
      theme,
      breederInfo,
      morphAliases,
      geneAliases,
      leucisticType: lastLeucisticType,
      backupSettings,
      autoBackupSnapshot,
      backupVault,
      lastFeedDefaults,
    };

    const saveTimer = setTimeout(() => {
      bridge.saveData(payload).catch((error) => {
        console.error('Failed to save Breeding Planner data', error);
      });
    }, 300);

    return () => {
      clearTimeout(saveTimer);
    };
  }, [
    autoBackupSnapshot,
    backupSettings,
    backupVault,
    breederInfo,
    customStatusTags,
    electronDataReady,
    groups,
    hiddenGroups,
    lastFeedDefaults,
    pairings,
    removedStatusTags,
    showGroups,
    snakes,
    rooms,
    heatRacks,
    terrariums,
    morphAliases,
    geneAliases,
    lastLeucisticType,
    theme,
  ]);

  // In browser mode (no Electron bridge) persist planner data to localStorage.
  // Electron handles the same fields through the bridge payload above.
  useEffect(() => {
    if (!electronDataReady) return;
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (bridge?.saveData) return;
    saveStoredJson(STORAGE_KEYS.snakes, snakes);
    saveStoredJson(STORAGE_KEYS.pairings, pairings);
    saveStoredJson(STORAGE_KEYS.groups, groups);
    saveStoredJson(STORAGE_KEYS.showGroups, showGroups);
    saveStoredJson(STORAGE_KEYS.hiddenGroups, hiddenGroups);
    saveStoredJson(STORAGE_KEYS.customStatusTags, customStatusTags);
    saveStoredJson(STORAGE_KEYS.removedStatusTags, removedStatusTags);
  }, [
    customStatusTags,
    electronDataReady,
    groups,
    hiddenGroups,
    pairings,
    removedStatusTags,
    showGroups,
    snakes,
  ]);

  useEffect(() => {
    if (!electronDataReady || !sharedBreederDataReady) return;
    if (backendPlannerSyncRef.current.status !== 'ready' || !backendPlannerSyncRef.current.seeded) return;

    const payload = {
      animals: snakes,
      pairings,
      clutches: [],
    };
    const signature = JSON.stringify({ snakes, pairings });
    if (signature === backendPlannerSyncRef.current.lastSavedSignature) return;

    const saveTimer = setTimeout(() => {
      saveBreederSnapshot(payload)
        .then(() => {
          backendPlannerSyncRef.current.lastSavedSignature = signature;
        })
        .catch((error) => {
          console.warn('Failed to save shared breeder snapshot', error);
        });
    }, 600);

    return () => clearTimeout(saveTimer);
  }, [electronDataReady, pairings, sharedBreederDataReady, snakes]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const customLogo = typeof breederInfo?.logoUrl === 'string' ? breederInfo.logoUrl.trim() : '';
    const desiredHref = customLogo || DEFAULT_FAVICON_HREF;
    const existingLink = document.querySelector("link[rel='icon']") || document.querySelector("link[rel='shortcut icon']");
    let link = existingLink;
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'icon');
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== desiredHref) {
      link.setAttribute('href', desiredHref);
    }
    if (customLogo) {
      const dataMatch = customLogo.match(/^data:(image\/[^;]+);/i);
      if (dataMatch && dataMatch[1]) {
        link.setAttribute('type', dataMatch[1]);
      } else {
        link.removeAttribute('type');
      }
      link.removeAttribute('sizes');
    } else {
      link.setAttribute('type', 'image/png');
      link.setAttribute('sizes', '512x512');
    }
  }, [breederInfo?.logoUrl]);

  useEffect(() => {
    saveStoredJson(STORAGE_KEYS.backupSettings, backupSettings);
  }, [backupSettings]);

  useEffect(() => {
    if (!autoBackupSnapshot) {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(STORAGE_KEYS.backupSnapshot);
        } catch (err) {
          console.warn('Failed to clear backup snapshot', err);
        }
      }
      return;
    }
    saveStoredJson(STORAGE_KEYS.backupSnapshot, autoBackupSnapshot);
  }, [autoBackupSnapshot]);

  useEffect(() => {
    saveStoredJson(STORAGE_KEYS.backupVault, backupVault);
  }, [backupVault]);

  useEffect(() => {
    const limit = normalizeBackupSettings(backupSettings).maxVaultEntries;
    if (typeof limit !== 'number' || limit <= 0) return;
    setBackupVault(prev => {
      if (!Array.isArray(prev)) return [];
      if (prev.length <= limit) return prev;
      return prev.slice(0, limit);
    });
  }, [backupSettings, setBackupVault]);

  const updateBackupSettings = useCallback((patch) => {
    setBackupSettings(prev => normalizeBackupSettings({ ...(prev || {}), ...(patch || {}) }));
  }, []);

  const createBackupPayload = useCallback(() => ({
    version: 1,
    generatedAt: new Date().toISOString(),
    snakes,
    pairings,
    groups,
    morphAliases: normalizeMorphAliasDatabase(morphAliases),
    geneAliases: mergeGeneAliasRows(geneAliases),
    leucisticType: lastLeucisticType === 'blackEye' ? 'blackEye' : 'bel',
    breederInfo: normalizeBreederInfo(breederInfo),
    theme,
    lastFeedDefaults,
    rooms,
    heatRacks,
    terrariums,
    spaces: buildLegacySpacesSnapshot(rooms, heatRacks, terrariums),
  }), [snakes, pairings, groups, morphAliases, geneAliases, lastLeucisticType, breederInfo, theme, lastFeedDefaults, rooms, heatRacks, terrariums]);

  const handleRestoreBackup = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Backup file is invalid.');
    }

    const incomingSnakes = Array.isArray(payload.snakes)
      ? payload.snakes.map(sanitizeSnakeRecord).filter(Boolean)
      : [];
    const incomingPairings = Array.isArray(payload.pairings)
      ? payload.pairings.map(sanitizePairingRecord).filter(Boolean)
      : [];

    if (!incomingSnakes.length && !incomingPairings.length) {
      throw new Error('Backup file does not contain any animals or pairings.');
    }

    setSnakes(incomingSnakes);
    setPairings(incomingPairings);
    setGroups(Array.isArray(payload.groups) ? payload.groups : [...DEFAULT_GROUPS]);

    if (Array.isArray(payload.morphAliases)) {
      const normalizedAliases = normalizeMorphAliasDatabase(payload.morphAliases);
      setMorphAliases(normalizedAliases.length ? normalizedAliases : [...DEFAULT_MORPH_ALIASES]);
    }
    if (Array.isArray(payload.geneAliases)) {
      setGeneAliases(mergeGeneAliasRows(payload.geneAliases));
    }
    if (payload.leucisticType === 'blackEye' || payload.leucisticType === 'bel') {
      setLastLeucisticType(payload.leucisticType);
    }

    if (payload.breederInfo && typeof payload.breederInfo === 'object') {
      setBreederInfo(normalizeBreederInfo(payload.breederInfo));
    }

    if (payload.lastFeedDefaults && typeof payload.lastFeedDefaults === 'object') {
      setLastFeedDefaults(prev => ({ ...prev, ...payload.lastFeedDefaults }));
    }

    const structuredSpaces = {
      rooms: Array.isArray(payload.rooms) ? payload.rooms : [],
      heatRacks: Array.isArray(payload.heatRacks) ? payload.heatRacks : [],
      terrariums: Array.isArray(payload.terrariums) ? payload.terrariums : [],
    };
    const hasStructuredSpaces = structuredSpaces.rooms.length || structuredSpaces.heatRacks.length || structuredSpaces.terrariums.length;
    if (hasStructuredSpaces || Array.isArray(payload.spaces)) {
      const normalizedSpaces = hasStructuredSpaces
        ? normalizeSpacesDataset(structuredSpaces)
        : normalizeSpacesDataset(payload.spaces || []);
      setSpacesState(normalizedSpaces);
    }
  }, [setSnakes, setPairings, setGroups, setMorphAliases, setGeneAliases, setLastLeucisticType, setBreederInfo, setLastFeedDefaults, setSpacesState]);

  const addBackupVaultEntry = useCallback((payload, meta = {}) => {
    if (!payload || typeof payload !== 'object') return null;
    const source = meta.source === 'auto' ? 'auto' : 'manual';
    const savedAt = typeof meta.savedAt === 'string' && meta.savedAt ? meta.savedAt : new Date().toISOString();
    const displayName = typeof meta.name === 'string' && meta.name.trim()
      ? meta.name.trim()
      : `${source === 'auto' ? 'Auto' : 'Manual'} backup • ${formatDateTimeForDisplay(savedAt)}`;
    const entry = normalizeBackupFileEntry({
      id: typeof meta.id === 'string' && meta.id.trim() ? meta.id.trim() : uid(source === 'auto' ? 'auto-backup' : 'manual-backup'),
      name: displayName,
      createdAt: savedAt,
      updatedAt: savedAt,
      source,
      payload,
    });
    if (!entry) return null;
    const { maxVaultEntries: limit } = normalizeBackupSettings(backupSettings);
    setBackupVault(prev => {
      const prior = Array.isArray(prev) ? prev : [];
      const withoutDuplicate = prior.filter(existing => existing.id !== entry.id);
      const next = [entry, ...withoutDuplicate];
      next.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      if (typeof limit === 'number' && limit > 0) {
        return next.slice(0, limit);
      }
      return next;
    });
    return entry;
  }, [setBackupVault, backupSettings]);

  const renameBackupVaultEntry = useCallback((id, nextName) => {
    const trimmed = typeof nextName === 'string' ? nextName.trim() : '';
    if (!trimmed) return;
    const updatedAt = new Date().toISOString();
    setBackupVault(prev => {
      const list = Array.isArray(prev) ? prev : [];
      return list.map(entry => (entry.id === id ? { ...entry, name: trimmed, updatedAt } : entry));
    });
  }, [setBackupVault]);

  const deleteBackupVaultEntry = useCallback((id) => {
    setBackupVault(prev => (Array.isArray(prev) ? prev.filter(entry => entry.id !== id) : []));
  }, [setBackupVault]);

  const runAutoBackup = useCallback(() => {
    let payload;
    try {
      payload = createBackupPayload();
    } catch (err) {
      console.error('Failed to build backup payload', err);
      return;
    }
    let snapshotPayload;
    try {
      snapshotPayload = JSON.parse(JSON.stringify(payload));
    } catch (err) {
      console.error('Failed to serialize auto backup payload', err);
      return;
    }
    const savedAt = new Date().toISOString();
    setAutoBackupSnapshot({ savedAt, payload: snapshotPayload });
    setBackupSettings(prev => normalizeBackupSettings({ ...(prev || {}), lastRun: savedAt }));
    addBackupVaultEntry(snapshotPayload, {
      source: 'auto',
      savedAt,
      name: `Auto backup • ${formatDateTimeForDisplay(savedAt)}`,
    });
  }, [createBackupPayload, addBackupVaultEntry, setAutoBackupSnapshot, setBackupSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const intervalMs = backupFrequencyToMs(backupSettings.frequency);
    if (!intervalMs) return undefined;

    let cancelled = false;
    const maybeRun = () => {
      if (cancelled) return;
      const lastRunTime = backupSettings.lastRun ? new Date(backupSettings.lastRun).getTime() : 0;
      if (!lastRunTime || Number.isNaN(lastRunTime) || (Date.now() - lastRunTime) >= intervalMs) {
        runAutoBackup();
      }
    };

    maybeRun();
    const id = window.setInterval(maybeRun, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [backupSettings.frequency, backupSettings.lastRun, runAutoBackup]);

  const resetAppToDefaults = useCallback(async () => {
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;

    if (bridge?.clearData) {
      const result = await bridge.clearData();
      if (result && result.success === false) {
        throw new Error(result.error || 'Unable to clear desktop storage.');
      }
    } else if (bridge?.saveData) {
      const result = await bridge.saveData({});
      if (result && result.success === false) {
        throw new Error(result.error || 'Unable to clear desktop storage.');
      }
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.clear();
      } catch (error) {
        console.warn('Failed to clear localStorage during reset', error);
      }
      try {
        window.sessionStorage.clear();
      } catch (error) {
        console.warn('Failed to clear sessionStorage during reset', error);
      }
      if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
        try {
          const databases = await window.indexedDB.databases();
          await Promise.all(
            (Array.isArray(databases) ? databases : [])
              .map((db) => db?.name)
              .filter(Boolean)
              .map((dbName) => new Promise((resolve) => {
                const request = window.indexedDB.deleteDatabase(dbName);
                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
                request.onblocked = () => resolve(false);
              }))
          );
        } catch (error) {
          console.warn('Failed to clear IndexedDB databases during reset', error);
        }
      }
      if (typeof window.caches !== 'undefined' && typeof window.caches.keys === 'function') {
        try {
          const cacheKeys = await window.caches.keys();
          await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));
        } catch (error) {
          console.warn('Failed to clear Cache Storage during reset', error);
        }
      }
    }

    if (leucisticResolverRef.current) {
      leucisticResolverRef.current({ cancelled: true, genes: [] });
      leucisticResolverRef.current = null;
    }

    setSnakes(createFreshSnakes());
    setPairings(createFreshPairings());
    setTab('animals');
    setPairingsView('active');
    setCompletedYearFilter('All');
    setAnimalView('all');
    setAnimalLayout('cards');
    setQuery('');
    setGroupFilter('all');
    setShowGroups([]);
    setHiddenGroups([]);
    setSelectedStatusTags([]);
    setCustomStatusTags([]);
    setRemovedStatusTags([]);
    setGroups([...DEFAULT_GROUPS]);
    setSpacesState(normalizeSpacesDataset([]));
    setBreederInfo(normalizeBreederInfo(null));
    setMorphAliases([...DEFAULT_MORPH_ALIASES]);
    setGeneAliases(getDefaultGeneAliasRows());
    setLastLeucisticType('bel');
    setLeucisticModalState(null);
    setLeucisticTypeChoice('bel');
    setLeucisticBelGene1(LEUCISTIC_BEL_GENE_OPTIONS[0]);
    setLeucisticBelGene2(LEUCISTIC_BEL_GENE_OPTIONS[1]);
    setLeucisticBlackGene(LEUCISTIC_BLACK_EYE_GENE_OPTIONS[0]);
    setBackupSettings(normalizeBackupSettings(null));
    setAutoBackupSnapshot(null);
    setBackupVault([]);
    setLastFeedDefaults({ ...DEFAULT_LAST_FEED_DEFAULTS });
    setAnimalExportFields([...DEFAULT_ANIMAL_EXPORT_FIELDS]);
    setPairingExportFields([...DEFAULT_PAIRING_EXPORT_FIELDS]);
    setExportFeedback(null);
    setListExportFeedback(null);
    setAppDialog(null);
    setShowAddModal(false);
    setShowImportModal(false);
    setTestOrderSnake(null);
    setPairingGuard(null);
    setPanelRefreshToken((prev) => prev + 1);
    setElectronDataReady(true);
  }, []);

  const handleAddRoom = useCallback((name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    updateSpacesState(prev => ({
      ...prev,
      rooms: [...prev.rooms, createRoomRecord(trimmed)],
    }));
  }, [updateSpacesState]);

  const handleRenameRoom = useCallback((roomId, nextName) => {
    if (!roomId) return;
    const trimmed = String(nextName || '').trim();
    updateSpacesState(prev => ({
      ...prev,
      rooms: prev.rooms.map(room => room.id === roomId ? { ...room, name: trimmed || room.name, updatedAt: nowIsoString() } : room),
    }));
  }, [updateSpacesState]);

  const handleDeleteRoom = useCallback((roomId) => {
    if (!roomId) return;
    updateSpacesState(prev => ({
      rooms: prev.rooms.filter(room => room.id !== roomId),
      heatRacks: prev.heatRacks.filter(rack => rack.roomId !== roomId),
      terrariums: prev.terrariums.filter(item => item.roomId !== roomId),
    }));
  }, [updateSpacesState]);

  const handleMoveRoom = useCallback((roomId, direction = 0) => {
    if (!roomId || !direction) return;
    updateSpacesState(prev => {
      const index = prev.rooms.findIndex(room => room.id === roomId);
      if (index === -1) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.rooms.length) return prev;
      const roomsDraft = [...prev.rooms];
      const [target] = roomsDraft.splice(index, 1);
      roomsDraft.splice(nextIndex, 0, target);
      return { ...prev, rooms: roomsDraft };
    });
  }, [updateSpacesState]);

  const handleCreateHeatRack = useCallback((roomId, rackDraft) => {
    if (!roomId) return;
    updateSpacesState(prev => {
      const normalized = normalizeHeatRackRecord({ ...(rackDraft || {}), id: uid('rack'), roomId });
      if (!normalized) return prev;
      return { ...prev, heatRacks: [...prev.heatRacks, normalized] };
    });
  }, [updateSpacesState]);

  const handleUpdateHeatRack = useCallback((rackId, patch) => {
    if (!rackId) return;
    updateSpacesState(prev => {
      const current = prev.heatRacks.find(rack => rack.id === rackId);
      if (!current) return prev;
      const normalized = normalizeHeatRackRecord({
        ...current,
        ...(patch || {}),
        id: current.id,
        roomId: current.roomId,
        createdAt: current.createdAt,
      });
      if (!normalized) return prev;
      return {
        ...prev,
        heatRacks: prev.heatRacks.map(rack => (rack.id === rackId ? normalized : rack)),
      };
    });
  }, [updateSpacesState]);

  const handleDeleteHeatRack = useCallback((rackId) => {
    if (!rackId) return;
    updateSpacesState(prev => ({
      ...prev,
      heatRacks: prev.heatRacks.filter(rack => rack.id !== rackId),
    }));
  }, [updateSpacesState]);

  const handleCreateTerrarium = useCallback((roomId, draft) => {
    if (!roomId) return;
    updateSpacesState(prev => {
      const normalized = normalizeTerrariumRecord({ ...(draft || {}), id: uid('terrarium'), roomId });
      if (!normalized) return prev;
      return { ...prev, terrariums: [...prev.terrariums, normalized] };
    });
  }, [updateSpacesState]);

  const handleUpdateTerrarium = useCallback((terrariumId, patch) => {
    if (!terrariumId) return;
    updateSpacesState(prev => {
      const current = prev.terrariums.find(item => item.id === terrariumId);
      if (!current) return prev;
      const normalized = normalizeTerrariumRecord({
        ...current,
        ...(patch || {}),
        id: current.id,
        roomId: current.roomId,
        createdAt: current.createdAt,
      });
      if (!normalized) return prev;
      return {
        ...prev,
        terrariums: prev.terrariums.map(item => (item.id === terrariumId ? normalized : item)),
      };
    });
  }, [updateSpacesState]);

  const handleDeleteTerrarium = useCallback((terrariumId) => {
    if (!terrariumId) return;
    updateSpacesState(prev => ({
      ...prev,
      terrariums: prev.terrariums.filter(item => item.id !== terrariumId),
    }));
  }, [updateSpacesState]);

  const handleAssignRackSlot = useCallback((rackId, levelIndex, columnIndex, snakeId) => {
    updateSpacesState(prev => {
      const nextHeatRacks = prev.heatRacks.map(rack => {
        let mutated = false;
        let slots = Array.isArray(rack.slots) ? rack.slots : [];

        if (snakeId) {
          let cleared = false;
          slots = slots.map(slot => {
            const isTargetSlot = rack.id === rackId && slot.levelIndex === levelIndex && slot.columnIndex === columnIndex;
            if (!isTargetSlot && slot.snakeId === snakeId) {
              cleared = true;
              return { ...slot, snakeId: null };
            }
            return slot;
          });
          if (cleared) mutated = true;
        }

        if (rack.id === rackId) {
          slots = slots.map(slot => {
            if (slot.levelIndex === levelIndex && slot.columnIndex === columnIndex) {
              if ((slot.snakeId || null) === (snakeId || null)) {
                return slot;
              }
              mutated = true;
              return { ...slot, snakeId: snakeId || null };
            }
            return slot;
          });
        }

        return mutated ? { ...rack, slots, updatedAt: nowIsoString() } : rack;
      });

      return { ...prev, heatRacks: nextHeatRacks };
    });
  }, [updateSpacesState]);

  const handleUpdateTerrariumOccupants = useCallback((terrariumId, occupantIds) => {
    if (!terrariumId) return;
    updateSpacesState(prev => {
      const existing = prev.terrariums.find(item => item.id === terrariumId);
      const fallbackCapacity = existing?.occupantIds?.length || 1;
      const rawCapacity = existing?.capacity ?? fallbackCapacity;
      const capacityLimit = clampInt(rawCapacity, { min: 1, fallback: fallbackCapacity });
      return ({
        ...prev,
        terrariums: prev.terrariums.map(item => {
          if (item.id !== terrariumId) return item;
          const nextIds = Array.isArray(occupantIds)
            ? occupantIds.filter(Boolean).slice(0, capacityLimit)
            : [];
          return { ...item, occupantIds: nextIds, updatedAt: nowIsoString() };
        }),
      });
    });
  }, [updateSpacesState]);

  useEffect(() => {
    setSnakes(prev => {
      let changed = false;
      const next = prev.map(s => {
        const normalized = normalizeSexValue(s?.sex);
        if (!s || normalized === 'UNKNOWN' || s.sex === normalized) return s;
        changed = true;
        return { ...s, sex: normalized };
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!photoGallerySnakeId) return;
    if (!snakes.some(s => s.id === photoGallerySnakeId)) {
      setPhotoGallerySnakeId(null);
    }
  }, [photoGallerySnakeId, snakes]);

  const isBreederGroupMember = useCallback((snake) => {
    if (!snake) return false;
    const rawGroups = Array.isArray(snake.groups)
      ? snake.groups
      : normalizeSingleGroupValue(snake.groups);
    return rawGroups.some(group => {
      if (typeof group !== 'string') return false;
      const normalized = group.trim().toLowerCase();
      return normalized === 'breeders';
    });
  }, []);

  const females = useMemo(
    () => snakes.filter(isFemaleSnake).filter(isBreederGroupMember),
    [snakes, isBreederGroupMember]
  );

  const males = useMemo(
    () => snakes.filter(isMaleSnake).filter(isBreederGroupMember),
    [snakes, isBreederGroupMember]
  );

  const maleSearchResults = useMemo(() => {
    const source = Array.isArray(males) ? males : [];
    if (!source.length) return [];
    const list = maleSearchQuery ? filterSnakes(source, maleSearchQuery, 'all') : source;
    return list.slice(0, 25);
  }, [males, maleSearchQuery]);

  const femaleSearchResults = useMemo(() => {
    const source = Array.isArray(females) ? females : [];
    if (!source.length) return [];
    const list = femaleSearchQuery ? filterSnakes(source, femaleSearchQuery, 'all') : source;
    return list.slice(0, 25);
  }, [females, femaleSearchQuery]);

  const pairingsPartition = useMemo(() => {
    const active = [];
    const completed = [];
    pairings.forEach(p => {
      if (isPairingCompleted(p)) {
        completed.push(p);
      } else {
        active.push(p);
      }
    });
    return { active, completed };
  }, [pairings]);

  const activePairings = pairingsPartition.active;
  const completedPairings = pairingsPartition.completed;
  const activePairingsCount = activePairings.length;
  const completedPairingsCount = completedPairings.length;
  const breedingDashboardItems = useMemo(() => {
    const today = new Date();
    return activePairings
      .map(pairing => buildPairingDashboardItem(pairing, snakes, today))
      .filter(Boolean)
      .sort((a, b) => {
        const stageWeight = { clutch: 0, preLay: 1, ovulation: 2, locks: 3, active: 4, hatched: 5 };
        const aStageWeight = stageWeight[a.stageKey] ?? 6;
        const bStageWeight = stageWeight[b.stageKey] ?? 6;
        if (aStageWeight !== bStageWeight) return aStageWeight - bStageWeight;
        const urgencyWeight = { overdue: 0, due: 1, soon: 2, upcoming: 3, none: 4 };
        const aWeight = urgencyWeight[a.urgency] ?? 5;
        const bWeight = urgencyWeight[b.urgency] ?? 5;
        if (aWeight !== bWeight) return aWeight - bWeight;
        const aDays = typeof a.daysUntil === 'number' ? a.daysUntil : Number.POSITIVE_INFINITY;
        const bDays = typeof b.daysUntil === 'number' ? b.daysUntil : Number.POSITIVE_INFINITY;
        if (aDays !== bDays) return aDays - bDays;
        return String(a.label || '').localeCompare(String(b.label || ''));
      });
  }, [activePairings, snakes]);
  const completedPairingsWithYear = useMemo(() => {
    return completedPairings.map(pairing => {
      const normalized = withPairingLifecycleDefaults({ ...pairing });
      const derived = getBreedingCycleDerived(normalized);
      const yearValue = computeBreedingCycleYear({
        clutchDate: derived?.clutchDate || '',
        preLayDate: derived?.preLayDate || '',
        ovulationDate: derived?.ovulationDate || '',
        hatchDate: derived?.hatchDate || '',
        startDate: normalized.startDate || '',
      });
      const year = (yearValue && typeof yearValue === 'string' && yearValue.trim()) ? yearValue : 'Unknown';
      return { pairing, year };
    });
  }, [completedPairings]);

  const completedYearOptions = useMemo(() => {
    const set = new Set();
    completedPairingsWithYear.forEach(({ year }) => {
      set.add(year || 'Unknown');
    });
    const list = Array.from(set);
    list.sort((a, b) => {
      const parseYear = (value) => (/^\d{4}$/.test(value) ? Number(value) : null);
      const aNum = parseYear(a);
      const bNum = parseYear(b);
      if (aNum !== null && bNum !== null) return bNum - aNum;
      if (aNum !== null) return -1;
      if (bNum !== null) return 1;
      return a.localeCompare(b);
    });
    return list;
  }, [completedPairingsWithYear]);

  useEffect(() => {
    if (pairingsView !== 'completed') return;
    if (completedYearFilter === 'All') return;
    if (!completedYearOptions.includes(completedYearFilter)) {
      setCompletedYearFilter(completedYearOptions[0] || 'All');
    }
  }, [pairingsView, completedYearFilter, completedYearOptions]);

  const filteredCompletedPairings = useMemo(() => {
    if (pairingsView !== 'completed') return completedPairings;
    if (completedYearFilter === 'All') return completedPairingsWithYear.map(item => item.pairing);
    return completedPairingsWithYear
      .filter(item => item.year === completedYearFilter)
      .map(item => item.pairing);
  }, [pairingsView, completedPairings, completedPairingsWithYear, completedYearFilter]);

  const displayedPairings = pairingsView === 'completed' ? filteredCompletedPairings : activePairings;
  const filteredPairingsBySearch = useMemo(() => {
    const normalized = String(pairingsSearchQuery || '').trim().toLowerCase();
    const tokens = normalized ? normalized.split(/\s+/).filter(Boolean) : [];
    if (!tokens.length) return displayedPairings;
    return displayedPairings.filter(pairing => {
      if (!pairing) return false;
      const female = snakeById(snakes, pairing.femaleId);
      const male = snakeById(snakes, pairing.maleId);
      const fields = [
        pairing.label,
        pairing.id,
        female?.name,
        female?.id,
        male?.name,
        male?.id,
      ]
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      if (!fields.length) return false;
      return tokens.every(token => fields.some(field => field.includes(token)));
    });
  }, [displayedPairings, pairingsSearchQuery, snakes]);
  const clutchMetadataByPairingId = useMemo(() => {
    const list = Array.isArray(pairings) ? pairings : [];
    const sortByClutchDate = (a, b) => {
      const dateDiff = new Date(a.clutchDate) - new Date(b.clutchDate);
      if (dateDiff) return dateDiff;
      return String(a.pairingId || '').localeCompare(String(b.pairingId || ''));
    };
    const clutchesWithDates = list
      .filter(p => p?.clutch?.date)
      .map(p => ({
        pairingId: p.id,
        clutchDate: p.clutch.date,
        eggs: resolveEggCountForClutch(p?.clutch?.eggsTotal, p?.clutch?.fertileEggs) || 0,
        completed: isPairingCompleted(p),
        label: resolvePairingLabel(p, snakeById(snakes, p.femaleId), snakeById(snakes, p.maleId)),
      }))
      .sort(sortByClutchDate);
    const completedClutches = clutchesWithDates.filter(item => item.completed).sort(sortByClutchDate);
    const activeClutches = clutchesWithDates.filter(item => !item.completed).sort(sortByClutchDate);
    const starterCompletedIndex = completedClutches.findIndex(item => /salon\s+in\s+guglia/i.test(String(item.label || '')));
    const starterCompleted = starterCompletedIndex >= 0
      ? completedClutches[starterCompletedIndex]
      : completedClutches[0] || null;
    const remainingCompleted = completedClutches.filter(item => item.pairingId !== starterCompleted?.pairingId);
    const numberedClutches = [
      ...(starterCompleted ? [starterCompleted] : []),
      ...activeClutches,
      ...remainingCompleted,
    ];
    const map = new Map();
    let nextEggBoxNumber = 1;
    numberedClutches.forEach((item, idx) => {
      if (!item?.pairingId || map.has(item.pairingId)) return;
      const eggBoxCount = splitEggBoxCounts(item.eggs).length;
      map.set(item.pairingId, {
        clutchNumber: idx + 1,
        eggBoxNumber: nextEggBoxNumber,
        eggBoxCount,
      });
      nextEggBoxNumber += 1;
    });
    return map;
  }, [pairings, snakes]);
  const clutchNumberByPairingId = useMemo(() => {
    const map = new Map();
    clutchMetadataByPairingId.forEach((meta, pairingId) => {
      map.set(pairingId, meta.clutchNumber);
    });
    return map;
  }, [clutchMetadataByPairingId]);

  const eggBoxes = useMemo(() => {
    const list = Array.isArray(pairings) ? pairings : [];
    const activeClutchesWithDates = list
      .filter(p => p?.clutch?.date && !isPairingCompleted(p))
      .map(p => {
        const clutchDate = p.clutch.date;
        const female = snakeById(snakes, p.femaleId);
        const male = snakeById(snakes, p.maleId);
        const pairingLabel = resolvePairingLabel(p, female, male);
        const eggsRaw = p?.clutch?.eggsTotal;
        const fertileRaw = p?.clutch?.fertileEggs;
        const eggs = resolveEggCountForClutch(eggsRaw, fertileRaw) || 0;
        const dueDate = addDaysYmd(clutchDate, 60);
        const dueDateObj = new Date(dueDate);
        const remaining = Number.isFinite(dueDateObj.getTime())
          ? Math.max(0, Math.ceil((dueDateObj - new Date()) / (1000 * 60 * 60 * 24)))
          : null;
        const clutchYear = (() => {
          const d = new Date(clutchDate);
          return Number.isFinite(d.getTime()) ? d.getFullYear() : null;
        })();
        return {
          id: p.id || `eggbox-${clutchDate}-${pairingLabel}`,
          pairingId: p.id,
          pairing: p,
          clutchNotes: p?.clutch?.notes || '',
          eggBoxNotes: p?.clutch?.eggBoxNotes || {},
          eggBoxBadEggs: p?.clutch?.eggBoxBadEggs || {},
          clutchDate,
          pairingLabel,
          femaleName: female?.name || p.femaleId || 'Female',
          maleName: male?.name || p.maleId || 'Male',
          femaleGenetics: female ? (getDisplayedSnakeGeneticsTokens(female).length ? getDisplayedSnakeGeneticsTokens(female).join(', ') : 'Normal') : '\u2014',
          maleGenetics: male ? (getDisplayedSnakeGeneticsTokens(male).length ? getDisplayedSnakeGeneticsTokens(male).join(', ') : 'Normal') : '\u2014',
          eggs,
          fertileEggs: fertileRaw,
          dueDate,
          remaining,
          year: clutchYear,
        };
      })
      .sort((a, b) => new Date(a.clutchDate) - new Date(b.clutchDate));
    return activeClutchesWithDates.flatMap((item) => {
      const metadata = clutchMetadataByPairingId.get(item.pairingId) || {};
      const clutchNumber = metadata.clutchNumber || 0;
      const eggBoxNumber = metadata.eggBoxNumber || clutchNumber || 0;
      const boxEggCounts = splitEggBoxCounts(item.eggs);
      return boxEggCounts.map((eggs, boxIdx) => {
        const boxKey = String(boxIdx + 1);
        const badEggsRaw = item.eggBoxBadEggs?.[boxKey] ?? item.eggBoxBadEggs?.[boxIdx + 1] ?? 0;
        const badEggs = Math.max(0, Math.min(eggs, Math.floor(Number(badEggsRaw) || 0)));
        return {
          ...item,
          id: `${item.id}-box-${boxIdx + 1}`,
          clutchNumber,
          number: clutchNumber,
          eggBoxNumber,
          eggBoxIndexInClutch: boxIdx + 1,
          eggBoxCount: boxEggCounts.length,
          originalEggs: eggs,
          badEggs,
          eggs: Math.max(0, eggs - badEggs),
          notes: item.eggBoxNotes?.[boxKey] || item.eggBoxNotes?.[boxIdx + 1] || (boxEggCounts.length === 1 ? item.clutchNotes : ''),
          laidLabel: formatDateForDisplay(item.clutchDate) || '',
          dueLabel: item.dueDate ? formatDateForDisplay(item.dueDate) : '',
        };
      });
    });
  }, [pairings, snakes, t, clutchMetadataByPairingId]);
  const incubatorSummary = useMemo(() => {
    const clutchIds = new Set();
    let totalEggs = 0;
    eggBoxes.forEach(box => {
      if (box?.pairingId) clutchIds.add(box.pairingId);
      const count = Number(box?.eggs);
      if (Number.isFinite(count)) totalEggs += count;
    });
    return {
      clutches: clutchIds.size,
      boxes: eggBoxes.length,
      eggs: totalEggs,
    };
  }, [eggBoxes]);
  const handleSaveEggBoxDetails = useCallback((box, { notes, badEggs } = {}) => {
    if (!box?.pairingId) return;
    const noteValue = String(notes || '').trim();
    const maxEggs = Math.max(0, Number(box.originalEggs ?? box.eggs) || 0);
    const badEggsValue = Math.max(0, Math.min(maxEggs, Math.floor(Number(badEggs) || 0)));
    const indexKey = String(box.eggBoxIndexInClutch || 1);
    setPairings(prev => prev.map(pairing => {
      if (!pairing || pairing.id !== box.pairingId) return pairing;
      const current = withPairingLifecycleDefaults({ ...pairing });
      const currentClutch = { ...(current.clutch || {}) };
      const nextEggBoxNotes = { ...(currentClutch.eggBoxNotes || {}) };
      const nextEggBoxBadEggs = { ...(currentClutch.eggBoxBadEggs || {}) };
      if (noteValue) nextEggBoxNotes[indexKey] = noteValue;
      else delete nextEggBoxNotes[indexKey];
      if (badEggsValue > 0) nextEggBoxBadEggs[indexKey] = badEggsValue;
      else delete nextEggBoxBadEggs[indexKey];
      const nextClutch = {
        ...currentClutch,
        eggBoxNotes: nextEggBoxNotes,
        eggBoxBadEggs: nextEggBoxBadEggs,
      };
      if ((box.eggBoxCount || 1) === 1) {
        nextClutch.notes = noteValue;
      }
      return withPairingLifecycleDefaults({
        ...current,
        clutch: nextClutch,
      });
    }));
    setEggBoxModal(null);
  }, [setPairings]);
  const filteredCompletedCount = filteredCompletedPairings.length;

  useEffect(() => {
    if (!focusedPairingId) return;
    if (activePairings.some(p => p.id === focusedPairingId)) {
      if (pairingsView !== 'active') setPairingsView('active');
      return;
    }
    if (completedPairings.some(p => p.id === focusedPairingId)) {
      if (pairingsView !== 'completed') setPairingsView('completed');
    }
  }, [focusedPairingId, activePairings, completedPairings, pairingsView]);

  // open snake if URL contains #snake=id
  useEffect(()=>{
    const h = window.location.hash.match(/#snake=(.+)/);
    if (h) {
      const id = decodeURIComponent(h[1]);
      const s = snakes.find(x=>x.id===id);

  useEffect(() => {
    const value = lastLeucisticType === 'blackEye' ? 'blackEye' : 'bel';
    saveStoredJson(STORAGE_KEYS.leucisticType, value);
  }, [lastLeucisticType]);
      if (s) { setEditSnake(s); setEditSnakeDraft(initSnakeDraft(s)); }
    }
  }, [snakes]);

  // open pairing if URL contains #pairing=id
  useEffect(()=>{
    const h = window.location.hash.match(/#pairing=(.+)/);
    if (h) {
      const id = decodeURIComponent(h[1]);
      const p = pairings.find(x=>x.id===id);
  if (p) { setTab('pairings'); setPairingsView(isPairingCompleted(p) ? 'completed' : 'active'); setFocusedPairingId(p.id); }
    }
  }, [pairings]);

  // generate QR data url when requested
  useEffect(()=>{
    if (!qrFor) { setQrDataUrl(null); return; }
    const targetId = typeof qrFor === 'string' ? qrFor : qrFor?.id;
    if (!targetId) { setQrDataUrl(null); return; }
    const url = `${window.location.origin}${window.location.pathname}#snake=${encodeURIComponent(targetId)}`;
    QRCode.toDataURL(url, { width: 300 }).then(dataUrl => setQrDataUrl(dataUrl)).catch(()=>setQrDataUrl(null));
  }, [qrFor]);


  const filterSnakesByCriteria = useCallback((inputList) => {
    let base = Array.isArray(inputList) ? inputList.slice() : [];
    base = filterSnakes(base, query, tag);
    if (Array.isArray(selectedStatusTags) && selectedStatusTags.length) {
      const allowed = new Set(selectedStatusTags.map(tagValue => String(tagValue || '').trim()).filter(Boolean));
      base = base.filter(s => allowed.size === 0 ? true : allowed.has(String(s?.status || '').trim())) ;
    }

    const hasShowGroups = Array.isArray(showGroups) && showGroups.length > 0;
    const hasHiddenGroups = Array.isArray(hiddenGroups) && hiddenGroups.length > 0;

    if (hasShowGroups || hasHiddenGroups) {
      base = base.filter(s => {
        const memberships = Array.isArray(s?.groups) ? s.groups : [];
        const matchesShow = hasShowGroups ? memberships.some(g => showGroups.includes(g)) : true;
        const matchesHide = hasHiddenGroups ? memberships.some(g => hiddenGroups.includes(g)) : false;
        if (hasShowGroups && !matchesShow) return false;
        if (hasHiddenGroups && matchesHide) return false;
        return true;
      });
    } else if (groupFilter !== 'all') {
      base = base.filter(s => (s.groups || []).includes(groupFilter));
    }

    if (!showUnassigned) {
      base = base.filter(s => Array.isArray(s.groups) && s.groups.length);
    }

    return base;
  }, [query, tag, selectedStatusTags, showGroups, hiddenGroups, groupFilter, showUnassigned]);

  const filteredAll = useMemo(() => filterSnakesByCriteria(snakes), [filterSnakesByCriteria, snakes]);

  const filteredFemales = useMemo(
    () => filterSnakesByCriteria(snakes.filter(isFemaleSnake)),
    [filterSnakesByCriteria, snakes]
  );

  const filteredMales = useMemo(
    () => filterSnakesByCriteria(snakes.filter(isMaleSnake)),
    [filterSnakesByCriteria, snakes]
  );

  const activeAnimalList = useMemo(() => {
    if (animalView === "groups") return [];
    if (animalView === "all") return filteredAll;
    if (animalView === "females") return filteredFemales;
    if (animalView === "males") return filteredMales;
    return filteredAll;
  }, [animalView, filteredAll, filteredFemales, filteredMales]);

  const activeAnimalLabel = animalView === "groups"
    ? t("filters.groupsTitle", { defaultValue: "Groups" })
    : animalView === "females"
      ? t("filters.femalesTitle", { defaultValue: "Females" })
      : animalView === "males"
        ? t("filters.malesTitle", { defaultValue: "Males" })
        : t("filters.allAnimals", { defaultValue: "All animals" });

  const handleListExportCsv = useCallback(async () => {
    if (!activeAnimalList.length) {
      setListExportFeedback({
        type: 'error',
        message: t('animals.list.exportEmpty', { defaultValue: 'No animals match your filters.' }),
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const timestamp = new Date().toISOString();
    const safeStamp = timestamp.replace(/[:.]/g, '-');
    const labelBundle = {
      animal: t('animals.list.columns.animal', { defaultValue: 'Animal' }),
      id: t('animals.list.columns.id', { defaultValue: 'ID' }),
      sex: t('animals.list.columns.sex', { defaultValue: 'Sex' }),
      genetics: t('animals.list.columns.genetics', { defaultValue: 'Genetics' }),
      status: t('animals.list.columns.status', { defaultValue: 'Status' }),
      weight: t('animals.list.columns.weight', { defaultValue: 'Weight' }),
      lastFeed: t('animals.list.columns.lastFeed', { defaultValue: 'Last feed' }),
      groups: t('animals.list.columns.groups', { defaultValue: 'Groups' }),
      tags: t('animals.list.columns.tags', { defaultValue: 'Tags' }),
      projects: t('animals.list.columns.projects', { defaultValue: 'Projects' }),
      noData: t('logs.noData', { defaultValue: 'No data' }),
      refused: t('logs.refused', { defaultValue: 'Refused feed' }),
      feedDefault: t('logs.feed', { defaultValue: 'Feed' }),
      noGroup: t('snakeEdit.noGroup', { defaultValue: 'No group' }),
      sexMale: t('snake.sex.male', { defaultValue: 'Male' }),
      sexFemale: t('snake.sex.female', { defaultValue: 'Female' }),
      sexUnknown: t('snake.sex.unknown', { defaultValue: 'Unknown sex' }),
      statusPlaceholder: t('snakeEdit.status', { defaultValue: 'Status' }),
      unnamed: t('snakeEdit.unnamed', { defaultValue: 'Unnamed' }),
    };
    try {
      // No PDF dependencies here; Animal list export now streams through the CSV exporter exclusively.
      await exportAnimalListToCsv(activeAnimalList, {
        allSnakes: snakes,
        pairings,
        labels: labelBundle,
        fileName: `animal-list-${safeStamp}.csv`,
      });
      setListExportFeedback({
        type: 'success',
        message: t('animals.list.exportSuccess', { defaultValue: 'Exported list to CSV.', count: activeAnimalList.length }),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('List CSV export failed', err);
      setListExportFeedback({
        type: 'error',
        message: err?.message || t('animals.list.exportError', { defaultValue: 'Failed to export list.' }),
        timestamp: new Date().toISOString(),
      });
    }
  }, [activeAnimalList, pairings, snakes, t]);

  const snakesById = useMemo(() => Object.fromEntries(snakes.map(snake => [snake.id, snake])), [snakes]);
  const malesById = useMemo(() => Object.fromEntries(snakes.filter(isMaleSnake).map(snake => [snake.id, snake])), [snakes]);
  const femalesById = useMemo(() => Object.fromEntries(snakes.filter(isFemaleSnake).map(snake => [snake.id, snake])), [snakes]);

  const animalsCardTitle = (
    <div className="flex flex-col items-center gap-2 w-full">
      <span className="text-base font-semibold">{`${activeAnimalLabel} (${activeAnimalList.length})`}</span>
      <GeneLegend />
    </div>
  );

  const currentFemale = snakeById(snakes, draft.femaleId || "");
  const currentMale   = snakeById(snakes, draft.maleId || "");

  const isBreeder = useCallback((snake) => isBreederGroupMember(snake), [isBreederGroupMember]);

  const proceedWithPairing = useCallback((snake) => {
    if (!snake) return;
    setDraft({
      maleId: isMaleSnake(snake) ? snake.id : "",
      femaleId: isFemaleSnake(snake) ? snake.id : "",
      goals: [],
      notes: "",
      startDate: localYMD(new Date())
    });
    setMaleSearchQuery("");
    setFemaleSearchQuery("");
    setPairingSearchTarget(isMaleSnake(snake) ? "female" : isFemaleSnake(snake) ? "male" : "male");
    setShowPairingModal(true);
  }, [setDraft, setShowPairingModal, setFemaleSearchQuery, setMaleSearchQuery, setPairingSearchTarget, isFemaleSnake, isMaleSnake]);

  const startPairingWithSnake = useCallback((snake) => {
    if (!snake) return;
    if (!isBreeder(snake)) {
      setPairingGuard({ snake });
      return;
    }
    proceedWithPairing(snake);
  }, [isBreeder, proceedWithPairing]);

  const handlePairingGuardCancel = useCallback(() => {
    setPairingGuard(null);
  }, []);

  const handlePairingGuardConfirm = useCallback(() => {
    if (!pairingGuard?.snake) return;
    const snakeId = pairingGuard.snake.id;
    setSnakes(prev => prev.map(s => {
      if (!s || s.id !== snakeId) return s;
      return { ...s, groups: ['Breeders'] };
    }));
    setGroups(prev => prev.includes("Breeders") ? prev : [...prev, "Breeders"]);
    const updatedSnake = {
      ...pairingGuard.snake,
      groups: ['Breeders']
    };
    setPairingGuard(null);
    proceedWithPairing(updatedSnake);
  }, [pairingGuard, setSnakes, setGroups, proceedWithPairing]);

  const handleAddSnakePhotos = useCallback(async (snakeId, files, options = {}) => {
    if (!snakeId) return { newEntries: [], combined: null, imageUrl: null };
    const fileArray = Array.isArray(files) ? files : Array.from(files || []);
    const images = fileArray.filter(file => file && (typeof file.type !== 'string' || file.type.startsWith('image/')));
    if (!images.length) return { newEntries: [], combined: null, imageUrl: null };
    const sourceLabel = options.source === 'camera' ? 'camera' : 'upload';
    const entries = await Promise.all(images.map(async (file) => {
      try {
        const dataUrl = await readFileAsDataURL(file);
        return normalizePhotoEntry({
          id: uid('photo'),
          url: dataUrl,
          name: file.name || '',
          type: file.type || '',
          size: file.size,
          addedAt: new Date().toISOString(),
          source: sourceLabel,
        });
      } catch (err) {
        console.error('Failed to read image file', err);
        return null;
      }
    }));
    const newEntries = entries.filter(Boolean);
    if (!newEntries.length) return { newEntries: [], combined: null, imageUrl: null };

    let combinedResult = null;
    let imageUrlResult = null;
    setSnakes(prev => prev.map(s => {
      if (!s || s.id !== snakeId) return s;
      const existing = normalizeSnakePhotos(s.photos);
      const combined = trimSnakePhotoList([...existing, ...newEntries]);
      const latestUrl = newEntries[newEntries.length - 1]?.url || (combined.length ? combined[combined.length - 1].url : undefined);
      const nextImageUrl = latestUrl || s.imageUrl || (combined.length ? combined[combined.length - 1].url : undefined);
      combinedResult = combined;
      imageUrlResult = nextImageUrl;
      return { ...s, photos: combined, imageUrl: nextImageUrl };
    }));
    return { newEntries, combined: combinedResult, imageUrl: imageUrlResult };
  }, [setSnakes]);

  const handleRemoveSnakePhoto = useCallback((snakeId, photoId) => {
    if (!snakeId || !photoId) return;
    let updatedSnake = null;
    setSnakes(prev => prev.map(s => {
      if (!s || s.id !== snakeId) return s;
      const remaining = normalizeSnakePhotos(s.photos).filter(photo => photo.id !== photoId);
      let nextImageUrl = s.imageUrl;
      if (!remaining.some(photo => photo.url === nextImageUrl)) {
        nextImageUrl = remaining.length ? remaining[remaining.length - 1].url : undefined;
      }
      updatedSnake = { ...s, photos: remaining, imageUrl: nextImageUrl };
      return updatedSnake;
    }));
    if (editSnakeDraft?.id === snakeId) {
      setEditSnakeDraft(prev => prev ? ({
        ...prev,
        photos: updatedSnake ? normalizeSnakePhotos(updatedSnake.photos) : normalizeSnakePhotos(prev.photos).filter(photo => photo.id !== photoId),
        imageUrl: updatedSnake?.imageUrl,
      }) : prev);
    }
  }, [setSnakes, editSnakeDraft?.id, setEditSnakeDraft]);

  const handleSetSnakeCoverPhoto = useCallback((snakeId, photoId) => {
    if (!snakeId || !photoId) return;
    let selectedUrl = null;
    setSnakes(prev => prev.map(s => {
      if (!s || s.id !== snakeId) return s;
      const photos = normalizeSnakePhotos(s.photos);
      const selected = photos.find(photo => photo.id === photoId);
      if (!selected) return s;
      selectedUrl = selected.url;
      return { ...s, photos, imageUrl: selected.url };
    }));
    if (selectedUrl && editSnakeDraft?.id === snakeId) {
      setEditSnakeDraft(prev => prev ? ({ ...prev, photos: normalizeSnakePhotos(prev.photos), imageUrl: selectedUrl }) : prev);
    }
  }, [setSnakes, editSnakeDraft?.id]);

  const handleOpenPhotoGallery = useCallback((snakeId) => {
    if (!snakeId) return;
    setPhotoGallerySnakeId(snakeId);
  }, []);

  const handleClosePhotoGallery = useCallback(() => {
    setPhotoGallerySnakeId(null);
  }, []);

  const photoGallerySnake = useMemo(() => (
    photoGallerySnakeId ? snakes.find(s => s.id === photoGallerySnakeId) || null : null
  ), [snakes, photoGallerySnakeId]);

  const photoGalleryPhotos = useMemo(() => (
    photoGallerySnake ? normalizeSnakePhotos(photoGallerySnake.photos) : []
  ), [photoGallerySnake]);

  const formatPhotoSize = useCallback((value) => {
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }, []);

  const editPhotoCount = useMemo(() => (
    Array.isArray(editSnakeDraft?.photos) ? editSnakeDraft.photos.length : 0
  ), [editSnakeDraft?.photos]);

  const handleEditPhotoSelection = useCallback(async (fileList, source) => {
    if (!editSnake?.id) return;
    const files = Array.isArray(fileList)
      ? fileList.filter(Boolean)
      : Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    try {
      setEditUploadingPhoto(true);
      const result = await handleAddSnakePhotos(editSnake.id, files, { source });
      const newEntries = Array.isArray(result?.newEntries) ? result.newEntries : [];
      const combinedFromHandler = Array.isArray(result?.combined) ? result.combined : null;
      const imageUrlFromHandler = typeof result?.imageUrl === 'string' ? result.imageUrl : null;
      if (!newEntries.length && !combinedFromHandler) return;

      setEditSnakeDraft(prev => {
        if (!prev) return prev;
        const existing = normalizeSnakePhotos(prev.photos);
        const nextPhotos = combinedFromHandler || trimSnakePhotoList([...existing, ...newEntries]);
        const latestUrl = nextPhotos.length ? nextPhotos[nextPhotos.length - 1]?.url : null;
        return {
          ...prev,
          photos: nextPhotos,
          imageUrl: imageUrlFromHandler || latestUrl || prev.imageUrl,
        };
      });
    } catch (error) {
      console.error('Failed to add snake photos', error);
      showAppAlert(t('snakes.edit.photoUploadFailed', { defaultValue: 'Could not add those photos. Please try again.' }));
    } finally {
      setEditUploadingPhoto(false);
    }
  }, [editSnake?.id, handleAddSnakePhotos, showAppAlert, t]);

  const handleEditCameraInputChange = useCallback(async (event) => {
    const files = event?.target?.files;
    if (files && files.length) {
      await handleEditPhotoSelection(files, 'camera');
    }
    if (event?.target) {
      event.target.value = '';
    }
  }, [handleEditPhotoSelection]);

  const handleEditUploadInputChange = useCallback(async (event) => {
    const files = event?.target?.files;
    if (files && files.length) {
      await handleEditPhotoSelection(files, 'upload');
    }
    if (event?.target) {
      event.target.value = '';
    }
  }, [handleEditPhotoSelection]);

  const triggerEditCameraCapture = useCallback(() => {
    const el = editCameraInputRef.current;
    if (el) el.click();
  }, []);

  const triggerEditUploadPicker = useCallback(() => {
    const el = editUploadInputRef.current;
    if (el) el.click();
  }, []);

  const handleEditViewPictures = useCallback(() => {
    if (!editSnake?.id) return;
    handleOpenPhotoGallery(editSnake.id);
  }, [editSnake, handleOpenPhotoGallery]);

  function openNewPairingModal() {
    setDraft({
      maleId: "",
      femaleId: "",
      goals: [],
      notes: "",
      startDate: localYMD(new Date())
    });
    setMaleSearchQuery("");
    setFemaleSearchQuery("");
    setPairingSearchTarget("male");
    setPairingsView('active');
    setShowPairingModal(true);
  }

  const handleAdvisorSuggestionToPlan = useCallback((suggestion) => {
    if (!suggestion) return;
    const maleId = suggestion.maleId || "";
    const femaleId = suggestion.femaleId || "";
    if (!maleId || !femaleId) return;

    const maleSnake = snakeById(snakes, maleId);
    const femaleSnake = snakeById(snakes, femaleId);
    const maleName = maleSnake?.name || maleId;
    const femaleName = femaleSnake?.name || femaleId;
    const goalChance = Number.isFinite(suggestion?.goalProb) ? `${(suggestion.goalProb * 100).toFixed(1)}%` : null;
    const autoNoteParts = [
      t('advisor.convertedFromSuggestion', { defaultValue: 'Converted from Breeding Advisor suggestion.' }),
      suggestion?.rationale ? suggestion.rationale : null,
      goalChance
        ? t('advisor.convertedGoalChance', {
            defaultValue: 'Estimated goal probability: {{chance}}.',
            chance: goalChance,
          })
        : null,
    ].filter(Boolean);

    setDraft({
      maleId,
      femaleId,
      goals: [],
      notes: autoNoteParts.join(' ').trim(),
      startDate: localYMD(new Date()),
    });
    setMaleSearchQuery("");
    setFemaleSearchQuery("");
    setPairingSearchTarget(null);
    setPairingsView('active');
    setShowPairingModal(true);
  }, [setDraft, setFemaleSearchQuery, setMaleSearchQuery, setPairingSearchTarget, setPairingsView, setShowPairingModal, snakes, t]);

  const openSnakeCard = useCallback((snake) => {
    if (!snake) return;
    setReturnToGroupsAfterEdit(tab === 'animals' && animalView === 'groups');
    setTab('animals');
    setAnimalView(isFemaleSnake(snake) ? 'females' : 'males');
    setEditSnake(snake);
    setEditSnakeDraft(initSnakeDraft(snake));
  }, [animalView, tab]);

  const closeSnakeEditor = useCallback(() => {
    setEditSnake(null);
    setEditSnakeDraft(null);
    setEditForSalePublishError('');
    if (returnToGroupsAfterEdit) {
      setTab('animals');
      setAnimalView('groups');
      setReturnToGroupsAfterEdit(false);
    }
  }, [returnToGroupsAfterEdit]);

  const publishEditSnakeToMarketplace = useCallback(async () => {
    if (!editSnakeDraft || editForSalePublishing) return;
    setEditForSalePublishing(true);
    setEditForSalePublishError('');
    try {
      let existing = [];
      try {
        const data = await fetchMyListings();
        existing = Array.isArray(data?.listings) ? data.listings : [];
      } catch (_) {}
      if (!existing.some((l) => l.animalAppId === editSnakeDraft.id)) {
        const coverUrl = editSnakeDraft.imageUrl
          || (Array.isArray(editSnakeDraft.photos) && editSnakeDraft.photos.length
            ? editSnakeDraft.photos[editSnakeDraft.photos.length - 1]?.url || ''
            : '');
        const tokens = getDisplayedSnakeGeneticsTokens(editSnakeDraft);
        const geneticsStr = tokens.map((tok) =>
          typeof tok === 'string' ? tok : tok?.label || tok?.gene || tok?.name || ''
        ).filter(Boolean).join(', ');
        const newListing = {
          id: `listing-${Date.now()}`,
          animalAppId: editSnakeDraft.id,
          title: editSnakeDraft.name || 'Snake for sale',
          status: 'available',
          price: String(editSnakeDraft.price ?? ''),
          currency: editSnakeDraft.currency || 'EUR',
          description: editSnakeDraft.saleDescription || '',
          imageUrl: coverUrl,
          sex: editSnakeDraft.sex || '',
          hatchDate: editSnakeDraft.birthDate || '',
          genetics: geneticsStr,
        };
        await saveMyListings([...existing, newListing]);
      }
      const publishedAt = new Date().toISOString();
      setEditSnakeDraft(d => ({
        ...d,
        forSale: true,
        marketplacePublished: true,
        marketplacePublishedAt: d.marketplacePublishedAt || publishedAt,
      }));
      setSnakes(prev => prev.map(x => x.id === editSnakeDraft.id ? {
        ...x,
        forSale: true,
        marketplacePublished: true,
        marketplacePublishedAt: x.marketplacePublishedAt || publishedAt,
        price: editSnakeDraft.price || x.price,
        currency: editSnakeDraft.currency || x.currency,
      } : x));
    } catch (err) {
      setEditForSalePublishError(err instanceof Error ? err.message : 'Could not publish to Marketplace.');
    } finally {
      setEditForSalePublishing(false);
    }
  }, [editSnakeDraft, editForSalePublishing]);

  const requestDeleteSnake = useCallback((snake) => {
    if (!snake) return;
    setPendingDeleteSnake(snake);
  }, []);

  const openSnakeFromScan = useCallback((rawId, { silent = false } = {}) => {
    const normalizedId = typeof rawId === 'string' ? rawId.trim() : String(rawId ?? '').trim();
    if (!normalizedId) return null;
    const match = snakes.find(s => s.id === normalizedId);
    if (match) {
      openSnakeCard(match);
      return match;
    }
    if (!silent) {
      showAppAlert(`No snake found with ID: ${normalizedId}`);
    } else {
      console.warn(`No snake found with ID: ${normalizedId}`);
    }
    return null;
  }, [openSnakeCard, showAppAlert, snakes]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleOpenRelatedSnake = (event) => {
      const detail = event?.detail || {};
      const snakeId = typeof detail?.snakeId === 'string' ? detail.snakeId.trim() : String(detail?.snakeId || '').trim();
      const snakeDisplayId = typeof detail?.snakeDisplayId === 'string' ? detail.snakeDisplayId.trim() : String(detail?.snakeDisplayId || '').trim();
      const snakeName = typeof detail?.snakeName === 'string' ? detail.snakeName.trim() : String(detail?.snakeName || '').trim();

      if (snakeId) {
        const opened = openSnakeFromScan(snakeId, { silent: true });
        if (opened) return;
      }

      const fallback = snakes.find((snake) => {
        if (!snake) return false;
        const id = String(snake.id || '').trim();
        const displayId = String(snake.displayId || snake.display_id || snake.animalCode || '').trim();
        const name = String(snake.name || '').trim();
        if (snakeDisplayId && (displayId === snakeDisplayId || id === snakeDisplayId)) return true;
        if (snakeName && name && name.toLowerCase() === snakeName.toLowerCase()) return true;
        return false;
      });

      if (fallback) {
        openSnakeCard(fallback);
      } else if (snakeId || snakeDisplayId || snakeName) {
        const fallbackLabel = snakeName || snakeDisplayId || snakeId;
        showAppAlert(`No snake found for terminal item: ${fallbackLabel}`);
      }
    };

    window.addEventListener('lab:open-related-snake', handleOpenRelatedSnake);
    return () => {
      window.removeEventListener('lab:open-related-snake', handleOpenRelatedSnake);
    };
  }, [openSnakeCard, openSnakeFromScan, showAppAlert, snakes]);

  const handlePassiveScan = useCallback((payload) => {
    if (!isAnimalScannerView) return;
    const decoded = typeof payload === 'string' ? payload.trim() : String(payload ?? '').trim();
    if (!decoded) return;
    const result = openSnakeFromScan(decoded, { silent: true });
    setPassiveScanNotice({
      ts: Date.now(),
      type: result ? 'success' : 'error',
      text: result ? `Opened ${result.name || result.id}` : `No animal with ID ${decoded}`,
    });
  }, [isAnimalScannerView, openSnakeFromScan]);

  useHardwareScannerListener({
    enabled: isAnimalScannerView,
    onScan: handlePassiveScan,
    minLength: 3,
    maxKeyInterval: 200,
    maxScanDuration: 2500,
  });

  const passiveScannerStatus = passiveScanNotice?.type ?? 'idle';
  const passiveScannerLabel = passiveScanNotice?.text ?? 'Scanner ready';

  const performSnakeDeletion = useCallback((id) => {
    if (!id) return;
    setSnakes(prev => {
      const next = prev.filter(s => s.id !== id);
      if (!next.length) return createFreshSnakes();
      return next;
    });
    setPairings(prev => prev.filter(p => p.maleId !== id && p.femaleId !== id));
    if (editSnake && editSnake.id === id) {
      closeSnakeEditor();
    }
  }, [closeSnakeEditor, editSnake]);

  const confirmDeleteSnake = useCallback(() => {
    if (!pendingDeleteSnake) return;
    performSnakeDeletion(pendingDeleteSnake.id);
    setPendingDeleteSnake(null);
  }, [performSnakeDeletion, pendingDeleteSnake]);

  const cancelDeleteSnake = useCallback(() => {
    setPendingDeleteSnake(null);
  }, []);

  function findActivePairingForFemale(femaleId, ignorePairingId = null) {
    if (!femaleId) return null;
    return pairings.find(p => p && p.id !== ignorePairingId && p.femaleId === femaleId && !isPairingCompleted(p));
  }

  const buildPairingId = (yearLabel, maleLabel, femaleLabel, existingIds) => {
    const safeYear = String(yearLabel || 'Unknown Year').trim() || 'Unknown Year';
    const safeMale = String(maleLabel || 'Male').trim() || 'Male';
    const safeFemale = String(femaleLabel || 'Female').trim() || 'Female';
    const base = `${safeYear} ${safeMale} X ${safeFemale}`.replace(/\s+/g, ' ').trim();
    if (!existingIds.has(base)) return base;
    let counter = 2;
    let candidate = `${base} (${counter})`;
    while (existingIds.has(candidate)) {
      counter += 1;
      candidate = `${base} (${counter})`;
    }
    return candidate;
  };

  async function addPairingFromDraft() {
    const fId = draft.femaleId || '';
    const mId = draft.maleId || '';
    if (!fId || !mId) return;
    const femaleSnake = snakeById(snakes, fId);
    const maleSnake = snakeById(snakes, mId);
    const existingActive = findActivePairingForFemale(fId);
    if (existingActive) {
      const femaleLabel = femaleSnake?.name || fId;
      const blockerLabel = existingActive.label || existingActive.id || t('pairing.existingPairing', { defaultValue: 'existing pairing' });
      await showAppAlert(t('pairing.femaleAlreadyPaired', {
        defaultValue: '{{female}} is already assigned to {{pairing}}. Change or delete that pairing before creating another.',
        female: femaleLabel,
        pairing: blockerLabel,
      }));
      setShowPairingModal(false);
      setTab('pairings');
      setFocusedPairingId(existingActive.id || null);
      return;
    }
    const femaleName = femaleSnake?.name || 'Female';
    const maleName = maleSnake?.name || 'Male';
    const autoLabel = `${femaleName} × ${maleName}`;
    const yearLabel = extractYearFromDateString(draft.startDate) || new Date().getFullYear();
    const basePairing = {
      femaleId: fId,
      maleId: mId,
      label: autoLabel,
      startDate: draft.startDate,
      lockObserved: false,
      goals: draft.goals || [],
      notes: draft.notes || '',
      appointments: genMonthlyAppointments(draft.startDate, 5),
    };
    if (basePairing.appointments && basePairing.appointments.length) {
      basePairing.startDate = basePairing.appointments[0].date;
    }

    let newPairingId = '';
    setPairings(prev => {
      const existingIds = new Set(prev.map(pairing => pairing?.id).filter(Boolean));
      const generatedId = buildPairingId(yearLabel, maleName, femaleName, existingIds);
      newPairingId = generatedId;
      const pairingWithId = { ...basePairing, id: generatedId };
      return [...prev, withPairingLifecycleDefaults(pairingWithId)];
    });
    setShowPairingModal(false);
    setTab('pairings');
    setFocusedPairingId(newPairingId);
  }

  async function addAnimalFromForm() {
    const sex = ensureSex(newAnimal.sex, 'F');
    const resolvedMorphHetInput = await resolveLeucisticInText(newAnimal.morphHetInput || '', 'Add Animal save');
    const parsedMorphHet = splitMorphHetInput(resolvedMorphHetInput || '');
    const rawMorphList = Array.isArray(newAnimal.morphs)
      ? newAnimal.morphs.map(entry => String(entry).trim()).filter(Boolean)
      : parsedMorphHet.morphs;
    const rawHetList = Array.isArray(newAnimal.hets)
      ? newAnimal.hets.map(entry => String(entry).trim()).filter(Boolean)
      : parsedMorphHet.hets;
    const normalizedGenetics = normalizeMorphHetLists([...(rawMorphList || []), ...(rawHetList || [])]);
    const morphList = normalizedGenetics.morphs;
    const hetList = normalizedGenetics.hets;
    const existingIds = snakes.map(snake => snake.id);
    const normalizedBirthDate = normalizeBirthDateValue(newAnimal.birthDate || null);
    const birthYear = extractYearFromDateString(normalizedBirthDate);
    const numericYear = Number(newAnimal.year);
    const fallbackYear = Number.isFinite(numericYear) && numericYear > 0
      ? numericYear
      : new Date().getFullYear();
    const derivedYear = birthYear ?? fallbackYear;

    let resolvedId = (newAnimal.id || '').toString().trim();
    const hasManualId = newAnimal.autoId === false && resolvedId.length > 0;
    if (hasManualId) {
      if (existingIds.includes(resolvedId)) {
        let counter = 2;
        let candidate = `${resolvedId}-${counter}`;
        while (existingIds.includes(candidate)) {
          counter += 1;
          candidate = `${resolvedId}-${counter}`;
        }
        resolvedId = candidate;
      }
    } else {
      resolvedId = generateSnakeId(
        newAnimal.name,
        derivedYear,
        snakes,
        null,
        {
          idConfig: breederInfo?.idGenerator,
          sex,
          morphs: morphList,
          hets: hetList,
          birthYear,
        }
      );
    }

    let idSequence = Number(newAnimal.idSequence);
    if (!Number.isFinite(idSequence) || idSequence <= 0) {
      idSequence = extractSequenceFromId(resolvedId, breederInfo?.idGenerator) || null;
    }

    const groupList = normalizeSingleGroupValue(newAnimal.groups);
    const draftPhotos = normalizeSnakePhotos(newAnimal.photos);
    const coverImage = newAnimal.imageUrl?.trim()
      || (draftPhotos.length ? draftPhotos[draftPhotos.length - 1].url : undefined);
    const normalizedStatus = (newAnimal.status || '').trim() || 'Active';

    const snake = {
      id: resolvedId,
      name: newAnimal.name.trim() || resolvedId || (sex === 'F' ? 'New Female' : 'New Male'),
      sex,
      morphs: morphList,
      hets: hetList,
      weight: Number(newAnimal.weight) || 0,
      price: String(newAnimal.price || '').trim(),
      year: derivedYear,
      birthDate: normalizedBirthDate || null,
      notes: String(newAnimal.notes || '').trim(),
      tags: [],
      groups: groupList,
      status: normalizedStatus,
      morphHetInput: resolvedMorphHetInput,
      imageUrl: coverImage,
      photos: draftPhotos,
      logs: cloneLogs(newAnimal.logs),
      idSequence: Number.isFinite(idSequence) && idSequence > 0 ? idSequence : null,
      isDemo: false,
    };

    setSnakes(prev => {
      const base = prev.filter(entry => !entry.isDemo);
      return [...base, snake];
    });
    setGroups(prev => Array.from(new Set([...(prev || []), ...(snake.groups || [])])));
    setShowAddModal(false);
    setNewAnimal(createEmptyNewAnimalDraft());
  }

  async function runImportPreview() {
    const text = String(importText || '').replace(/Ball Python\s*\(Python regius\)/ig, '');
    let parsed = parseFourLineBlocks(text);

    if (!parsed.length) {
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      parsed = lines.map(line => parseOneLineSnake(line)).filter(Boolean).map(item => {
        const morphs = [];
        const hets = [];
        (item.genetics || []).forEach(gene => {
          const lower = String(gene).toLowerCase();
          if (/^het\b|\bhet\b|^66%|^50%|possible/i.test(lower)) hets.push(gene);
          else morphs.push(gene);
        });
        return {
          name: item.name,
          id: item.id || '',
          sex: ensureSex(item.gender && item.gender[0], 'F'),
          morphs,
          hets,
        };
      });
    }

    if (!parsed.length) parsed = parsePipeSeparatedLines(text);
    if (!parsed.length) parsed = parseReptileBuddyText(text);

    const normalizedRows = parsed.map(item => {
      const normalized = normalizeMorphHetLists([
        ...(item.morphs || []),
        ...(item.hets || []),
        ...(item.genetics || []),
      ]);
      const sex = ensureSex(item.sex || item.gender, 'F');
      return {
        ...item,
        sex,
        morphs: normalized.morphs,
        hets: normalized.hets,
      };
    });

    const resolvedRows = [];
    for (const row of normalizedRows) {
      const resolved = await resolveLeucisticInMorphHetLists(row.morphs || [], row.hets || [], 'Import preview genetics');
      const resolvedRow = {
        ...row,
        morphs: resolved?.morphs || row.morphs || [],
        hets: resolved?.hets || row.hets || [],
      };
      resolvedRows.push({ ...resolvedRow, previewText: formatParsedPreview(resolvedRow) });
    }

    setImportPreview(resolvedRows);
  }

  function applyImport() {
    const existingKeySet = new Set(
      snakes.map(snake => `${(snake.name || '').trim().toLowerCase()}|${ensureSex(snake.sex, 'F')}`)
    );
    const existingIds = snakes.map(snake => snake.id).filter(Boolean);
    const existingRecords = snakes.map(snake => ({ id: snake.id, idSequence: snake.idSequence }));
    const canonicalGroupMap = new Map((groups || []).map(label => [String(label).trim().toLowerCase(), label]));

    const normalizeImportedGroup = (label) => {
      const trimmed = String(label || '').trim();
      if (!trimmed) return null;
      const key = trimmed.toLowerCase();
      if (canonicalGroupMap.has(key)) return canonicalGroupMap.get(key);
      canonicalGroupMap.set(key, trimmed);
      return trimmed;
    };

    const normalizedToAdd = [];
    for (const preview of importPreview || []) {
      const converted = convertParsedToSnake(
        { ...preview, __existingIds: existingIds, __existingRecords: existingRecords },
        breederInfo?.idGenerator
      );
      const sex = ensureSex(converted.sex, 'F');
      const nameKey = (converted.name || '').trim().toLowerCase();
      const compositeKey = `${nameKey}|${sex}`;
      if (existingKeySet.has(compositeKey)) continue;
      existingKeySet.add(compositeKey);
      existingIds.push(converted.id);
      existingRecords.push({ id: converted.id, idSequence: converted.idSequence });
      const normalizedGroups = normalizeSingleGroupValue(
        (converted.groups || []).map(normalizeImportedGroup).filter(Boolean)
      );
      normalizedToAdd.push({ ...converted, sex, groups: normalizedGroups, isDemo: false });
    }

    if (normalizedToAdd.length) {
      setSnakes(prev => {
        const base = prev.filter(snake => !snake.isDemo);
        return [...base, ...normalizedToAdd];
      });
      const newGroups = Array.from(new Set(normalizedToAdd.flatMap(snake => snake.groups || [])));
      if (newGroups.length) {
        setGroups(prev => Array.from(new Set([...(prev || []), ...newGroups])));
      }
    }

    setImportText('');
    setImportPreview([]);
    setTab('animals');
    setAnimalView('all');
    setShowImportModal(false);
  }

    const openHatchWizardForPayload = useCallback((payload) => {
      if (!payload || !payload.pairing || !payload.count || payload.count <= 0) return;
      const pairing = withPairingLifecycleDefaults({ ...payload.pairing });
      const hatchedOn = payload.hatchedDate || localYMD(new Date());
      const parsedDate = parseYmd(hatchedOn) || new Date();
      const year = Number.isFinite(parsedDate.getFullYear()) ? parsedDate.getFullYear() : new Date().getFullYear();
      const sire = snakeById(snakes, pairing?.maleId);
      const dam = snakeById(snakes, pairing?.femaleId);
      const pairingName = `${dam?.name || 'Dam'} × ${sire?.name || 'Sire'}`;
      const baseExistingRecords = snakes.map(s => ({ id: s.id, idSequence: s.idSequence }));
      const idsInUse = new Set(baseExistingRecords.map(record => record.id));
      const recordsInUse = baseExistingRecords.map(record => ({ ...record }));
      const configClone = breederInfo?.idGenerator ? { ...breederInfo.idGenerator } : null;

      const entries = Array.from({ length: payload.count }, (_, idx) => {
        const sequenceLabel = payload.existingCount + idx + 1;
        const defaultName = `Hatchling ${sequenceLabel} (${pairingName})`;
        const generatedId = generateSnakeId(
          defaultName,
          year,
          recordsInUse,
          null,
          {
            idConfig: configClone,
            sex: 'F',
            morphs: [],
            hets: [],
            birthYear: year,
          }
        );
        idsInUse.add(generatedId);
        const seqValue = extractSequenceFromId(generatedId, configClone);
        recordsInUse.push({ id: generatedId, idSequence: seqValue });
        return {
          id: generatedId,
          autoId: true,
          name: defaultName,
          sex: 'F',
          morph: '',
          weight: '',
          birthDate: hatchedOn,
          idSequence: seqValue,
        };
      });

      setHatchWizard({
        pairingId: pairing.id,
        pairing,
        entries,
        currentIndex: 0,
        hatchedDate: hatchedOn,
        total: payload.count,
        existingCount: payload.existingCount,
        previousHatch: payload.previousHatch || pairing.hatch,
        context: {
          pairingName,
          sireName: sire?.name || '',
          damName: dam?.name || '',
          groupName: `Hatchlings ${year}`,
          year,
          idConfig: configClone,
          existingIdsBase: baseExistingRecords.map(record => record.id),
          existingRecordsBase: baseExistingRecords,
        },
      });
    }, [snakes, breederInfo]);

    const regenerateWizardIdInState = useCallback((state, index, sexOverride) => {
      if (!state) return state;
      const entries = Array.isArray(state.entries) ? state.entries : [];
      if (!entries[index]) return state;
      const context = state.context || {};
      const baseIds = Array.isArray(context.existingIdsBase) ? context.existingIdsBase.map(id => String(id || '').trim()).filter(Boolean) : [];
      const idsInUse = new Set(baseIds);
      const baseRecordsRaw = Array.isArray(context.existingRecordsBase) ? context.existingRecordsBase : [];
      const baseRecords = baseRecordsRaw
        .map(record => {
          if (!record) return null;
          if (typeof record === 'string') {
            const id = record;
            return { id, idSequence: extractSequenceFromId(id, context.idConfig) };
          }
          const id = record.id != null ? String(record.id) : '';
          if (!id) return null;
          const seqValue = Number(record.idSequence);
          const normalizedSeq = Number.isFinite(seqValue) && seqValue > 0
            ? Math.floor(seqValue)
            : extractSequenceFromId(id, context.idConfig);
          return { id, idSequence: normalizedSeq };
        })
        .filter(Boolean);
      const recordsInUse = baseRecords.map(record => ({ ...record }));
      entries.forEach((entry, idx) => {
        if (idx === index) return;
        const trimmed = String(entry?.id || '').trim();
        if (trimmed) {
          idsInUse.add(trimmed);
          const seqCandidate = Number(entry?.idSequence);
          const derivedSeq = Number.isFinite(seqCandidate) && seqCandidate > 0
            ? Math.floor(seqCandidate)
            : extractSequenceFromId(trimmed, context.idConfig);
          recordsInUse.push({ id: trimmed, idSequence: derivedSeq });
        }
      });
      const baseName = entries[index].name || context.pairingName || `Hatchling ${index + 1}`;
      const sex = ensureSex(sexOverride ?? entries[index].sex, 'F');
      const entryBirthYear = extractYearFromDateString(entries[index].birthDate);
      const derivedYear = entryBirthYear ?? context.year ?? new Date().getFullYear();
      const candidate = generateSnakeId(
        baseName,
        derivedYear,
        recordsInUse,
        null,
        {
          idConfig: context.idConfig,
          sex,
          morphs: [],
          hets: [],
          birthYear: entryBirthYear ?? derivedYear,
        }
      );
      if (!candidate) return state;
      const sequenceValue = extractSequenceFromId(candidate, context.idConfig);
      const nextEntries = entries.map((entry, idx) => idx === index ? { ...entry, id: candidate, autoId: true, idSequence: sequenceValue } : entry);
      return { ...state, entries: nextEntries };
    }, []);

    const updateHatchWizardEntry = useCallback((index, updates) => {
      setHatchWizard(prev => {
        if (!prev) return prev;
        const entries = Array.isArray(prev.entries) ? prev.entries : [];
        if (index < 0 || index >= entries.length) return prev;
        const nextEntries = entries.map((entry, idx) => {
          if (idx !== index) return entry;
          const nextEntry = { ...entry, ...updates };
          if (!Object.prototype.hasOwnProperty.call(updates, 'autoId') && Object.prototype.hasOwnProperty.call(updates, 'id')) {
            nextEntry.autoId = false;
          }
          return nextEntry;
        });
        return { ...prev, entries: nextEntries };
      });
    }, []);

    const handleWizardIdChange = useCallback((index, value) => {
      updateHatchWizardEntry(index, { id: value });
    }, [updateHatchWizardEntry]);

    const handleWizardMorphChange = useCallback((index, value) => {
      updateHatchWizardEntry(index, { morph: value });
    }, [updateHatchWizardEntry]);

    const handleWizardWeightChange = useCallback((index, value) => {
      updateHatchWizardEntry(index, { weight: value });
    }, [updateHatchWizardEntry]);

    const handleWizardBirthDateChange = useCallback((index, value) => {
      setHatchWizard(prev => {
        if (!prev) return prev;
        const entries = Array.isArray(prev.entries) ? prev.entries : [];
        if (index < 0 || index >= entries.length) return prev;
        const normalized = value ? normalizeDateInput(value) || value : '';
        const nextEntries = entries.map((entry, idx) =>
          idx === index ? { ...entry, birthDate: normalized } : entry
        );
        let nextState = { ...prev, entries: nextEntries };
        if (entries[index]?.autoId) {
          nextState = regenerateWizardIdInState(nextState, index, nextEntries[index].sex);
        }
        return nextState;
      });
    }, [regenerateWizardIdInState]);

    const handleWizardSexChange = useCallback((index, value) => {
      const normalized = ensureSex(value, 'F');
      setHatchWizard(prev => {
        if (!prev) return prev;
        const entries = Array.isArray(prev.entries) ? prev.entries : [];
        if (index < 0 || index >= entries.length) return prev;
        const wasAuto = !!entries[index]?.autoId;
        const nextEntries = entries.map((entry, idx) => idx === index ? { ...entry, sex: normalized } : entry);
        let nextState = { ...prev, entries: nextEntries };
        if (wasAuto) {
          nextState = regenerateWizardIdInState(nextState, index, normalized);
        }
        return nextState;
      });
    }, [regenerateWizardIdInState]);

    const handleWizardRegenerateId = useCallback((index) => {
      setHatchWizard(prev => regenerateWizardIdInState(prev, index, prev?.entries?.[index]?.sex));
    }, [regenerateWizardIdInState]);

    const handleWizardPrev = useCallback(() => {
      setHatchWizard(prev => {
        if (!prev) return prev;
        const prevIndex = Math.max(0, (prev.currentIndex || 0) - 1);
        if (prevIndex === prev.currentIndex) return prev;
        return { ...prev, currentIndex: prevIndex };
      });
    }, []);

    const handleWizardCancel = useCallback(() => {
      setHatchWizard(null);
    }, []);

    const handleWizardSaveCurrent = useCallback(() => {
      setHatchWizard(prev => {
        if (!prev) return prev;
        const entries = Array.isArray(prev.entries) ? prev.entries : [];
        if (!entries.length) return null;
        const currentIndex = Math.min(entries.length - 1, Math.max(0, prev.currentIndex || 0));
        const entry = entries[currentIndex];
        if (!entry) return prev;
        if (entry.saved) {
          const nextIndex = Math.min(entries.length - 1, currentIndex + 1);
          return nextIndex === currentIndex ? null : { ...prev, currentIndex: nextIndex };
        }
        const context = prev.context || {};
        const pairing = prev.pairing || null;
        const hatchedOn = prev.hatchedDate || localYMD(new Date());
        const baseGroup = context.groupName || null;
        const savedIds = entries
          .map(item => item?.savedId || (item?.saved ? item?.id : ''))
          .filter(Boolean)
          .map(id => String(id));
        const existingIds = new Set([...snakes.map(s => s.id), ...savedIds]);
        const existingRecords = [
          ...snakes.map(s => ({ id: s.id, idSequence: s.idSequence })),
          ...savedIds.map(id => ({ id, idSequence: extractSequenceFromId(id, breederInfo?.idGenerator) })),
        ];
        const fallbackName = entry.name || context.pairingName || `Hatchling ${currentIndex + 1}`;
        const sex = ensureSex(entry.sex, 'F');
        let resolvedId = String(entry.id || '').trim();
        const rawBirthValue = entry.birthDate || hatchedOn;
        const normalizedBirthDate = rawBirthValue ? normalizeDateInput(rawBirthValue) || rawBirthValue : '';
        const entryBirthYear = extractYearFromDateString(normalizedBirthDate || rawBirthValue);
        const yearBase = entryBirthYear ?? context.year ?? new Date().getFullYear();
        if (!resolvedId) {
          resolvedId = generateSnakeId(
            fallbackName,
            yearBase,
            existingRecords,
            null,
            { idConfig: context.idConfig, sex, morphs: [], hets: [], birthYear: entryBirthYear ?? yearBase }
          );
        }
        if (!resolvedId) return prev;
        if (existingIds.has(resolvedId)) {
          let suffix = 2;
          let candidate = `${resolvedId}-${suffix}`;
          while (existingIds.has(candidate)) {
            suffix += 1;
            candidate = `${resolvedId}-${suffix}`;
          }
          resolvedId = candidate;
        }
        const idSequence = extractSequenceFromId(resolvedId, breederInfo?.idGenerator);
        const birthDateRaw = normalizedBirthDate || rawBirthValue;
        const parsedBirth = parseYmd(birthDateRaw);
        const derivedYear = parsedBirth && Number.isFinite(parsedBirth.getFullYear())
          ? parsedBirth.getFullYear()
          : yearBase;
        const { morphs, hets } = splitMorphHetInput(entry.morph || '');
        const grams = Number(entry.weight);
        const weight = Number.isFinite(grams) && grams >= 0 ? grams : 0;
        const created = {
          id: resolvedId,
          name: fallbackName,
          sex,
          morphs,
          hets,
          weight,
          year: derivedYear,
          birthDate: birthDateRaw,
          pairingId: pairing?.id || prev.pairingId || null,
          sireId: pairing?.maleId || null,
          damId: pairing?.femaleId || null,
          tags: ['hatchling'],
          groups: baseGroup ? normalizeSingleGroupValue(baseGroup) : [],
          status: 'Active',
          imageUrl: undefined,
          logs: cloneLogs(),
          idSequence,
          isDemo: false,
        };

        if (created.id) {
          setSnakes(prevSnakes => {
            const base = prevSnakes.filter(s => !s.isDemo);
            if (base.some(s => s.id === created.id)) return base;
            return [...base, created];
          });
          if (baseGroup) {
            setGroups(prevGroups => (prevGroups.includes(baseGroup) ? prevGroups : [...prevGroups, baseGroup]));
          }
        }

        const nextEntries = entries.map((item, idx) => idx === currentIndex
          ? { ...item, id: resolvedId, idSequence, saved: true, savedId: resolvedId }
          : item
        );
        const savedCount = nextEntries.filter(item => item?.saved).length;
        if (currentIndex >= entries.length - 1) {
          showAppAlert(`${savedCount} hatchlings added${baseGroup ? ` to ${baseGroup}` : ''}.`);
          return null;
        }
        return { ...prev, entries: nextEntries, currentIndex: currentIndex + 1 };
      });
  }, [snakes, setSnakes, setGroups, breederInfo, showAppAlert]);

  const handleGenerateIdForEditSnake = useCallback(() => {
    setEditSnakeDraft(draft => {
      if (!draft) return draft;
      const currentId = String(draft.id || '').trim();
      if (currentId) return draft;
      const existingRecords = snakes
        .filter(s => s && s.id !== editSnake?.id)
        .map(s => ({ id: s.id, idSequence: s.idSequence }));
      const derivedYear = Number(draft.year) || (draft.birthDate ? (parseYmd(draft.birthDate)?.getFullYear() || new Date().getFullYear()) : new Date().getFullYear());
      const draftBirthYear = draft.birthDate ? extractYearFromDateString(draft.birthDate) : null;
      const forcedSequence = Number(draft.idSequence);
      const sequenceOverride = Number.isFinite(forcedSequence) && forcedSequence > 0 ? Math.floor(forcedSequence) : null;
      const generatedId = generateSnakeId(
        draft.name,
        derivedYear,
        existingRecords,
        null,
        {
          idConfig: breederInfo?.idGenerator,
          sex: draft.sex || 'U',
          morphs: draft.morphs || [],
          hets: draft.hets || [],
          birthYear: draftBirthYear ?? derivedYear,
          forceSequence: sequenceOverride,
        }
      );
      if (!generatedId) return draft;
      const generatedSequence = extractSequenceFromId(generatedId, breederInfo?.idGenerator);
      return {
        ...draft,
        id: generatedId,
        idSequence: generatedSequence ?? (sequenceOverride ?? draft.idSequence ?? null),
        autoId: true,
      };
    });
  }, [snakes, editSnake, breederInfo]);

  const handleUpdateIdForEditSnake = useCallback(() => {
    setEditSnakeDraft(draft => {
      if (!draft) return draft;
      const existingRecords = snakes
        .filter(s => s && s.id !== editSnake?.id)
        .map(s => ({ id: s.id, idSequence: s.idSequence }));
      const derivedYear = Number(draft.year) || (draft.birthDate ? (parseYmd(draft.birthDate)?.getFullYear() || new Date().getFullYear()) : new Date().getFullYear());
      const draftBirthYear = draft.birthDate ? extractYearFromDateString(draft.birthDate) : null;
      const forcedSequence = Number(draft.idSequence);
      const sequenceOverride = Number.isFinite(forcedSequence) && forcedSequence > 0 ? Math.floor(forcedSequence) : null;
      const generatedId = generateSnakeId(
        draft.name,
        derivedYear,
        existingRecords,
        null,
        {
          idConfig: breederInfo?.idGenerator,
          sex: draft.sex || 'U',
          morphs: draft.morphs || [],
          hets: draft.hets || [],
          birthYear: draftBirthYear ?? derivedYear,
          forceSequence: sequenceOverride,
        }
      );
      if (!generatedId) return draft;
      const generatedSequence = extractSequenceFromId(generatedId, breederInfo?.idGenerator);
      return {
        ...draft,
        id: generatedId,
        idSequence: generatedSequence ?? (sequenceOverride ?? draft.idSequence ?? null),
        autoId: true,
      };
    });
  }, [snakes, editSnake, breederInfo]);

  const handleUpdatePairing = useCallback(async (pairingId, updater) => {
    let hatchPayload = null;
    let conflictInfo = null;
    setPairings(prev => {
      const updated = prev.map(p => {
        if (p.id !== pairingId) return p;
        const current = withPairingLifecycleDefaults({ ...p });
        const nextRaw = typeof updater === 'function' ? updater(current) : updater;
        const merged = withPairingLifecycleDefaults({ ...current, ...(nextRaw || {}) });
        merged.id = p.id;

        if (merged.femaleId) {
          const blocking = prev.find(other => (
            other &&
            other.id !== pairingId &&
            other.femaleId === merged.femaleId &&
            !isPairingCompleted(other)
          ));
          if (blocking) {
            conflictInfo = { femaleId: merged.femaleId, blockingPairing: blocking };
            return p;
          }
        }

        const previousCount = current?.hatch?.recorded ? Number(current.hatch.hatchedCount || 0) : 0;
        const newCount = merged?.hatch?.recorded ? Number(merged.hatch.hatchedCount || 0) : 0;
        const delta = merged?.hatch?.recorded ? Math.max(0, newCount - previousCount) : 0;
        if (delta > 0) {
          hatchPayload = {
            pairing: { ...current, ...merged },
            count: delta,
            hatchedDate: merged.hatch.date,
            existingCount: previousCount,
            previousHatch: { ...current.hatch },
          };
        }
        return merged;
      });
      if (conflictInfo) {
        return prev;
      }
      return autoAdjustAllPairingAppointments(updated);
    });
    if (conflictInfo) {
      const femaleSnake = snakeById(snakes, conflictInfo.femaleId);
      const femaleLabel = femaleSnake?.name || conflictInfo.femaleId || t('pairing.femaleFallback', { defaultValue: 'This female' });
      const blockerLabel = conflictInfo.blockingPairing?.label || conflictInfo.blockingPairing?.id || t('pairing.existingPairing', { defaultValue: 'existing pairing' });
      await showAppAlert(t('pairing.femaleAlreadyPaired', {
        defaultValue: '{{female}} is already assigned to {{pairing}}. Change or delete that pairing before creating another.',
        female: femaleLabel,
        pairing: blockerLabel,
      }));
      setTab('pairings');
      setFocusedPairingId(conflictInfo.blockingPairing?.id || null);
      return;
    }
    if (hatchPayload) {
      openHatchWizardForPayload(hatchPayload);
    }
  }, [setPairings, openHatchWizardForPayload, snakes, t, setTab, setFocusedPairingId, showAppAlert]);

  const handleGeneratePairingQrLabels = useCallback(async (targetPairings) => {
    if (!Array.isArray(targetPairings) || !targetPairings.length) {
      await showAppAlert('Select at least one pairing to export.');
      return;
    }
    try {
      await exportPairingQrLabels(targetPairings, { snakes, breederInfo });
    } catch (error) {
      console.error('Failed to export pairing QR labels', error);
      await showAppAlert('Unable to build the pairing QR labels. Please try again.');
    }
  }, [snakes, breederInfo, showAppAlert]);

  const handleAdvisorPairingExport = useCallback(async () => {
    try {
      const dataset = buildPairingMatrixExportDataset(pairings, snakes, {});
      const rowCount = Array.isArray(dataset?.rows) ? dataset.rows.length : 0;
      if (!rowCount) {
        if (typeof showAppAlert === 'function') {
          await showAppAlert('No pairings available to export.');
        }
        return;
      }
      const safeStamp = new Date().toISOString().replace(/[:.]/g, '-');
      await exportDatasetToCsv(dataset, {
        fileName: `pairings-by-male-${safeStamp}.csv`,
      });
    } catch (error) {
      console.error('Breeding advisor pairing export failed', error);
      if (typeof showAppAlert === 'function') {
        await showAppAlert(error?.message || 'Failed to export pairings.');
      }
    }
  }, [pairings, snakes, showAppAlert]);

  return (
    <div
      className="app-root w-full min-h-screen"
      data-background-mode={resolvedAppearance?.backgroundMode === 'logo' ? 'logo' : 'solid'}
      style={{ ...appRootStyle, '--breeder-logo-bg': breederLogoBackground }}
    >
      {appDialogOverlay}
      {/* header */}
      <div className="px-5 py-4 border-b bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3 min-w-0">
              {breederInfo.logoUrl ? (
                <img src={breederInfo.logoUrl} alt="logo" className="w-16 h-16 rounded-full object-cover border shadow-sm" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center text-sm text-neutral-400 border shadow-sm">Logo</div>
              )}
              <div className="min-w-0">
                <div className="text-[28px] leading-tight font-semibold tracking-tight text-[#3c1b73]">{t("app.title")}</div>
                <div className="text-sm text-[#8257b1] truncate">{breederInfo.businessName ? `${breederInfo.businessName} | ${breederInfo.name || ''}` : (breederInfo.name || '')}</div>
              </div>
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <TabButton theme={theme} active={tab==="animals"} onClick={()=>setTab("animals")} className="header-nav-button">{t("nav.animals", { defaultValue: "Animals" })}</TabButton>
                <TabButton theme={theme} active={tab==="spaces"} onClick={()=>setTab("spaces")} className="header-nav-button">{t("nav.spaces", { defaultValue: "Spaces" })}</TabButton>
                <TabButton theme={theme} active={tab==="pairings"} onClick={()=>setTab("pairings")} className="header-nav-button">{t("nav.pairings", { defaultValue: "Breeding Planner" })}</TabButton>
                <TabButton theme={theme} active={tab==="advisor"} onClick={()=>setTab("advisor")} className="header-nav-button">{t("nav.advisor", { defaultValue: "Breeding Advisor" })}</TabButton>
                <TabButton theme={theme} active={tab==="shedTerminal"} onClick={()=>setTab("shedTerminal")} className="header-nav-button">{t("nav.shedTerminal", { defaultValue: "Shed Test Terminal" })}</TabButton>
                <TabButton theme={theme} active={tab==="calendar"} onClick={()=>setTab("calendar")} className="header-nav-button">{t("nav.calendar", { defaultValue: "Calendar" })}</TabButton>
                <TabButton theme={theme} active={tab==="setup"} onClick={()=>setTab("setup")} className="header-nav-button">{t("nav.setup", { defaultValue: "Settings" })}</TabButton>
                <TabButton theme={theme} active={tab==="familyTree"} onClick={()=>setTab("familyTree")} className="header-nav-button">{t("nav.familyTree", { defaultValue: "Family Tree" })}</TabButton>
              </div>
              <div className="w-full min-w-[230px] sm:w-auto">
                <div className="header-search-shell">
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={t("header.search")}
                    className="header-search-input w-full pr-11"
                  />
                  {query ? (
                    <button
                      type="button"
                      className="header-search-clear"
                      onClick={() => setQuery("")}
                      aria-label={t("filters.clear", { defaultValue: "Clear" })}
                      title={t("filters.clear", { defaultValue: "Clear" })}
                    >
                      x
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="max-w-7xl mx-auto p-5">
        {tab === "animals" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <TabButton theme={theme} active={animalView === "all"} onClick={()=>handleAnimalViewTabChange("all")}>{t("filters.all")}</TabButton>
                <TabButton theme={theme} active={animalView === "males"} onClick={()=>handleAnimalViewTabChange("males")}>{t("filters.males")}</TabButton>
                <TabButton theme={theme} active={animalView === "females"} onClick={()=>handleAnimalViewTabChange("females")}>{t("filters.females")}</TabButton>
                <TabButton theme={theme} active={animalView === "groups"} onClick={()=>handleAnimalViewTabChange("groups")}>{t("filters.groups")}</TabButton>
              </div>
              {animalView !== "groups" && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 border rounded-xl bg-white px-1 py-1 text-xs shadow-sm">
                    <button
                      type="button"
                      className={cx(
                        'px-2 py-1 rounded-lg font-medium transition-colors',
                        animalLayout === 'cards'
                          ? 'bg-sky-500 text-white shadow'
                          : 'text-neutral-600 hover:text-neutral-900'
                      )}
                      aria-pressed={animalLayout === 'cards'}
                      onClick={() => handleAnimalLayoutChange('cards')}
                    >
                      {t('ui.listControls.cards', { defaultValue: 'Cards' })}
                    </button>
                    <button
                      type="button"
                      className={cx(
                        'px-2 py-1 rounded-lg font-medium transition-colors',
                        animalLayout === 'list'
                          ? 'bg-sky-500 text-white shadow'
                          : 'text-neutral-600 hover:text-neutral-900'
                      )}
                      aria-pressed={animalLayout === 'list'}
                      onClick={() => handleAnimalLayoutChange('list')}
                    >
                      {t('ui.listControls.list', { defaultValue: 'List' })}
                    </button>
                  </div>
                  {animalLayout === 'list' && (
                    <button
                      type="button"
                      className={cx(
                        'px-3 py-2 rounded-xl text-xs sm:text-sm border bg-white font-medium transition-colors',
                        activeAnimalList.length ? 'hover:border-sky-500 hover:text-sky-700' : 'opacity-60 cursor-not-allowed'
                      )}
                      onClick={() => {
                        // Animal list export entry point
                        handleListExportCsv();
                      }}
                      disabled={!activeAnimalList.length}
                    >
                      {t('ui.listControls.exportListCsv', { defaultValue: 'Export list CSV' })}
                    </button>
                  )}
                </div>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {isAnimalScannerView && (
                  <div
                    className={cx(
                      'px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 border transition-colors',
                      passiveScannerStatus === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : passiveScannerStatus === 'error'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                    )}
                  >
                    <span
                      className={cx(
                        'w-2 h-2 rounded-full',
                        passiveScannerStatus === 'success'
                          ? 'bg-emerald-500 animate-pulse'
                          : passiveScannerStatus === 'error'
                            ? 'bg-amber-500'
                            : 'bg-sky-500 animate-pulse'
                      )}
                    />
                    <span>{passiveScannerLabel}</span>
                  </div>
                )}
                <button onClick={()=>setShowExportModal(true)} className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}>{t("actions.exportQr")}</button>
                <button onClick={()=>setShowScanner(true)} className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}>{t("actions.scanQr")}</button>
                <button
                  onClick={() => {
                    setNewAnimal(createEmptyNewAnimalDraft());
                    setShowAddModal(true);
                  }}
                  className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}
                >
                  + {t("actions.addAnimal")}
                </button>
                <button onClick={() => setShowImportModal(true)} className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}>{t("actions.importAnimals")}</button>
              </div>
            </div>
            {animalLayout === 'list' && listExportFeedback && (
              <div className={cx(
                'text-xs',
                listExportFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'
              )}>
                {listExportFeedback.message}
                {listExportFeedback.timestamp ? ` — ${formatDateTimeForDisplay(listExportFeedback.timestamp)}` : ''}
              </div>
            )}

            {animalView === "groups" ? (
              <GroupsSection
                groups={groups}
                setGroups={setGroups}
                snakes={snakes}
                theme={theme}
                onOpenSnake={openSnakeCard}
                onDeleteGroup={(g)=>{
                  const inUse = snakes.some(s => (s.groups||[]).includes(g));
                  if (inUse) {
                    showAppAlert("Group in use by some snakes. Remove from those snakes first.");
                    return;
                  }
                  setGroups(prev => prev.filter(x=>x!==g));
                  if (groupFilter === g) setGroupFilter("all");
                }}
              />
            ) : (
              <Card title={animalsCardTitle}>
                <div className="mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t("snakeEdit.tag")}</span>
                    {statusTagOptions.length > 0 && (
                      <span className="text-[11px] text-neutral-500">
                        {selectedStatusTags.length ? selectedStatusTags[0] : t("filters.all")}
                      </span>
                    )}
                    {selectedStatusTags.length > 0 && (
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 border rounded-lg bg-white hover:bg-neutral-50"
                        onClick={clearStatusTagFilters}
                      >
                        {t("filters.clear")}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    {statusTagOptions.length ? (
                      <div className="relative" ref={tagFilterMenuRef}>
                        <button
                          type="button"
                          className="status-tag-neutral-button min-w-[200px] px-2.5 py-1.5 border rounded-lg text-[12px] bg-white text-left flex items-center justify-between"
                          onClick={() => setTagFilterMenuOpen(prev => !prev)}
                        >
                          <span>{selectedStatusTags[0] || t("snakeEdit.noTag", { defaultValue: "No tag" })}</span>
                          <span className="text-[10px] text-neutral-500">v</span>
                        </button>
                        {tagFilterMenuOpen && (
                          <div className="absolute z-30 mt-1 w-full min-w-[220px] max-h-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
                            <button
                              type="button"
                              className={cx(
                                'status-tag-menu-button w-full px-3 py-2 text-left text-sm hover:bg-neutral-100',
                                !selectedStatusTags.length ? 'bg-neutral-100 text-neutral-900 font-medium' : 'text-neutral-700'
                              )}
                              onClick={() => {
                                clearStatusTagFilters();
                                setTagFilterMenuOpen(false);
                              }}
                            >
                              {t("snakeEdit.noTag", { defaultValue: "No tag" })}
                            </button>
                            {statusTagOptions.map(option => {
                              const selected = selectedStatusTags[0] === option;
                              return (
                                <div key={option} className="flex items-center">
                                  <button
                                    type="button"
                                    className={cx(
                                      'status-tag-menu-button flex-1 px-3 py-2 text-left text-sm hover:bg-neutral-100',
                                      selected ? 'bg-neutral-100 text-neutral-900 font-medium' : 'text-neutral-700'
                                    )}
                                    onClick={() => {
                                      toggleStatusTagFilter(option);
                                      setTagFilterMenuOpen(false);
                                    }}
                                  >
                                    {option}
                                  </button>
                                  <button
                                    type="button"
                                    className="status-tag-menu-button px-2 py-2 text-sm font-semibold text-neutral-500 hover:text-rose-500"
                                    title="Delete tag"
                                    onClick={() => handleDeleteStatusTag(option)}
                                  >
                                    -
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-500">{t("snakeEdit.noTagsYet")}</div>
                    )}
                  </div>
                </div>
                <GroupCheckboxes
                  groups={groups}
                  showGroups={showGroups}
                  setShowGroups={setShowGroups}
                  hiddenGroups={hiddenGroups}
                  setHiddenGroups={setHiddenGroups}
                  showUnassigned={showUnassigned}
                  setShowUnassigned={setShowUnassigned}
                />
                {animalLayout === 'list' ? (
                  activeAnimalList.length ? (
                    <SnakeListTable
                      snakes={activeAnimalList}
                      onEdit={(sn)=>{ setEditSnake(sn); setEditSnakeDraft(initSnakeDraft(sn)); }}
                      onQuickPair={(sn)=> startPairingWithSnake(sn)}
                      onOrderGeneticTest={(sn) => setTestOrderSnake(sn)}
                      onDelete={requestDeleteSnake}
                      pairings={pairings}
                      onOpenPairing={(pid)=>{ const p = pairings.find(x=>x.id===pid); if (p) { setTab('pairings'); setFocusedPairingId(p.id); } }}
                    />
                  ) : (
                    <div className="text-sm text-neutral-500">{t("animals.noMatches", { defaultValue: "No animals match your filters." })}</div>
                  )
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {activeAnimalList.map(s => (
                        <SnakeCard
                          key={s.id}
                          s={s}
                          groups={groups}
                          setSnakes={setSnakes}
                          onEdit={(sn)=>{ setEditSnake(sn); setEditSnakeDraft(initSnakeDraft(sn)); }}
                          onQuickPair={(sn)=> startPairingWithSnake(sn)}
                          onOrderGeneticTest={(sn) => setTestOrderSnake(sn)}
                          onDelete={requestDeleteSnake}
                          pairings={pairings}
                          onOpenPairing={(pid)=>{ const p = pairings.find(x=>x.id===pid); if (p) { setTab('pairings'); setFocusedPairingId(p.id); } }}
                          lastFeedDefaults={lastFeedDefaults}
                          setLastFeedDefaults={setLastFeedDefaults}
                          showAppAlert={showAppAlert}
                        />
                      ))}
                    </div>
                    {!activeAnimalList.length && (
                      <div className="text-sm text-neutral-500">{t("animals.noMatches", { defaultValue: "No animals match your filters." })}</div>
                    )}
                  </>
                )}
              </Card>
            )}
          </div>
        )}

        {tab === "spaces" && (
          <SpacesSection
            rooms={rooms}
            heatRacks={heatRacks}
            terrariums={terrariums}
            snakes={snakes}
            theme={theme}
            showAppPrompt={showAppPrompt}
            showAppConfirm={showAppConfirm}
            onAddRoom={handleAddRoom}
            onRenameRoom={handleRenameRoom}
            onDeleteRoom={handleDeleteRoom}
            onMoveRoom={handleMoveRoom}
            onCreateHeatRack={handleCreateHeatRack}
            onUpdateHeatRack={handleUpdateHeatRack}
            onDeleteHeatRack={handleDeleteHeatRack}
            onCreateTerrarium={handleCreateTerrarium}
            onUpdateTerrarium={handleUpdateTerrarium}
            onDeleteTerrarium={handleDeleteTerrarium}
            onAssignRackSlot={handleAssignRackSlot}
            onUpdateTerrariumOccupants={handleUpdateTerrariumOccupants}
          />
        )}

        {tab === "advisor" && (
          <div className="flex flex-col gap-4">
            <SuggestionsTab
              males={males}
              females={females}
              onPlanSuggestion={handleAdvisorSuggestionToPlan}
              onExportPairingsByMale={handleAdvisorPairingExport}
            />
          </div>
        )}

        {tab === "pairings" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <TabButton
                  theme={theme}
                  active={pairingsView === 'dashboard'}
                  onClick={() => {
                    setPairingsView('dashboard');
                    setFocusedPairingId(null);
                    setCompletedYearFilter('All');
                  }}
                >
                  {t('pairing.dashboard', { defaultValue: 'Dashboard' })}
                </TabButton>
                <TabButton
                  theme={theme}
                  active={pairingsView === 'active'}
                  onClick={() => {
                    setPairingsView('active');
                    setFocusedPairingId(null);
                    setCompletedYearFilter('All');
                  }}
                >
                  {t("pairing.activeProjects", { count: activePairingsCount })}
                </TabButton>
                <TabButton
                  theme={theme}
                  active={pairingsView === 'completed'}
                  onClick={() => {
                    setPairingsView('completed');
                    setFocusedPairingId(null);
                    setCompletedYearFilter('All');
                  }}
                >
                  {t("pairing.completedProjects", { count: completedPairingsCount })}
                </TabButton>
                <TabButton
                  theme={theme}
                  active={pairingsView === 'incubator'}
                  onClick={() => {
                    setPairingsView('incubator');
                    setFocusedPairingId(null);
                    setCompletedYearFilter('All');
                  }}
                >
                  {t("pairing.incubator")}
                </TabButton>
              </div>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    className="w-full border rounded-xl px-3 py-2 text-sm pr-8"
                    placeholder={t('pairing.searchPlaceholder', { defaultValue: 'Search pairings or snakes' })}
                    value={pairingsSearchQuery}
                    onChange={e => setPairingsSearchQuery(e.target.value)}
                  />
                  {pairingsSearchQuery && (
                    <button
                      type="button"
                      className="absolute inset-y-0 right-2 text-neutral-500 text-lg leading-none"
                      onClick={() => setPairingsSearchQuery('')}
                      aria-label={t('pairing.clearSearch', { defaultValue: 'Clear pairing search' })}
                    >
                      ×
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPairingQrModal(true)}
                  className="px-3 py-2 rounded-xl text-sm border bg-white"
                >
                  {t("actions.exportPairingQr", { defaultValue: "Pairing QR labels" })}
                </button>
                <button
                  type="button"
                  onClick={openNewPairingModal}
                  className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, true))}
                >
                  {t("pairing.new")}
                </button>
              </div>
            </div>
            {pairingsView === 'completed' && completedYearOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <TabButton
                  theme={theme}
                  active={completedYearFilter === 'All'}
                  onClick={() => setCompletedYearFilter('All')}
                >
                  All years
                </TabButton>
                {completedYearOptions.map(year => (
                  <TabButton
                    key={year}
                    theme={theme}
                    active={completedYearFilter === year}
                    onClick={() => setCompletedYearFilter(year)}
                  >
                    {year}
                  </TabButton>
                ))}
              </div>
            )}
            {pairingsView === 'dashboard' ? (
              <BreedingDashboardSection
                items={breedingDashboardItems}
                theme={theme}
                clutchNumberByPairingId={clutchNumberByPairingId}
                clutchMetadataByPairingId={clutchMetadataByPairingId}
                onOpenPairing={(pid) => {
                  const p = pairings.find(x => x.id === pid);
                  if (p) {
                    setPairingsView(isPairingCompleted(p) ? 'completed' : 'active');
                    setFocusedPairingId(p.id);
                  }
                }}
              />
            ) : pairingsView === 'incubator' ? (
              <Card title={t("pairing.incubatorTitle", { count: eggBoxes.length })}>
                {eggBoxes.length ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="rounded-xl border bg-white px-3 py-2 shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Clutches</div>
                        <div className="mt-1 text-2xl font-semibold text-neutral-900">{incubatorSummary.clutches}</div>
                      </div>
                      <div className="rounded-xl border bg-white px-3 py-2 shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Egg boxes</div>
                        <div className="mt-1 text-2xl font-semibold text-neutral-900">{incubatorSummary.boxes}</div>
                      </div>
                      <div className="rounded-xl border bg-white px-3 py-2 shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Total eggs</div>
                        <div className="mt-1 text-2xl font-semibold text-neutral-900">{incubatorSummary.eggs}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {eggBoxes.map(box => (
                        <div key={box.id} className="border rounded-xl p-3 bg-white shadow-sm flex flex-col gap-1.5 text-sm">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-sm leading-snug">
                              {box.eggBoxCount > 1
                                ? t("pairing.eggBox.splitTitle", {
                                  number: box.eggBoxNumber,
                                  box: box.eggBoxIndexInClutch,
                                  total: box.eggBoxCount,
                                  defaultValue: "Egg box #{{number}} ({{box}} of {{total}})",
                                })
                                : t("pairing.eggBox.title", { number: box.eggBoxNumber })}
                            </div>
                            <div className="text-xs text-neutral-500">{box.year || t("pairing.eggBox.yearFallback")}</div>
                          </div>
                          <div className="text-xs leading-snug text-neutral-700">
                            {t("pairing.eggBox.clutchLabel", { number: box.clutchNumber || box.number, pairing: box.pairingLabel })}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {t("pairing.eggBox.laidDue", { laid: box.laidLabel, due: box.dueLabel })}
                          </div>
                          <div className="text-xs font-medium">{t("pairing.eggBox.eggs", { count: box.eggs })}</div>
                          {box.badEggs > 0 ? (
                            <div className="text-xs text-rose-600">
                              Bad eggs: {box.badEggs} of {box.originalEggs}
                            </div>
                          ) : null}
                          {typeof box.remaining === 'number' && (
                            <div className="text-xs text-neutral-600">
                              {t("pairing.eggBox.remaining", { remaining: box.remaining })}
                            </div>
                          )}
                          {box.notes ? (
                            <div className="text-xs text-neutral-500 line-clamp-2">
                              Notes: {box.notes}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="mt-1 w-fit px-2.5 py-1.5 rounded-xl border text-xs bg-white text-neutral-800"
                            onClick={() => setEggBoxModal(box)}
                          >
                            View / edit egg box
                          </button>
                          <button
                            type="button"
                            className={cx('mt-1 w-fit px-2.5 py-1.5 rounded-xl text-xs', primaryBtnClass(theme, true))}
                            onClick={async () => {
                              try {
                                await exportClutchCardToPdf({
                                  clutchNumber: box.clutchNumber || box.number,
                                  clutchDate: box.clutchDate,
                                  femaleName: box.femaleName,
                                  femaleGenetics: box.femaleGenetics,
                                  maleName: box.maleName,
                                  maleGenetics: box.maleGenetics,
                                  eggsTotal: box.eggs,
                                  fertileEggs: box.fertileEggs,
                                  eggBoxNumber: box.eggBoxNumber,
                                  eggBoxCount: box.eggBoxCount,
                                  label: box.pairingLabel,
                                });
                              } catch (err) {
                                console.error('Failed to generate clutch card from incubator', err);
                                await showAppAlert('Unable to generate clutch card PDF.');
                              }
                            }}
                          >
                            Print clutch card
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-neutral-500">{t("pairing.incubatorEmpty")}</div>
                )}
              </Card>
            ) : (
            <PairingsSection
              snakes={snakes}
              pairings={filteredPairingsBySearch}
              breederMales={males}
              breederFemales={females}
              onDelete={(pid)=>{
                setPairings(ps=>ps.filter(x=>x.id!==pid));
                setFocusedPairingId(prev=>prev===pid?null:prev);
              }}
              onOpenSnake={openSnakeCard}
              onUpdatePairing={handleUpdatePairing}
              onExportPairingQr={handleGeneratePairingQrLabels}
              showAppAlert={showAppAlert}
              clutchNumberByPairingId={clutchNumberByPairingId}
              clutchMetadataByPairingId={clutchMetadataByPairingId}
              focusedPairingId={focusedPairingId}
              onFocusPairing={setFocusedPairingId}
              theme={theme}
              title={pairingsView === 'completed'
                ? `${t('pairing.completedProjects', { count: filteredCompletedCount })}${completedYearFilter !== 'All' ? ` - ${completedYearFilter}` : ''}`
                : t('pairing.cardTitle', { count: activePairingsCount })}
              emptyMessage={pairingsSearchQuery.trim()
                ? t('pairing.searchEmpty', { defaultValue: 'No pairings match your search.' })
                : (pairingsView === 'completed'
                  ? (completedYearFilter === 'All'
                    ? t('pairing.completedEmptyAll', { defaultValue: 'No completed projects yet. Hatchlings will land here once the cycle is marked finished.' })
                    : t('pairing.completedEmptyYear', { defaultValue: 'No completed projects recorded for {{year}}.', year: completedYearFilter }))
                  : t('pairing.emptyDefault'))}
              variant="collapsed"
            />
            )}
          </div>
        )}

        {tab === "calendar" && (
          <CalendarSection
            snakes={snakes}
            pairings={pairings}
            theme={theme}
            onOpenPairing={(pid)=>{ const p = pairings.find(x=>x.id===pid); if (p) { setTab('pairings'); setFocusedPairingId(p.id); } }}
            showAppAlert={showAppAlert}
          />
        )}

        {tab === "shedTerminal" && (
          <Card title={t("nav.shedTerminal", { defaultValue: "Shed Test Terminal" })}>
            <ShedTestTerminalPanel snakes={snakes} />
          </Card>
        )}

  {tab === "setup" && (
          <BreederSection
            breederInfo={breederInfo}
            setBreederInfo={setBreederInfo}
            morphAliases={morphAliases}
            setMorphAliases={setMorphAliases}
            theme={theme}
            geneAliases={geneAliases}
            setGeneAliases={setGeneAliases}
            onSaved={() => setTab('animals')}
            createBackupPayload={createBackupPayload}
            onRestoreBackup={handleRestoreBackup}
            backupSettings={backupSettings}
            updateBackupSettings={updateBackupSettings}
            autoBackupSnapshot={autoBackupSnapshot}
            onTriggerAutoBackup={runAutoBackup}
            backupVault={backupVault}
            onCreateVaultEntry={addBackupVaultEntry}
            onRenameVaultEntry={renameBackupVaultEntry}
            onDeleteVaultEntry={deleteBackupVaultEntry}
            snakes={snakes}
            pairings={pairings}
            animalExportFields={animalExportFields}
            setAnimalExportFields={setAnimalExportFields}
            pairingExportFields={pairingExportFields}
            setPairingExportFields={setPairingExportFields}
            exportFeedback={exportFeedback}
            setExportFeedback={setExportFeedback}
            showAppAlert={showAppAlert}
            showAppPrompt={showAppPrompt}
            showAppConfirm={showAppConfirm}
            onResetToDefaults={resetAppToDefaults}
          />
        )}

        {tab === "familyTree" && (
          <FamilyTreePage />
        )}
      </div>

      {photoGallerySnake && typeof document !== 'undefined' && createPortal((
        <div
          className={cx("fixed inset-0 flex items-center justify-center p-4 z-[10040]", overlayClass(theme))}
          onClick={handleClosePhotoGallery}
        >
          <div
            className="relative z-[10041] w-full max-w-4xl bg-white text-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div>
                <div className="text-base font-semibold">{photoGallerySnake.name || 'Unnamed snake'}</div>
                <div className="text-xs text-neutral-500 mt-1">{photoGallerySnake.id}</div>
                <div className="text-xs text-neutral-500 mt-1">{photoGalleryPhotos.length} photo{photoGalleryPhotos.length === 1 ? '' : 's'} stored</div>
              </div>
              <button
                className="text-sm px-3 py-1.5 border rounded-lg"
                onClick={handleClosePhotoGallery}
              >
                Close
              </button>
            </div>
            <div className="px-5 pb-5 overflow-y-auto max-h-[70vh] mt-4">
              {photoGalleryPhotos.length ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  {photoGalleryPhotos.map((photo) => {
                    const isCover = !!(photoGallerySnake.imageUrl && photo.url === photoGallerySnake.imageUrl);
                    const addedLabel = formatDateTimeForDisplay(photo.addedAt) || '';
                    const sizeLabel = typeof photo.size === 'number' ? formatPhotoSize(photo.size) : '';
                    const fileName = photo.name || `${photoGallerySnake.name || photoGallerySnake.id || 'snake'}-${photo.id}`;
                    return (
                      <div key={photo.id} className="border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50 flex flex-col">
                        <div className="relative bg-black/5">
                          <img
                            src={photo.url}
                            alt={photo.name || `${photoGallerySnake.name || 'Snake'} photo`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {isCover && (
                            <div className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow">Cover</div>
                          )}
                        </div>
                        <div className="p-3 flex-1 flex flex-col gap-2 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium truncate" title={photo.name || fileName}>{photo.name || 'Untitled photo'}</div>
                          </div>
                          <div className="text-xs text-neutral-500">
                            {photo.source === 'camera' ? 'Captured on device' : 'Uploaded file'}
                            {sizeLabel ? ` — ${sizeLabel}` : ''}
                          </div>
                          {addedLabel && (
                            <div className="text-xs text-neutral-500">Added {addedLabel}</div>
                          )}
                          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                            <a
                              href={photo.url}
                              download={fileName}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-2 py-1 border rounded-lg hover:bg-neutral-100"
                            >
                              Open
                            </a>
                            <button
                              className="text-xs px-2 py-1 border rounded-lg hover:bg-neutral-100 disabled:opacity-60"
                              onClick={() => handleSetSnakeCoverPhoto(photoGallerySnake.id, photo.id)}
                              disabled={isCover}
                            >
                              {isCover ? 'Current cover' : 'Set as cover'}
                            </button>
                            <button
                              className="text-xs px-2 py-1 border rounded-lg text-rose-600 hover:bg-rose-50"
                              onClick={async () => {
                                const confirmMessage = t("electron.prompts.photoRemove.message", { defaultValue: "Remove this photo?" });
                                const ok = await showAppConfirm(confirmMessage, {
                                  confirmLabel: t('common.remove', { defaultValue: 'Remove' }),
                                  cancelLabel: t('common.cancel', { defaultValue: 'Cancel' }),
                                });
                                if (ok) handleRemoveSnakePhoto(photoGallerySnake.id, photo.id);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-neutral-500">No photos saved for this snake yet. Use the card buttons to add some.</div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {/* add animal modal (two-step wizard) */}
  {showAddModal && typeof document !== 'undefined' && createPortal((
  <div className={cx("fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-[10010]", overlayClass(theme))} onClick={() => setShowAddModal(false)}>
      <div className="relative z-[10011] bg-white w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden max-h-[92vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">{i18n.t("ui.animals.addAnimal.title")}</div>
              <button className="text-sm px-2 py-1" onClick={()=>setShowAddModal(false)}>{i18n.t("common.close")}</button>
            </div>

            {/* wizard state */}
            <AddAnimalWizard
              newAnimal={newAnimal}
              setNewAnimal={setNewAnimal}
              groups={groups}
              setGroups={setGroups}
              availableGenetics={quickAddAvailableGenetics}
              statusOptions={statusTagOptions}
              customStatusTags={customStatusTags}
              onCreateStatusTag={handleCreateStatusTag}
              onDeleteStatusTag={handleDeleteStatusTag}
              onGenerateIdFromWizard={generateIdFromWizardRules}
              onResolveLeucisticText={resolveLeucisticInText}
              onResolveLeucisticLists={resolveLeucisticInMorphHetLists}
              onCancel={()=>setShowAddModal(false)}
              onAdd={addAnimalFromForm}
              theme={theme}
            />
          </div>
        </div>
      ), document.body)}

      {leucisticModalState && typeof document !== 'undefined' && createPortal((
        <div
          className={cx("fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-[10050]", overlayClass(theme))}
          onClick={cancelLeucisticSelector}
        >
          <div
            className="relative z-[10051] bg-white w-full max-w-2xl rounded-2xl shadow-2xl border p-5 space-y-4 max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-lg font-semibold">Select Leucistic Type</div>
            <div className="text-sm text-neutral-600 space-y-3">
              <p>
                When entering BEL in genetics, the app requires the exact genes that create the leucistic animal. BEL is not a standalone gene; it is a visual outcome produced by specific gene combinations.
              </p>
              <div>
                <div className="font-medium text-neutral-800">Blue Eyed Leucistic (BEL)</div>
                <p className="mt-1">
                  A Blue Eyed Leucistic is produced when two compatible genes from the BEL complex are combined. Common BEL complex genes include Mojave, Lesser, Butter, Russo, Mystic, Phantom, and Special.
                </p>
                <p className="mt-1">
                  Example combinations: Mojave + Lesser, Mojave + Butter, Lesser + Russo, Mystic + Mojave, Phantom + Mojave.
                </p>
              </div>
              <div>
                <div className="font-medium text-neutral-800">Black Eyed Leucistic</div>
                <p className="mt-1">
                  Black-eyed leucistics are created as super forms of certain genes. Select one gene and the app records it as the correct super form automatically.
                </p>
                <p className="mt-1">
                  Examples: Fire + Fire creates Super Fire, Lesser + Lesser creates Super Lesser, Butter + Butter creates Super Butter.
                </p>
              </div>
              <p>
                Defining the exact genes keeps genetics records accurate, preserves breeding outcomes, and ensures pairing predictions are correct.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium">Leucistic Type</label>
              <select
                className="mt-1 w-full border rounded-xl px-3 py-2 bg-white text-sm"
                value={leucisticTypeChoice}
                onChange={e => setLeucisticTypeChoice(e.target.value === 'blackEye' ? 'blackEye' : 'bel')}
              >
                <option value="bel">Blue Eyed Leucistic</option>
                <option value="blackEye">Black Eyed Leucistic</option>
              </select>
            </div>

            {leucisticTypeChoice === 'bel' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">BEL Gene 1</label>
                  <select
                    className="mt-1 w-full border rounded-xl px-3 py-2 bg-white text-sm"
                    value={leucisticBelGene1}
                    onChange={e => setLeucisticBelGene1(e.target.value)}
                  >
                    {LEUCISTIC_BEL_GENE_OPTIONS.map(option => (
                      <option key={`bel-1-${option}`} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">BEL Gene 2</label>
                  <select
                    className="mt-1 w-full border rounded-xl px-3 py-2 bg-white text-sm"
                    value={leucisticBelGene2}
                    onChange={e => setLeucisticBelGene2(e.target.value)}
                  >
                    {LEUCISTIC_BEL_GENE_OPTIONS.map(option => (
                      <option key={`bel-2-${option}`} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                {String(leucisticBelGene1 || '').trim() && String(leucisticBelGene2 || '').trim() && String(leucisticBelGene1 || '').trim().toLowerCase() === String(leucisticBelGene2 || '').trim().toLowerCase() && (
                  <div className="sm:col-span-2 text-xs text-red-600">
                    Select two different genes for Blue Eyed Leucistic.
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium">Black Eye Complex Gene</label>
                <select
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white text-sm"
                  value={leucisticBlackGene}
                  onChange={e => setLeucisticBlackGene(e.target.value)}
                >
                  {LEUCISTIC_BLACK_EYE_GENE_OPTIONS.map(option => (
                    <option key={`black-eye-${option}`} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={cancelLeucisticSelector}>Cancel</button>
              <button
                type="button"
                className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, true))}
                onClick={confirmLeucisticSelector}
                disabled={leucisticTypeChoice === 'bel' ? !(leucisticBelGene1 && leucisticBelGene2) || String(leucisticBelGene1 || '').trim().toLowerCase() === String(leucisticBelGene2 || '').trim().toLowerCase() : !leucisticBlackGene}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {pairingGuard && (() => {
        const pairingGuardSnakeName =
          pairingGuard?.snake?.name ||
          pairingGuard?.snake?.id ||
          'this snake';
        const placeholderToken = '__SNAKE_NAME__';
        const addQuestionTemplate = t('modals.breedersOnly.breedersOnlyAddQuestion', {
          snakeName: placeholderToken,
          defaultValue: `Add ${placeholderToken} to Breeders and continue?`
        });
        const questionSegments = addQuestionTemplate.includes(placeholderToken)
          ? addQuestionTemplate.split(placeholderToken)
          : [addQuestionTemplate, ''];
        return (
          <div
            className={cx(
              "fixed inset-0 backdrop-blur-sm flex items-center justify-center p-4 z-50",
              overlayClass(theme)
            )}
            onClick={handlePairingGuardCancel}
          >
            <div
              className="bg-white w-full max-w-md rounded-2xl shadow-xl border p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-lg font-semibold text-center">
                {t('modals.breedersOnly.breedersOnlyTitle', { defaultValue: 'Breeders only' })}
              </div>
              <p className="text-sm text-neutral-600 text-center">
                {t('modals.breedersOnly.breedersOnlyMessage', {
                  defaultValue: 'Only snakes in the Breeders group can be paired.'
                })}
              </p>
              <p className="text-xs text-neutral-500 text-center">
                {questionSegments.map((segment, index) => (
                  <React.Fragment key={`breedersOnlyQuestion-${index}`}>
                    {segment}
                    {index < questionSegments.length - 1 && (
                      <span className="font-semibold text-neutral-700">
                        {pairingGuardSnakeName}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  className="px-3 py-2 rounded-xl text-sm border"
                  onClick={handlePairingGuardCancel}
                >
                  {t('modals.breedersOnly.cancel', { defaultValue: 'Cancel' })}
                </button>
                <button
                  className={cx('px-3 py-2 rounded-xl text-sm text-white', primaryBtnClass(theme, true))}
                  onClick={handlePairingGuardConfirm}
                >
                  {t('modals.breedersOnly.addToBreedersAndPair', {
                    defaultValue: 'Add to Breeders & pair'
                  })}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {hatchWizard && (() => {
        const total = Array.isArray(hatchWizard.entries) ? hatchWizard.entries.length : 0;
        const safeIndex = total ? Math.min(total - 1, Math.max(0, hatchWizard.currentIndex || 0)) : 0;
        const entry = total ? hatchWizard.entries[safeIndex] : null;
        const pairingName = hatchWizard.context?.pairingName || 'Hatchling';
        const groupName = hatchWizard.context?.groupName || '';
        const isLast = safeIndex === total - 1;
        const canAdvance = entry && String(entry.id || '').trim().length > 0;
        const savedCount = Array.isArray(hatchWizard.entries)
          ? hatchWizard.entries.filter(item => item?.saved).length
          : 0;
        return (
          <div
            className={cx(
              'fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-50',
              overlayClass(theme)
            )}
            onClick={handleWizardCancel}
          >
            <div
              className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border overflow-hidden max-h-[92vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b bg-neutral-50">
                <div className="rounded-xl border bg-white p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Hatching clutch</div>
                    <div className="mt-1 font-semibold text-neutral-900 truncate">{pairingName}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {total > 0 ? `Hatchling ${safeIndex + 1} of ${total}` : 'No hatchlings to record'}
                      {groupName ? ` - ${groupName}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-2xl font-semibold leading-none">{savedCount}/{total}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-wide text-neutral-500">Saved</div>
                    </div>
                    <button type="button" className="text-sm px-2 py-1" onClick={handleWizardCancel}>Close</button>
                  </div>
                </div>
              </div>
              <div className="p-4 overflow-auto flex-1">
                {entry ? (
                  <div className="space-y-4">
                    <div className="text-sm text-neutral-600">
                      Pairing: <span className="font-medium text-neutral-800">{pairingName}</span>
                    </div>
                    {groupName && (
                      <div className="text-xs text-neutral-500">
                        New hatchlings will be placed in <span className="font-medium text-neutral-700">{groupName}</span>.
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium">Hatchling ID</label>
                      <div className="mt-1 flex gap-2">
                        <input
                          className="flex-1 border rounded-xl px-3 py-2 text-sm"
                          value={entry.id || ''}
                          onChange={e => handleWizardIdChange(safeIndex, e.target.value)}
                        />
                        <button
                          type="button"
                          className={cx('px-3 py-2 rounded-xl text-sm border', entry.autoId ? 'text-neutral-600' : 'text-neutral-700')}
                          onClick={() => handleWizardRegenerateId(safeIndex)}
                        >
                          Regenerate
                        </button>
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        {entry.saved
                          ? `Saved as ${entry.savedId || entry.id}.`
                          : (entry.autoId ? 'Generated automatically based on pairing.' : 'ID locked—edit to override or regenerate.')}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium">Sex</label>
                        <select
                          className="mt-1 w-full border rounded-xl px-3 py-2 text-sm bg-white"
                          value={entry.sex || 'F'}
                          onChange={e => handleWizardSexChange(safeIndex, e.target.value)}
                        >
                          <option value="F">Female</option>
                          <option value="M">Male</option>
                          <option value="U">Unknown</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium">Weight (g)</label>
                        <input
                          type="number"
                          min="0"
                          className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                          value={entry.weight}
                          onChange={e => handleWizardWeightChange(safeIndex, e.target.value)}
                          placeholder="e.g., 75"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium">Morph / het notes</label>
                        <input
                          className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                          value={entry.morph || ''}
                          onChange={e => handleWizardMorphChange(safeIndex, e.target.value)}
                          placeholder="e.g., Pastel Clown 66% Het Hypo"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Birth date</label>
                        <input
                          type="date"
                          className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                          value={entry.birthDate || ''}
                          onChange={e => handleWizardBirthDateChange(safeIndex, e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-neutral-500">No hatchlings to record.</div>
                )}
              </div>
              <div className="p-4 border-t flex items-center justify-between gap-3">
                <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={handleWizardCancel}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
                <div className="flex items-center gap-2">
                  {safeIndex > 0 && (
                    <button type="button" className="px-3 py-2 rounded-xl text-sm border" onClick={handleWizardPrev}>
                      Previous
                    </button>
                  )}
                  <button
                    type="button"
                    className={cx('px-3 py-2 rounded-xl text-sm text-white', canAdvance ? primaryBtnClass(theme, true) : primaryBtnClass(theme, false))}
                    onClick={handleWizardSaveCurrent}
                    disabled={!canAdvance}
                  >
                    {isLast ? 'Save hatchling' : 'Save & next'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

          {showImportModal && typeof document !== 'undefined' && createPortal((
            <div className={cx("fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-[10010]", overlayClass(theme))} onClick={() => setShowImportModal(false)}>
              <div className="relative z-[10011] bg-white w-full max-w-5xl rounded-2xl shadow-2xl border overflow-hidden max-h-[92vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex items-center justify-between">
                  <div className="font-semibold">{t("ui.animals.import.modalTitle", { defaultValue: "Import animals" })}</div>
                  <button className="text-sm px-2 py-1" onClick={()=>setShowImportModal(false)}>{t("common.close", { defaultValue: "Close" })}</button>
                </div>
                <div className="p-4 overflow-auto max-h-[80vh]">
                  <ImportSection
                    importText={importText}
                    setImportText={setImportText}
                    importPreview={importPreview}
                    setImportPreview={setImportPreview}
                    runImportPreview={runImportPreview}
                    applyImport={applyImport}
                    onResolveLeucisticLists={resolveLeucisticInMorphHetLists}
                    theme={theme}
                    onCancel={()=>setShowImportModal(false)}
                    showAppAlert={showAppAlert}
                  />
                </div>
              </div>
            </div>
          ), document.body)}

      {/* create pairing modal — breeders only, male-first */}
    {showPairingModal && typeof document !== 'undefined' && createPortal((
  <div className={cx("fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-[10010]", overlayClass(theme))} onClick={() => setShowPairingModal(false)}>
          <div className="relative z-[10011] bg-white w-full max-w-2xl rounded-2xl shadow-xl border overflow-hidden max-h-[92vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Create pairing</div>
              <button className="text-sm px-2 py-1" onClick={()=>setShowPairingModal(false)}>Close</button>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[70vh] overflow-auto">
              {(() => {
                const breederMales = males;
                const breederFemales = females;
                const showBreederHint = !breederMales.length || !breederFemales.length;
                return (
                  <>
                    {showBreederHint && (
                      <div className="sm:col-span-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        Add at least one male and one female to the Breeders group to enable pairing.
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium">Male</label>
                      <div className="mt-1 space-y-2">
                        <input
                          ref={maleSearchInputRef}
                          type="text"
                          className="w-full border rounded-xl px-3 py-2 bg-white disabled:bg-neutral-100"
                          value={maleSearchQuery}
                          onChange={e => setMaleSearchQuery(e.target.value)}
                          placeholder={breederMales.length ? "Search breeder males (name, ID, genetics...)" : "No breeder males available"}
                          disabled={!breederMales.length}
                        />
                        {currentMale && (
                          <div className="flex items-center justify-between rounded-xl border bg-neutral-50 px-3 py-2">
                            <div className="min-w-0 text-xs">
                              <div className="font-medium text-sm truncate">{currentMale.name || currentMale.id}</div>
                              <div className="text-[11px] text-neutral-500 truncate">{currentMale.id}</div>
                            </div>
                            <button type="button" className="text-[11px] px-2 py-1 border rounded-lg" onClick={() => setDraft(d => ({ ...d, maleId: "" }))}>
                              Clear
                            </button>
                          </div>
                        )}
                        <div className="border rounded-xl bg-white max-h-48 overflow-auto divide-y">
                          {!breederMales.length ? (
                            <div className="px-3 py-2 text-xs text-neutral-500">
                              {t("pairing.addBreederMalesHint", { defaultValue: "Add breeder males to start building pairings." })}
                            </div>
                          ) : maleSearchResults.length ? (
                            maleSearchResults.map(m => {
                              const selected = draft.maleId === m.id;
                              const geneticsTokens = combineMorphsAndHetsForDisplay(m.morphs, m.hets, m.possibleHets);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  className={cx(
                                    "w-full text-left px-3 py-2 text-sm hover:bg-sky-50 focus:bg-sky-50 focus:outline-none",
                                    selected && "bg-sky-50/80"
                                  )}
                                  onClick={() => {
                                    setDraft(d => ({ ...d, maleId: m.id }));
                                    setMaleSearchQuery("");
                                    setPairingSearchTarget("female");
                                  }}
                                >
                                  <div className="font-medium truncate">{m.name || m.id}</div>
                                  <div className="text-[11px] text-neutral-500 truncate">{m.id}</div>
                                  <div className="text-[11px] text-neutral-500 truncate">
                                    {geneticsTokens.length ? geneticsTokens.join(", ") : "Normal"}
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-2 text-xs text-neutral-500">
                              No breeder males match that search.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Female</label>
                      <div className="mt-1 space-y-2">
                        <input
                          ref={femaleSearchInputRef}
                          type="text"
                          className="w-full border rounded-xl px-3 py-2 bg-white disabled:bg-neutral-100"
                          value={femaleSearchQuery}
                          onChange={e => setFemaleSearchQuery(e.target.value)}
                          placeholder={breederFemales.length ? "Search breeder females (name, ID, genetics...)" : "No breeder females available"}
                          disabled={!breederFemales.length}
                        />
                        {currentFemale && (
                          <div className="flex items-center justify-between rounded-xl border bg-neutral-50 px-3 py-2">
                            <div className="min-w-0 text-xs">
                              <div className="font-medium text-sm truncate">{currentFemale.name || currentFemale.id}</div>
                              <div className="text-[11px] text-neutral-500 truncate">{currentFemale.id}</div>
                            </div>
                            <button type="button" className="text-[11px] px-2 py-1 border rounded-lg" onClick={() => setDraft(d => ({ ...d, femaleId: "" }))}>
                              Clear
                            </button>
                          </div>
                        )}
                        <div className="border rounded-xl bg-white max-h-48 overflow-auto divide-y">
                          {!breederFemales.length ? (
                            <div className="px-3 py-2 text-xs text-neutral-500">
                              {t("pairing.addBreederFemalesHint", { defaultValue: "Add breeder females to start building pairings." })}
                            </div>
                          ) : femaleSearchResults.length ? (
                            femaleSearchResults.map(f => {
                              const selected = draft.femaleId === f.id;
                              const geneticsTokens = combineMorphsAndHetsForDisplay(f.morphs, f.hets, f.possibleHets);
                              return (
                                <button
                                  key={f.id}
                                  type="button"
                                  className={cx(
                                    "w-full text-left px-3 py-2 text-sm hover:bg-rose-50 focus:bg-rose-50 focus:outline-none",
                                    selected && "bg-rose-50/80"
                                  )}
                                  onClick={() => {
                                    setDraft(d => ({ ...d, femaleId: f.id }));
                                    setFemaleSearchQuery("");
                                    setPairingSearchTarget(null);
                                  }}
                                >
                                  <div className="font-medium truncate">{f.name || f.id}</div>
                                  <div className="text-[11px] text-neutral-500 truncate">{f.id}</div>
                                  <div className="text-[11px] text-neutral-500 truncate">
                                    {geneticsTokens.length ? geneticsTokens.join(", ") : "Normal"}
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-2 text-xs text-neutral-500">
                              No breeder females match that search.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {draft.maleId && draft.femaleId && (
                <div className="sm:col-span-2 text-xs text-neutral-500">
                  Pairing label will be saved as {(currentFemale?.name || draft.femaleId)} × {(currentMale?.name || draft.maleId)}.
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="text-xs font-medium">Starting date</label>
                <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={draft.startDate || ""}
                  onChange={e=>setDraft(d=>({...d,startDate:e.target.value}))} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium">Notes</label>
                <textarea className="mt-1 w-full border rounded-xl px-3 py-2" rows={3} value={draft.notes||""} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} placeholder="Ultrasound size, rotation plan, etc."/>
              </div>
            </div>
            <div className="p-5 border-t flex items-center justify-between">
              <div className="text-xs text-neutral-500">{t("pairing.appointmentsHelper", { defaultValue: "Appointments generate monthly from the start date. Calendar staggers same-male appointments by 3 days." })}</div>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-xl text-sm border" onClick={()=>setShowPairingModal(false)}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
                <button
                  className={cx("px-3 py-2 rounded-xl text-sm text-white", draft.femaleId && draft.maleId ? primaryBtnClass(theme,true) : primaryBtnClass(theme,false))}
                  disabled={!draft.femaleId || !draft.maleId}
                  onClick={async () => {
                    if (!draft.maleId || !draft.femaleId) {
                      await showAppAlert('Choose a breeder male and female first.');
                      return;
                    }
                    addPairingFromDraft();
                  }}
                >
                  {t("pairing.new", { defaultValue: "Add pairing" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* edit snake */}
    {editSnake && editSnakeDraft && typeof document !== 'undefined' && createPortal((
    <div className={cx("fixed inset-0 backdrop-blur-md flex items-center justify-center overflow-y-auto p-4 z-[10000]", overlayClass(theme))}>
      <div className="relative z-[10001] bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl border flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
                        <div className="font-semibold">{editSnake.name}</div>
                        <div className="flex items-center gap-2">
                          <button className="px-3 py-2 rounded-xl text-sm border border-rose-200 text-rose-600"
                            onClick={()=>requestDeleteSnake(editSnake)}>
                            {t("actions.delete", { defaultValue: "Delete" })}
                          </button>
                          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))} onClick={async ()=>{ try { await exportSnakeToPdf(editSnakeDraft, breederInfo, theme, pairings); } catch(e){ console.error(e); await showAppAlert(t("snakeEdit.qrExportFailed", { defaultValue: "Export failed" })); } }}>{t("actions.exportPdf", { defaultValue: "Export PDF" })}</button>
                          <button
                            className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, Boolean((editSnakeDraft.id || '').trim())))}
                            disabled={!((editSnakeDraft.id || '').trim())}
                            onClick={async () => {
                              const trimmedId = (editSnakeDraft.id || '').trim();
                              if (!trimmedId) {
                                await showAppAlert(t("snakeEdit.assignIdFirst", { defaultValue: "Assign an ID before creating a QR label." }));
                                return;
                              }
                              try {
                                await exportQrToPdf([{
                                  id: trimmedId,
                                  name: editSnakeDraft.name,
                                  sex: editSnakeDraft.sex,
                                  morphs: editSnakeDraft.morphs,
                                  hets: editSnakeDraft.hets,
                                  possibleHets: editSnakeDraft.possibleHets,
                                }], breederInfo);
                              } catch (err) {
                                console.error('QR export failed', err);
                                await showAppAlert(t("snakeEdit.qrExportFailed", { defaultValue: "Unable to create the QR label PDF." }));
                              }
                            }}
                          >
                            {t("actions.qrLabel", { defaultValue: "QR label" })}
                          </button>
                          <button
                            className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, true))}
                            onClick={() => setTestOrderSnake(editSnakeDraft)}
                          >
                            {t("actions.orderGeneticTest", { defaultValue: "Order Genetic Test" })}
                          </button>
                          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))}
                            onClick={()=>{
                              const oldId = editSnake.id;
                              const newId = editSnakeDraft.id || oldId;
                              const normalizedSex = ensureSex(editSnakeDraft.sex, ensureSex(editSnake.sex, 'F'));
                              const normalizedStatus = (editSnakeDraft.status || '').trim() || 'Active';
                              const normalizedGroups = normalizeSingleGroupValue(editSnakeDraft.groups);
                              const normalizedGenetics = normalizeMorphHetLists([
                                ...(Array.isArray(editSnakeDraft.morphs) ? editSnakeDraft.morphs : []),
                                ...(Array.isArray(editSnakeDraft.hets) ? editSnakeDraft.hets : []),
                              ]);
                              setSnakes(prev => prev.map(s => s.id === oldId ? ({
                                ...editSnakeDraft,
                                id: newId,
                                sex: normalizedSex,
                                status: normalizedStatus,
                                groups: normalizedGroups,
                                morphs: normalizedGenetics.morphs,
                                hets: normalizedGenetics.hets,
                              }) : s));
                          setPairings(prev => prev.map(p => ({
                            ...p,
                            maleId: p.maleId === oldId ? newId : p.maleId,
                            femaleId: p.femaleId === oldId ? newId : p.femaleId,
                          })));
                          closeSnakeEditor();
                            }}>{t("actions.saveChanges", { defaultValue: "Save changes" })}</button>
                          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))} onClick={closeSnakeEditor}>{t("actions.cancel", { defaultValue: "Cancel" })}</button>
                        </div>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* basics */}
              <div className="md:col-span-1 flex flex-col gap-1">
                <div ref={editStatusMenuRef} className="relative">
                  <label className="text-xs font-medium">{t("snakeEdit.tag")}</label>
                  <button
                    type="button"
                    className="status-tag-neutral-button mt-0.5 w-full border rounded-xl px-2 py-1 text-sm bg-white text-left flex items-center justify-between"
                    onClick={() => setEditStatusMenuOpen(open => !open)}
                  >
                    <span>{currentEditStatus || t("snakeEdit.noTag")}</span>
                    <span className="text-[10px] text-neutral-500">v</span>
                  </button>
                  {editStatusMenuOpen && (
                    <div className="absolute z-40 mt-1 w-full rounded-xl border border-neutral-200 bg-white shadow-lg">
                      <button
                        type="button"
                        className="status-tag-menu-button w-full px-3 py-2 text-left text-sm hover:bg-neutral-100"
                        onClick={handleClearEditStatus}
                      >
                        {t("snakeEdit.noTag")}
                      </button>
                      <div className="border-t border-neutral-100" />
                      {statusTagOptions.length ? (
                        statusTagOptions.map(option => (
                          <div key={option} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-50">
                            <button
                              type="button"
                              className="status-tag-menu-button flex-1 text-left"
                              onClick={() => handleSelectEditStatus(option)}
                            >
                              {option}
                            </button>
                            <button
                              type="button"
                              className="status-tag-menu-button ml-3 text-sm font-semibold text-rose-500 hover:text-rose-600"
                              onClick={() => handleDeleteEditStatus(option)}
                              title={t("snakeEdit.deleteTag")}
                            >
                              -
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-neutral-400">{t("snakeEdit.noTagsYet")}</div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <input
                      className="w-full border rounded-lg px-2 py-1 text-sm"
                      value={editStatusTagInput}
                      onChange={e => setEditStatusTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEditStatusTag(); } }}
                      placeholder={t("snakeEdit.tagPlaceholder")}
                    />
                    <button
                      type="button"
                      className={cx('status-tag-neutral-button px-2.5 py-1 rounded-lg text-sm border transition-colors whitespace-nowrap', editStatusTagInput.trim() ? 'text-neutral-700 border-neutral-300' : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed')}
                      onClick={handleAddEditStatusTag}
                      disabled={!editStatusTagInput.trim()}
                    >
                      {t("snakeEdit.addTag")}
                    </button>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">{t("snakeEdit.tagHelp")}</div>
                </div>
                <div>
                  <label className="text-xs font-medium">{t("snakeEdit.name")}</label>
                  <input className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm"
                    value={editSnakeDraft.name}
                    onChange={e=>setEditSnakeDraft(d=>({...d,name:e.target.value}))}/>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium">{t("snakeEdit.id")}</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 border rounded-lg text-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleGenerateIdForEditSnake}
                        disabled={Boolean((editSnakeDraft.id || '').trim())}
                      >
                        {t("snakeEdit.generateId")}
                      </button>
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 border rounded-lg text-neutral-700"
                        onClick={handleUpdateIdForEditSnake}
                      >
                        {t("snakeEdit.updateId")}
                      </button>
                    </div>
                  </div>
                  <input className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm font-mono" value={editSnakeDraft.id}
                    onChange={e=>setEditSnakeDraft(d=>({...d,id:e.target.value}))} />
                  {!((editSnakeDraft.id || '').trim()) && (
                    <div className="mt-0.5 text-[11px] text-neutral-500">{t("snakeEdit.idHint")}</div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium">{t("snakeEdit.sex")}</label>
                  <select className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm bg-white"
                    value={editSnakeDraft.sex}
                    onChange={e=>setEditSnakeDraft(d=>({...d,sex:e.target.value}))}>
                    <option value="F">{t("snakeEdit.sexFemale")}</option>
                    <option value="M">{t("snakeEdit.sexMale")}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">{t("snakeEdit.birthDate")}</label>
                  <input type="text" className="mt-0.5 w-full border rounded-xl px-2 py-1 text-sm"
                    value={editSnakeDraft.birthDate || ''}
                    placeholder="YYYY-MM-DD, YYYY-MM, or YYYY"
                    onChange={e=>setEditSnakeDraft(d=>({...d,birthDate: normalizeBirthDateValue(e.target.value) || e.target.value}))} />
                  <div className="text-xs text-neutral-500 mt-0.5">{editSnakeDraft.birthDate ? formatDateForDisplay(editSnakeDraft.birthDate) : ''}</div>
                </div>
                <div>
                  <label className="text-xs font-medium">{t("snakeEdit.genetics")}</label>
                  <textarea
                    rows={3}
                    className="mt-0.5 w-full border rounded-xl px-2 py-2 text-sm"
                    value={formatMorphHetForInput(editSnakeDraft.morphs, editSnakeDraft.hets)}
                    onChange={async e=>{
                      const resolvedText = await resolveLeucisticInText(e.target.value, 'Edit Animal genetics');
                      const { morphs, hets } = splitMorphHetInput(resolvedText);
                      setEditSnakeDraft(d=>({
                        ...d,
                        morphs,
                        hets,
                      }));
                    }}
                    placeholder={t("snakeEdit.geneticsPlaceholder")}
                  />
                  <div className="text-[11px] text-neutral-500 mt-0.5">{t("snakeEdit.geneticsHelp")}</div>
                </div>
                <div>
                  <label className="text-xs font-medium">{t("snakeEdit.weight")}</label>
                  <input type="number" className="mt-1 w-full border rounded-xl px-2 py-1 text-sm"
                    value={editSnakeDraft.weight}
                    onChange={e=>setEditSnakeDraft(d=>({...d,weight:Number(e.target.value)||0}))}/>
                </div>
                {/* For Sale */}
                <div className="border rounded-xl p-3 bg-neutral-50 mt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700">For Sale</label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!editSnakeDraft.forSale}
                      onClick={() => setEditSnakeDraft(d => ({ ...d, forSale: !d.forSale }))}
                      className={cx(
                        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none',
                        editSnakeDraft.forSale ? 'bg-emerald-500' : 'bg-neutral-300'
                      )}
                    >
                      <span className={cx(
                        'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                        editSnakeDraft.forSale ? 'translate-x-[18px]' : 'translate-x-1'
                      )} />
                    </button>
                  </div>
                  {editSnakeDraft.forSale && (
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <div className="flex flex-col gap-0.5 flex-1">
                          <label className="text-xs font-medium text-neutral-600">{t("snakeEdit.price", { defaultValue: "Price" })}</label>
                          <input
                            type="text"
                            className="border rounded-lg px-2 py-1 text-sm w-full"
                            value={editSnakeDraft.price || ''}
                            onChange={e => setEditSnakeDraft(d => ({ ...d, price: e.target.value }))}
                            placeholder={t("snakeEdit.pricePlaceholder", { defaultValue: "e.g., 450" })}
                          />
                        </div>
                        <div className="flex flex-col gap-0.5 w-20">
                          <label className="text-xs font-medium text-neutral-600">Currency</label>
                          <select
                            className="border rounded-lg px-2 py-1 text-sm bg-white"
                            value={editSnakeDraft.currency || 'EUR'}
                            onChange={e => setEditSnakeDraft(d => ({ ...d, currency: e.target.value }))}
                          >
                            <option value="EUR">EUR</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs font-medium text-neutral-600">Description for buyers</label>
                        <textarea
                          rows={2}
                          className="border rounded-lg px-2 py-1 text-sm resize-none w-full"
                          value={editSnakeDraft.saleDescription || ''}
                          onChange={e => setEditSnakeDraft(d => ({ ...d, saleDescription: e.target.value }))}
                          placeholder="Optional details..."
                        />
                      </div>
                      {editForSalePublishError && (
                        <div className="text-xs text-rose-600 bg-rose-50 rounded-lg px-2 py-1">{editForSalePublishError}</div>
                      )}
                      {editSnakeDraft.marketplacePublished ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5">
                          <span>✓</span><span>Published to Marketplace</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={editForSalePublishing}
                          onClick={publishEditSnakeToMarketplace}
                          className={cx(
                            'w-full rounded-lg py-2 text-xs font-semibold transition-colors',
                            editForSalePublishing
                              ? 'bg-amber-100 text-amber-500 cursor-wait'
                              : 'bg-amber-500 hover:bg-amber-600 text-white'
                          )}
                        >
                          {editForSalePublishing ? 'Publishing...' : 'Publish to Marketplace'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Image URL field removed per request */}

                {/* group */}
                <div>
                  <label className="text-xs font-medium">{t("snakeEdit.group")}</label>
                  <select
                    className="mt-1 w-full border rounded-xl px-2 py-1 text-sm bg-white"
                    value={(Array.isArray(editSnakeDraft.groups) && editSnakeDraft.groups[0]) || ''}
                    onChange={e => {
                      const value = e.target.value.trim();
                      setEditSnakeDraft(d => ({
                        ...d,
                        groups: value ? [value] : [],
                      }));
                    }}
                  >
                    <option value="">{t("snakeEdit.noGroup", { defaultValue: "No group" })}</option>
                    {groups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <div className="mt-2 border border-dashed border-neutral-200 rounded-xl p-3 bg-white">
                    <AddGroupInline onAdd={(g)=>{
                      if (!g) return;
                      setGroups(prev => prev.includes(g) ? prev : [...prev, g]);
                      setEditSnakeDraft(d=>({...d, groups: [g]}));
                    }} />
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">{t("snakeEdit.existingGroups", { defaultValue: "Existing" })}: {groups.join(", ")||"-"}</div>
                </div>
              </div>

              {/* Genetics picker removed from edit modal per user request */}
              <div className="md:col-span-2 space-y-5">
                <BreederShedTestingPanel snake={editSnake} refreshToken={panelRefreshToken} />

                <div className="p-3 border rounded-xl bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm">{t("snakeEdit.pairingOverview")}</div>
                    <div className="text-xs text-neutral-500">{t("snakeEdit.pairingHint")}</div>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const isFemale = normalizeSexValue(editSnakeDraft.sex) === 'F';
                      const targetId = (editSnakeDraft.id || '').trim();
                      const related = !targetId ? [] : pairings.filter(p => {
                        if (!p) return false;
                        const maleId = (p.maleId || '').trim();
                        const femaleId = (p.femaleId || '').trim();
                        if (!maleId && !femaleId) return false;
                        return isFemale ? femaleId === targetId : maleId === targetId;
                      });
                      if (!related.length) {
                        return <div className="text-xs text-neutral-500">{t("snakeEdit.noPairingsYet")}</div>;
                      }
                      const otherSnakes = isFemale ? malesById : femalesById;
                      return related.map(pairing => {
                        const stage = describePairingStage(pairing);
                        const otherIdRaw = isFemale ? pairing.maleId : pairing.femaleId;
                        const otherId = (otherIdRaw || '').trim();
                        const otherName = otherId ? (otherSnakes[otherId]?.name || otherId) : t("snakeEdit.partnerUnknown", { defaultValue: "Partner not set" });
                        const appointCount = Array.isArray(pairing.appointments) ? pairing.appointments.length : 0;
                        return (
                          <div key={pairing.id} className="border rounded-lg px-3 py-2 bg-neutral-50">
                            <div className="text-xs font-semibold text-neutral-700 truncate">{pairing.label || t("snakeEdit.pairingLabel", { defaultValue: "Pairing" })} (#{pairing.id})</div>
                            <div className="text-xs text-neutral-600 truncate">{t("snakeEdit.partner", { defaultValue: "Partner" })}: {otherName || t("snakeEdit.partnerUnknown", { defaultValue: "Unknown partner" })}</div>
                            <div className="text-[11px] text-neutral-500 truncate">{t("snakeEdit.appointments", { count: appointCount })}</div>
                            {stage ? <div className="text-[11px] text-neutral-500 truncate">{t("snakeEdit.status")}: {stage}</div> : null}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                {/* Re-add logs editor so feeds/weights/sheds/cleanings/meds can be edited */}
                <div className="mt-4 p-2 border rounded-xl bg-neutral-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm">{t("snakeEdit.logsTitle")}</div>
                    <div className="text-xs text-neutral-500">{t("snakeEdit.logsHint")}</div>
                  </div>
                  <LogsEditor editSnakeDraft={editSnakeDraft} setEditSnakeDraft={setEditSnakeDraft} lastFeedDefaults={lastFeedDefaults} setLastFeedDefaults={setLastFeedDefaults} />
                </div>

                {/* Image panel moved under logs; upload button sits inside the picture area */}
                <div className="mt-4 flex flex-col items-end gap-3">
                  <div style={{width:318, height:318}} className="rounded-lg overflow-hidden border-2 border-neutral-200 relative">
                    {(() => {
                      const draftPhotos = normalizeSnakePhotos(editSnakeDraft.photos);
                      const frameUrl = editSnakeDraft.imageUrl || (draftPhotos.length ? draftPhotos[draftPhotos.length - 1]?.url : '');
                      return frameUrl ? (
                        <img src={frameUrl} alt={editSnakeDraft.name} className="w-full h-full object-contain object-center bg-neutral-50" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-neutral-500 bg-neutral-50">{t("snakeEdit.image.none")}</div>
                      );
                    })()}
                    {editUploadingPhoto && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center text-sm text-neutral-600">
                        {t("snakeEdit.image.saving")}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <input
                      ref={editCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleEditCameraInputChange}
                    />
                    <input
                      ref={editUploadInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleEditUploadInputChange}
                    />
                    <button
                      className="text-xs px-2 py-1 border rounded-lg"
                      onClick={triggerEditCameraCapture}
                      disabled={editUploadingPhoto || !editSnake?.id}
                    >
                      {t("snakeEdit.image.take")}
                    </button>
                    <button
                      className="text-xs px-2 py-1 border rounded-lg"
                      onClick={triggerEditUploadPicker}
                      disabled={editUploadingPhoto || !editSnake?.id}
                    >
                      {t("snakeEdit.image.upload")}
                    </button>
                    <button
                      className="text-xs px-2 py-1 border rounded-lg"
                      onClick={handleEditViewPictures}
                      disabled={!editSnake?.id}
                    >
                      {editPhotoCount ? t("snakeEdit.image.viewWithCount", { count: editPhotoCount }) : t("snakeEdit.image.view")}
                    </button>
                    <button
                      className="text-xs px-2 py-1 border rounded-lg"
                      onClick={() => {
                        setEditSnakeDraft(prev => prev ? ({ ...prev, imageUrl: undefined }) : prev);
                        setEditSnake(prev => prev ? ({ ...prev, imageUrl: undefined }) : prev);
                      }}
                      disabled={!editSnakeDraft?.imageUrl}
                    >
                      {t("snakeEdit.image.clear")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      <div className="py-10" />
      {qrFor && (() => {
        const target = typeof qrFor === 'string' ? { id: qrFor } : qrFor;
        if (!target?.id) return null;
        const override = typeof qrFor === 'object' ? qrFor.override || null : null;
        const fallbackSnake = snakes.find(x => x.id === target.id);
        const modalName = override?.name ?? fallbackSnake?.name;
        const modalMorphs = override?.morphs ?? fallbackSnake?.morphs;
        const modalHets = override?.hets ?? fallbackSnake?.hets;
        const modalPossibleHets = override?.possibleHets ?? fallbackSnake?.possibleHets;
        return (
          <QRModal
            id={target.id}
            name={modalName}
            morphs={modalMorphs}
            hets={modalHets}
            possibleHets={modalPossibleHets}
            dataUrl={qrDataUrl}
            onClose={() => setQrFor(null)}
          />
        );
      })()}
  <ExportQrModal open={showExportModal} onClose={()=>setShowExportModal(false)} snakes={snakes} groups={groups} onGenerate={(list)=>exportQrToPdf(list, breederInfo)} theme={theme} showAppAlert={showAppAlert} />
      <ExportPairingQrModal
        open={showPairingQrModal}
        onClose={() => setShowPairingQrModal(false)}
        pairings={pairings}
        snakes={snakes}
        onGenerate={handleGeneratePairingQrLabels}
        theme={theme}
        showAppAlert={showAppAlert}
      />
          {showScanner && (
            <QrScannerModal
              onClose={() => setShowScanner(false)}
              onFound={(id) => {
                const match = openSnakeFromScan(id);
                if (match) {
                  setShowScanner(false);
                }
              }}
              showAppAlert={showAppAlert}
            />
          )}
      <ConfirmDeleteSnakeModal
        snake={pendingDeleteSnake}
        onCancel={cancelDeleteSnake}
        onConfirm={confirmDeleteSnake}
        theme={theme}
      />
      <EggBoxModal
        box={eggBoxModal}
        onClose={() => setEggBoxModal(null)}
        onSave={handleSaveEggBoxDetails}
        theme={theme}
      />
      <BreederOrderGeneticTestModal
        open={Boolean(testOrderSnake)}
        snake={testOrderSnake}
        onClose={() => setTestOrderSnake(null)}
        overlayClass={overlayClass(theme)}
      />
      <BatchOrderCart />
        <ScrollToTopButton theme={theme} />
    </div>
  );
}

export {
  splitMorphHetInput,
  computeGeneInitialSegment,
  generateSnakeId,
  extractYearFromDateString,
  extractSequenceFromId,
  normalizeBackupSettings,
  backupFrequencyToMs,
  sanitizeSnakeRecord,
  sanitizePairingRecord,
  normalizeBackupSnapshot,
  normalizeBackupFileEntry,
  normalizeBackupVault,
  normalizeExportFieldSelection,
  buildAnimalExportDataset,
  buildPairingExportDataset,
  buildPairingMatrixExportDataset,
  getPairingExportRows,
  exportDatasetToCsv,
};

    function QrScannerModal({ onClose, onFound, inline = false, elementId = 'qr-scan-root', showAppAlert }) {
      const { t } = useTranslation();
      const qrModuleRef = useRef(null);
      const scannerRef = useRef(null);
      const manualInputRef = useRef(null);
      const [manualValue, setManualValue] = useState('');
      const [lastUploadName, setLastUploadName] = useState('');
      const suggestedMode = useMemo(() => {
        if (typeof navigator === 'undefined') return 'camera';
        const ua = navigator.userAgent || '';
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
        return isMobile ? 'camera' : 'scanner';
      }, []);
      const [scanMode, setScanMode] = useState(() => {
        if (typeof window !== 'undefined') {
          try {
            const stored = window.localStorage.getItem(SCAN_MODE_STORAGE_KEY);
            if (stored === 'camera' || stored === 'scanner') return stored;
          } catch (err) {
            // ignore storage errors
          }
        }
        return suggestedMode;
      });
      const isCameraMode = scanMode === 'camera';

      const teardownScanner = useCallback(async () => {
        const instance = scannerRef.current;
        if (!instance) return;
        scannerRef.current = null;
        const tasks = [];
        if (typeof instance.stop === 'function') tasks.push(instance.stop().catch(() => {}));
        if (typeof instance.clear === 'function') tasks.push(instance.clear().catch(() => {}));
        if (typeof instance.close === 'function') tasks.push(instance.close().catch(() => {}));
        if (tasks.length) {
          await Promise.allSettled(tasks);
        }
      }, []);

      const raiseAlert = useCallback((message) => {
        if (typeof showAppAlert === 'function') {
          showAppAlert(message);
        } else {
          console.warn(message);
        }
      }, [showAppAlert]);

      const handleModeChange = useCallback((mode) => {
        if (mode !== 'camera' && mode !== 'scanner') return;
        setScanMode(prev => (prev === mode ? prev : mode));
        if (mode !== 'camera') {
          teardownScanner().catch(() => {});
        }
      }, [teardownScanner]);

      const ensureQrModule = useCallback(async () => {
        if (qrModuleRef.current) return qrModuleRef.current;
        if (typeof window === 'undefined') return null;
        let imported = null;
        try {
          imported = await import('html5-qrcode');
        } catch (err) {
          console.warn('Failed to import html5-qrcode via ESM', err);
        }
        const normalized = {
          Html5Qrcode: imported?.Html5Qrcode || imported?.default?.Html5Qrcode || window.Html5Qrcode || null,
          Html5QrcodeScanner: imported?.Html5QrcodeScanner || imported?.default?.Html5QrcodeScanner || window.Html5QrcodeScanner || null,
        };
        if (!normalized.Html5Qrcode && !normalized.Html5QrcodeScanner) {
          return null;
        }
        qrModuleRef.current = normalized;
        return normalized;
      }, []);

      useEffect(() => {
        let isMounted = true;

        if (!isCameraMode) {
          teardownScanner().catch(() => {});
          return () => {
            isMounted = false;
            teardownScanner().catch(() => {});
          };
        }

        const startScanner = async () => {
          await teardownScanner().catch(() => {});
          const module = await ensureQrModule();
          if (!isMounted) return;
          if (!module) {
            raiseAlert('QR scanner library failed to load. Check your connection and reload.');
            return;
          }
          const target = document.getElementById(elementId);
          if (!target) return;

          const { Html5QrcodeScanner, Html5Qrcode } = module;

          try {
            if (Html5QrcodeScanner) {
              const instance = new Html5QrcodeScanner('qr-scan-root', { fps: 10, qrbox: 250 }, false);
              scannerRef.current = instance;
              instance.render((decoded) => {
                const id = extractSnakeIdFromPayload(decoded);
                if (!id) return;
                if (isMounted) onFound(id);
                teardownScanner().catch(() => {});
              }, () => {});
            } else if (Html5Qrcode) {
              const instance = new Html5Qrcode('qr-scan-root');
              scannerRef.current = instance;
              await instance.start(
                { facingMode: { ideal: 'environment' } },
                { fps: 10, qrbox: 250 },
                (decoded) => {
                  const id = extractSnakeIdFromPayload(decoded);
                  if (!id) return;
                  if (isMounted) onFound(id);
                  teardownScanner().catch(() => {});
                },
                () => {}
              );
            } else {
              throw new Error('html5-qrcode module unavailable');
            }
            } catch (err) {
              console.error('QR importer failed', err);
              if (isMounted) raiseAlert('Unable to start QR scanner. Verify camera permissions and try again.');
          }
        };

        startScanner();

        return () => {
          isMounted = false;
          teardownScanner().catch(() => {});
        };
      }, [elementId, ensureQrModule, isCameraMode, onFound, raiseAlert, teardownScanner]);

      useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
          window.localStorage.setItem(SCAN_MODE_STORAGE_KEY, scanMode);
        } catch (err) {
          // ignore storage errors
        }
      }, [scanMode]);

      useEffect(() => {
        if (scanMode !== 'scanner') return;
        const node = manualInputRef.current;
        if (!node) return;
        try {
          node.focus({ preventScroll: true });
        } catch (err) {
          try { node.focus(); } catch (_) { /* ignore */ }
        }
        if (typeof node.select === 'function') {
          try { node.select(); } catch (err) { /* ignore */ }
        }
      }, [scanMode]);

      const handleFile = async (e) => {
        const f = e.target.files && e.target.files[0];
        setLastUploadName(f?.name || '');
        if (!f) return;
        if (e.target) e.target.value = '';
        try {
          const module = await ensureQrModule();
          let decodedText = null;

          if (module && module.Html5Qrcode) {
            const { Html5Qrcode } = module;
            try {
              let decodedPayload = null;
              if (typeof Html5Qrcode.scanFileV2 === 'function') {
                decodedPayload = await Html5Qrcode.scanFileV2(f, true);
              } else if (typeof Html5Qrcode.scanFile === 'function') {
                decodedPayload = await Html5Qrcode.scanFile(f, true);
              }
              decodedText = extractDecodedText(decodedPayload);
            } catch (scanErr) {
              console.warn('html5-qrcode file scan failed, will fall back to jsQR', scanErr);
            }
          }

          if (!decodedText) {
            decodedText = await decodeQrFromImageFile(f);
          }

          if (!decodedText) {
            raiseAlert('Could not read a QR code from that image. Try a clearer, well-lit photo.');
            return;
          }

          const id = extractSnakeIdFromPayload(decodedText);
          if (!id) {
            raiseAlert('Could not parse an ID from that QR code.');
            return;
          }
          onFound(id);
        } catch (err) {
          console.error('file scan failed', err);
          raiseAlert('Failed to scan uploaded image');
        }
      };

      const handleManualSubmit = useCallback(() => {
        const value = manualValue.trim();
        if (!value) {
          raiseAlert('Scan or paste a QR value first.');
          return;
        }
        const id = extractSnakeIdFromPayload(value);
        if (!id) {
          raiseAlert('Scan or paste a QR value first.');
          return;
        }
        setManualValue('');
        onFound(id);
      }, [manualValue, onFound, raiseAlert]);

      const handleManualKeyDown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleManualSubmit();
        }
      };

      const hasManualValue = manualValue.trim().length > 0;

      const scannerContent = (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-[10010]" onClick={onClose}>
          <div className="relative z-[10011] bg-white p-4 rounded-lg shadow-2xl w-full max-w-md" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-lg">{t('scanQrCode')}</div>
                <div className="text-xs text-neutral-500 mt-1">{t('chooseHow')}</div>
              </div>
              <button className="text-sm px-2 py-1 border rounded" onClick={onClose}>?</button>
            </div>

            <div className="mt-3">
              <div className="text-xs font-medium text-neutral-600">{t('scanMethod')}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleModeChange('camera')}
                  className={cx('px-3 py-1.5 rounded-lg text-sm border transition-colors', isCameraMode ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-white text-neutral-700 border-neutral-200 hover:border-sky-400')}
                >
                  {t('deviceCamera')}
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('scanner')}
                  className={cx('px-3 py-1.5 rounded-lg text-sm border transition-colors', !isCameraMode ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-white text-neutral-700 border-neutral-200 hover:border-sky-400')}
                >
                  {t('usbScanner')}
                </button>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                {isCameraMode ? t('choiceRemembered') : <>{t('inputReady')} <span className="block">{t('choiceRemembered')}</span></>}
              </div>
            </div>

            <div className="mt-3">
              <div
                id="qr-scan-root"
                key={scanMode}
                className={cx(
                  'w-full h-56 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors',
                  isCameraMode ? 'border-neutral-200 bg-neutral-50' : 'border-neutral-300 bg-neutral-100'
                )}
              >
                {isCameraMode ? (
                  <div className="text-center text-sm text-neutral-500 px-4">Align the QR inside the box</div>
                ) : (
                  <div className="text-center text-sm text-neutral-500 px-4">{t('cameraDisabled')}</div>
                )}
              </div>
            </div>

            <div className="mt-3 text-xs text-neutral-500">
              {isCameraMode
                ? 'Tip: Hold the camera steady and ensure the code is well-lit. If the camera is blocked, upload a photo instead.'
                : t('tipUsb')}
            </div>

            <div className="mt-3 flex flex-col gap-1">
              <label className="text-sm font-medium">{t('uploadImage')}</label>
              <div className="flex items-center gap-2">
                <input type="file" accept="image/*" onChange={handleFile} />
                <span className="text-xs text-neutral-500 truncate">{lastUploadName || t('noFile')}</span>
              </div>
            </div>

            <div className="mt-4 border-t border-neutral-200 pt-4">
              <div className="text-sm font-medium">{t('scannerInput')}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {isCameraMode ? t('pasteCode') : <>{t('autoField')} <span className="block sm:inline">{t('pasteCode')}</span></>}
              </div>
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  ref={manualInputRef}
                  type="text"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  onKeyDown={handleManualKeyDown}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder={isCameraMode ? 'Scan or paste the QR contents here' : 'Scanner-ready: trigger your reader or paste the QR contents here'}
                  inputMode="text"
                  autoComplete="off"
                  autoFocus={scanMode === 'scanner'}
                />
                <button
                  type="button"
                  className={cx('px-3 py-2 rounded-lg text-sm border transition-colors', hasManualValue ? 'bg-sky-600 text-white border-sky-600' : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed')}
                  onClick={handleManualSubmit}
                  disabled={!hasManualValue}
                >
                  {t('lookup')}
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button className="px-3 py-2 rounded-lg border" onClick={onClose}>{t('close')}</button>
            </div>
          </div>
        </div>
      );
      if (inline || typeof document === 'undefined') return scannerContent;
      return createPortal(scannerContent, document.body);
    }

function useHardwareScannerListener({ enabled, onScan, minLength = 3, maxKeyInterval = 150, maxScanDuration = 2000 }) {
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === 'undefined') return undefined;

    let buffer = '';
    let startedAt = 0;
    let lastTime = 0;
    let capturingScan = false;

    const nowTs = () => {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    };

    const isEditableElement = (el) => {
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (!tag) return false;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.getAttribute?.('data-scanner-target') === 'true'
      );
    };

    const swallowEvent = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
    };

    const resetBuffer = () => {
      buffer = '';
      startedAt = 0;
      lastTime = 0;
      capturingScan = false;
    };

    const handleKeyDown = (event) => {
      if (!enabled) return;
      const targetEditable = isEditableElement(event.target);
      if (targetEditable && !capturingScan) {
        resetBuffer();
        return;
      }
      const current = nowTs();
      const key = event.key;

      const tryCommit = () => {
        if (!buffer.length || !startedAt) return false;
        const duration = current - startedAt;
        if (buffer.length >= minLength && duration <= maxScanDuration) {
          const id = extractSnakeIdFromPayload(buffer);
          if (id) {
            if (typeof event.preventDefault === 'function') {
              event.preventDefault();
            }
            onScanRef.current?.(id);
            return true;
          }
        }
        return false;
      };

      if (key === 'Enter' || key === 'Tab') {
        if (capturingScan || buffer.length) {
          swallowEvent(event);
        }
        tryCommit();
        resetBuffer();
        return;
      }

      if (key === 'Escape') {
        if (capturingScan) {
          swallowEvent(event);
        }
        resetBuffer();
        return;
      }

      if (key === 'Backspace') {
        if (capturingScan) {
          swallowEvent(event);
        }
        buffer = buffer.slice(0, -1);
        if (!buffer.length) {
          resetBuffer();
        }
        return;
      }

      if (key === 'Shift' || key === 'CapsLock' || key === 'NumLock') {
        return;
      }

      if (event.metaKey || event.altKey || event.ctrlKey) {
        if (capturingScan) {
          swallowEvent(event);
        }
        resetBuffer();
        return;
      }

      if (key.length === 1) {
        if (!capturingScan) {
          capturingScan = true;
        }
        if (!targetEditable) {
          swallowEvent(event);
        }
        if (!startedAt) {
          startedAt = current;
          buffer = '';
        }
        if (lastTime && current - lastTime > maxKeyInterval) {
          buffer = '';
          startedAt = current;
        }
        lastTime = current;
        buffer += key;
        return;
      }

      resetBuffer();
    };

    const handlePaste = (event) => {
      if (!enabled) return;
      if (isEditableElement(event.target)) return;
      const text = event.clipboardData?.getData('text');
      if (!text) return;
      swallowEvent(event);
      const id = extractSnakeIdFromPayload(text);
      if (id) {
        onScanRef.current?.(id);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('paste', handlePaste, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('paste', handlePaste, true);
    };
  }, [enabled, maxKeyInterval, maxScanDuration, minLength]);
}

// small comps
function ConfirmDeleteSnakeModal({ snake, onCancel, onConfirm }) {
  const { t } = useTranslation();
  if (!snake) return null;
  if (typeof document === 'undefined') return null;
  return createPortal((
    <div className="fixed inset-0 bg-black/45 backdrop-blur-md flex items-center justify-center p-4 z-[10020]" onClick={onCancel}>
      <div className="relative z-[10021] bg-white w-full max-w-sm rounded-2xl shadow-2xl border p-5" onClick={e=>e.stopPropagation()}>
        <div className="font-semibold text-lg">Delete {snake.name || 'this snake'}?</div>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
          This removes the animal and detaches any pairings linked to it. Demo animals will return automatically whenever your collection is empty, so you always have something to explore.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-xl text-sm border" onClick={onCancel}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
          <button
            className="px-3 py-2 rounded-xl text-sm appearance-btn appearance-btn--danger"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

function primaryBtnClass(theme, filled = true) {
  return filled ? 'appearance-btn appearance-btn--filled' : 'appearance-btn appearance-btn--ghost';
}

function overlayClass(theme) {
  return 'appearance-overlay';
}

function TabButton({ theme = 'blue', active, onClick, children, className }) {
  return (
    <button
      type="button"
      className={cx(
        'appearance-tab px-3 py-1.5 rounded-lg text-sm border transition-colors',
        active ? 'appearance-tab--active' : 'appearance-tab--inactive',
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white border rounded-2xl shadow-sm">
      <div className="px-4 py-3 border-b font-semibold">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Badge({ children }) {
  return <span className="px-2 py-0.5 text-xs rounded-full border bg-neutral-50">{children}</span>;
}

function SexBadge({ sex, label, showText = true, className }) {
  const normalized = normalizeSexValue(sex);
  const symbol = normalized === 'M' ? '\u2642' : normalized === 'F' ? '\u2640' : '?';
  const fallbackLabel = normalized === 'M' ? 'Male' : normalized === 'F' ? 'Female' : 'Unknown sex';
  const text = label || fallbackLabel;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide bg-neutral-50 text-neutral-600',
        !showText && 'px-1.5',
        className
      )}
      aria-label={text}
    >
      <span aria-hidden="true" className="text-sm leading-none">{symbol}</span>
      {showText ? <span>{text}</span> : <span className="sr-only">{text}</span>}
    </span>
  );
}

function GroupCheckboxes({
  groups,
  showGroups,
  setShowGroups,
  hiddenGroups,
  setHiddenGroups,
  showUnassigned = true,
  setShowUnassigned
}) {
  const { t } = useTranslation();
  const toggleShow = (group) => {
    if (typeof setShowGroups !== 'function' || typeof setHiddenGroups !== 'function') return;
    setShowGroups(prev => {
      const next = new Set(prev || []);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
        setHiddenGroups(prevHide => (prevHide || []).filter(g => g !== group));
      }
      return [...next];
    });
  };

  const toggleHide = (group) => {
    if (typeof setHiddenGroups !== 'function' || typeof setShowGroups !== 'function') return;
    setHiddenGroups(prev => {
      const next = new Set(prev || []);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
        setShowGroups(prevShow => (prevShow || []).filter(g => g !== group));
      }
      return [...next];
    });
  };

  const handleClear = () => {
    if (typeof setShowGroups === 'function') setShowGroups([]);
    if (typeof setHiddenGroups === 'function') setHiddenGroups([]);
  };

  const handleToggleUnassigned = () => {
    if (typeof setShowUnassigned === 'function') {
      setShowUnassigned(prev => !prev);
    }
  };

  const showSet = new Set(showGroups || []);
  const hideSet = new Set(hiddenGroups || []);
  const filtersActive = showSet.size > 0 || hideSet.size > 0;

  return (
    <div className="space-y-2 mb-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={!filtersActive}
          className={cx(
            'px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors',
            filtersActive
              ? 'bg-white hover:bg-neutral-50 border-neutral-300'
              : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed'
          )}
          onClick={handleClear}
        >
          {t("filters.clear")}
        </button>
        <button
          type="button"
          className={cx('px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors', showUnassigned ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white hover:bg-neutral-50 border-neutral-300')}
          onClick={handleToggleUnassigned}
        >
          {showUnassigned ? t("filters.hideUnassigned") : t("filters.showUnassigned")}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {groups.map(group => {
          const status = showSet.has(group) ? 'show' : hideSet.has(group) ? 'hide' : 'neutral';
          return (
            <div
              key={group}
              className={cx(
                'inline-flex items-center gap-1 text-sm px-2.5 py-1 rounded-lg border transition-colors',
                status === 'show'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : status === 'hide'
                    ? 'bg-rose-50 border-rose-400 text-rose-700'
                    : 'bg-white border-neutral-300 text-neutral-700'
              )}
            >
              <span className="font-medium mr-0.5">{group}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleShow(group)}
                  className={cx(
                    'px-1.5 py-0.5 rounded-md border text-[10px] uppercase tracking-wide',
                    status === 'show'
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                  )}
                >
                  {t("filters.show")}
                </button>
                <button
                  type="button"
                  onClick={() => toggleHide(group)}
                  className={cx(
                    'px-1.5 py-0.5 rounded-md border text-[10px] uppercase tracking-wide',
                    status === 'hide'
                      ? 'bg-rose-500 border-rose-500 text-white'
                      : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                  )}
                >
                  {t("filters.hide")}
                </button>
              </div>
            </div>
          );
        })}
        {!groups.length && <span className="text-xs text-neutral-500">{t("groups.none", { defaultValue: "No groups yet." })}</span>}
      </div>
    </div>
  );
}

// SpacesSection now renders room summary cards and orchestrates modals.
function SpacesSection({
  rooms = [],
  heatRacks = [],
  terrariums = [],
  snakes = [],
  theme = 'blue',
  showAppPrompt,
  showAppConfirm,
  onAddRoom,
  onRenameRoom,
  onDeleteRoom,
  onMoveRoom,
  onCreateHeatRack,
  onUpdateHeatRack,
  onDeleteHeatRack,
  onCreateTerrarium,
  onUpdateTerrarium,
  onDeleteTerrarium,
  onAssignRackSlot,
  onUpdateTerrariumOccupants
}) {
  const { t } = useTranslation();
  const [newRoomName, setNewRoomName] = useState('');
  const [activeRoomId, setActiveRoomId] = useState(() => (rooms[0]?.id ?? null));
  const [rackFormState, setRackFormState] = useState({ mode: null, roomId: null, rackId: null });
  const [terrariumFormState, setTerrariumFormState] = useState({ mode: null, roomId: null, terrariumId: null });
  const [rackViewId, setRackViewId] = useState(null);
  const [terrariumViewId, setTerrariumViewId] = useState(null);

  useEffect(() => {
    if (!rooms.length) {
      setActiveRoomId(null);
      return;
    }
    setActiveRoomId(prev => {
      if (prev && rooms.some(room => room.id === prev)) {
        return prev;
      }
      return rooms[0]?.id ?? null;
    });
  }, [rooms]);

  const racksByRoom = useMemo(() => {
    const map = new Map();
    (heatRacks || []).forEach(rack => {
      if (!rack?.roomId) return;
      if (!map.has(rack.roomId)) map.set(rack.roomId, []);
      map.get(rack.roomId).push(rack);
    });
    return map;
  }, [heatRacks]);

  const terrariumsByRoom = useMemo(() => {
    const map = new Map();
    (terrariums || []).forEach(item => {
      if (!item?.roomId) return;
      if (!map.has(item.roomId)) map.set(item.roomId, []);
      map.get(item.roomId).push(item);
    });
    return map;
  }, [terrariums]);

  const snakeOptions = useMemo(() => {
    return (snakes || [])
      .map(snake => ({
        id: snake.id,
        label: snake.name ? `${snake.name} (${snake.id})` : snake.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [snakes]);

  const snakeMap = useMemo(() => new Map(snakes.map(snake => [snake.id, snake])), [snakes]);

  const occupiedSnakeIds = useMemo(() => {
    const set = new Set();
    heatRacks.forEach(rack => {
      (rack.slots || []).forEach(slot => {
        if (slot?.snakeId) set.add(slot.snakeId);
      });
    });
    return set;
  }, [heatRacks]);

  const handleCreateRoom = useCallback(() => {
    const trimmed = newRoomName.trim();
    if (!trimmed) return;
    onAddRoom?.(trimmed);
    setNewRoomName('');
  }, [newRoomName, onAddRoom]);

  const handlePromptRenameRoom = useCallback(async (room) => {
    if (!room || typeof onRenameRoom !== 'function') return;
    let next = null;
    if (typeof showAppPrompt === 'function') {
      next = await showAppPrompt(t('modal.newRoom.label', { defaultValue: 'Room name' }), {
        defaultValue: room.name || '',
        confirmLabel: t('common.save', { defaultValue: 'Save' }),
        cancelLabel: t('common.cancel', { defaultValue: 'Cancel' }),
      });
    } else {
      console.warn('Room rename prompt unavailable because showAppPrompt is not configured.');
    }
    if (next && next.trim()) {
      onRenameRoom(room.id, next.trim());
    }
  }, [onRenameRoom, showAppPrompt, t]);

  const handleConfirmDeleteRoom = useCallback(async (roomId) => {
    if (!roomId) return;
    let confirmed = true;
    if (typeof showAppConfirm === 'function') {
      confirmed = await showAppConfirm(t('spaces.confirmDeleteRoom', { defaultValue: 'Delete this room and all related items?' }), {
        confirmLabel: t('common.delete', { defaultValue: 'Delete' }),
        cancelLabel: t('common.cancel', { defaultValue: 'Cancel' }),
      });
    } else {
      console.warn('Room delete confirmation unavailable because showAppConfirm is not configured.');
    }
    if (!confirmed) return;
    onDeleteRoom?.(roomId);
  }, [onDeleteRoom, showAppConfirm, t]);

  const openRackForm = useCallback((roomId, rackId = null) => {
    setRackFormState({ mode: rackId ? 'edit' : 'create', roomId, rackId });
  }, []);

  const openTerrariumForm = useCallback((roomId, terrariumId = null) => {
    setTerrariumFormState({ mode: terrariumId ? 'edit' : 'create', roomId, terrariumId });
  }, []);

  const handleRackFormSubmit = useCallback((payload) => {
    if (!rackFormState.mode || !rackFormState.roomId) return;
    if (rackFormState.mode === 'edit' && rackFormState.rackId) {
      onUpdateHeatRack?.(rackFormState.rackId, payload);
    } else {
      onCreateHeatRack?.(rackFormState.roomId, payload);
    }
    setRackFormState({ mode: null, roomId: null, rackId: null });
  }, [onCreateHeatRack, onUpdateHeatRack, rackFormState]);

  const handleTerrariumFormSubmit = useCallback((payload) => {
    if (!terrariumFormState.mode || !terrariumFormState.roomId) return;
    if (terrariumFormState.mode === 'edit' && terrariumFormState.terrariumId) {
      onUpdateTerrarium?.(terrariumFormState.terrariumId, payload);
    } else {
      onCreateTerrarium?.(terrariumFormState.roomId, payload);
    }
    setTerrariumFormState({ mode: null, roomId: null, terrariumId: null });
  }, [onCreateTerrarium, onUpdateTerrarium, terrariumFormState]);

  const activeRoom = rooms.find(room => room.id === activeRoomId) || null;
  const activeRacks = activeRoom ? (racksByRoom.get(activeRoom.id) || []) : [];
  const activeTerrariums = activeRoom ? (terrariumsByRoom.get(activeRoom.id) || []) : [];
  const rackModalRoom = rooms.find(room => room.id === rackFormState.roomId) || null;
  const editingRack = heatRacks.find(rack => rack.id === rackFormState.rackId) || null;
  const terrariumModalRoom = rooms.find(room => room.id === terrariumFormState.roomId) || null;
  const editingTerrarium = terrariums.find(item => item.id === terrariumFormState.terrariumId) || null;
  const rackForView = heatRacks.find(rack => rack.id === rackViewId) || null;
  const terrariumForView = terrariums.find(item => item.id === terrariumViewId) || null;
  const activeRoomIndexRaw = activeRoom ? rooms.findIndex(room => room.id === activeRoom.id) : 0;
  const activeRoomIndex = activeRoomIndexRaw < 0 ? 0 : activeRoomIndexRaw;

  useEffect(() => {
    if (rackViewId && !rackForView) {
      setRackViewId(null);
    }
  }, [rackViewId, rackForView]);

  useEffect(() => {
    if (terrariumViewId && !terrariumForView) {
      setTerrariumViewId(null);
    }
  }, [terrariumViewId, terrariumForView]);

  return (
    <Card title={t('nav.spaces', { defaultValue: 'Spaces' })}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="flex-1 min-w-[220px] border rounded-xl px-3 py-2 text-sm"
            value={newRoomName}
            onChange={e => setNewRoomName(e.target.value)}
            placeholder={t('modal.newRoom.label', { defaultValue: 'Room name' })}
          />
          <button
            type="button"
            className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, !!newRoomName.trim()))}
            onClick={handleCreateRoom}
            disabled={!newRoomName.trim()}
          >
            + {t('spaces.addRoom', { defaultValue: 'Create Room' })}
          </button>
        </div>

        {rooms.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room) => {
              const roomRacks = racksByRoom.get(room.id) || [];
              const roomTerrariums = terrariumsByRoom.get(room.id) || [];
              const isEmpty = !roomRacks.length && !roomTerrariums.length;
              const openRoom = () => setActiveRoomId(room.id);
              return (
                <div
                  key={room.id}
                  className="text-left rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm hover:border-neutral-400 transition cursor-pointer"
                  onClick={openRoom}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openRoom();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm uppercase tracking-wide text-neutral-500">{t('spaces.roomLabel', { defaultValue: 'Room' })}</div>
                      <div className="text-xl font-semibold text-neutral-900 truncate">{room.name}</div>
                    </div>
                    <div className="flex flex-col gap-2 text-xs">
                      <button className="px-2 py-1 border rounded-lg" onClick={(event) => { event.stopPropagation(); handlePromptRenameRoom(room); }}>{t('actions.rename', { defaultValue: 'Rename' })}</button>
                      <button className="px-2 py-1 border rounded-lg text-rose-600" onClick={(event) => { event.stopPropagation(); handleConfirmDeleteRoom(room.id); }}>{t('actions.delete', { defaultValue: 'Delete' })}</button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-neutral-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{t('spaces.racksHeading', { defaultValue: 'Racks' })}</div>
                      <div className="text-2xl font-semibold text-neutral-900">{roomRacks.length}</div>
                    </div>
                    <div className="rounded-2xl bg-neutral-50 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{t('spaces.terrariumsHeading', { defaultValue: 'Terrariums' })}</div>
                      <div className="text-2xl font-semibold text-neutral-900">{roomTerrariums.length}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-600">
                    <div>
                      <div className="uppercase tracking-wide text-[11px] text-neutral-500">{t('spaces.roomSummary', { defaultValue: 'Room summary' })}</div>
                      <span>
                        {isEmpty
                          ? t('spaces.roomEmpty', { defaultValue: 'Empty room' })
                          : t('spaces.roomCounts', { defaultValue: '{{racks}} racks • {{terrariums}} terrariums', racks: roomRacks.length, terrariums: roomTerrariums.length })}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-xl border text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        openRoom();
                      }}
                    >
                      {t('spaces.openRoom', { defaultValue: 'Open room' })}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
            {t('spaces.emptyState', { defaultValue: 'No rooms yet. Create one to track racks and terrariums.' })}
          </div>
        )}
      </div>

      <RoomModal
        open={Boolean(activeRoom)}
        room={activeRoom}
        racks={activeRacks}
        terrariums={activeTerrariums}
        roomIndex={activeRoomIndex}
        roomCount={rooms.length}
        onClose={() => setActiveRoomId(null)}
        onRenameRoom={handlePromptRenameRoom}
        onDeleteRoom={handleConfirmDeleteRoom}
        onMoveRoom={onMoveRoom}
        onCreateRack={(room) => openRackForm(room.id)}
        onEditRack={(rackId) => activeRoom && openRackForm(activeRoom.id, rackId)}
        onDeleteRack={onDeleteHeatRack}
        onViewRack={(rackId) => setRackViewId(rackId)}
        onCreateTerrarium={(room) => openTerrariumForm(room.id)}
        onEditTerrarium={(terrariumId) => activeRoom && openTerrariumForm(activeRoom.id, terrariumId)}
        onDeleteTerrarium={onDeleteTerrarium}
        onViewTerrarium={(terrariumId) => setTerrariumViewId(terrariumId)}
      />

      <HeatRackFormModal
        open={Boolean(rackFormState.mode)}
        mode={rackFormState.mode}
        room={rackModalRoom}
        rack={editingRack}
        onSubmit={handleRackFormSubmit}
        onCancel={() => setRackFormState({ mode: null, roomId: null, rackId: null })}
      />

      <TerrariumFormModal
        open={Boolean(terrariumFormState.mode)}
        mode={terrariumFormState.mode}
        room={terrariumModalRoom}
        terrarium={editingTerrarium}
        onSubmit={handleTerrariumFormSubmit}
        onCancel={() => setTerrariumFormState({ mode: null, roomId: null, terrariumId: null })}
      />

      <RackView
        rack={rackForView}
        snakeOptions={snakeOptions}
        snakeMap={snakeMap}
        occupiedSnakeIds={occupiedSnakeIds}
        onAssign={onAssignRackSlot}
        onEdit={(rackId) => {
          if (!rackId) return;
          const rack = heatRacks.find(item => item.id === rackId);
          if (rack) {
            setRackViewId(null);
            openRackForm(rack.roomId, rack.id);
          }
        }}
        onDelete={(rackId) => {
          onDeleteHeatRack?.(rackId);
          setRackViewId(null);
        }}
        onClose={() => setRackViewId(null)}
      />

      <TerrariumView
        terrarium={terrariumForView}
        snakeOptions={snakeOptions}
        snakeMap={snakeMap}
        onEdit={(terrariumId) => {
          if (!terrariumId) return;
          const terrarium = terrariums.find(item => item.id === terrariumId);
          if (terrarium) {
            setTerrariumViewId(null);
            openTerrariumForm(terrarium.roomId, terrarium.id);
          }
        }}
        onDelete={(terrariumId) => {
          onDeleteTerrarium?.(terrariumId);
          setTerrariumViewId(null);
        }}
        onUpdateOccupants={onUpdateTerrariumOccupants}
        onClose={() => setTerrariumViewId(null)}
      />
    </Card>
  );
}

function QRModal({ id, name, morphs, hets, possibleHets, dataUrl, onClose }) {
  if (!id) return null;
  const geneticsTokens = combineMorphsAndHetsForDisplay(morphs, hets, possibleHets);
  if (typeof document === 'undefined') return null;
  return createPortal((
    <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center p-4 z-[10010]" onClick={onClose}>
      <div className="relative z-[10011] bg-white p-4 rounded-lg shadow" onClick={e=>e.stopPropagation()}>
        <div className="font-medium mb-2">QR for {name || id}</div>
        <div className="text-sm text-neutral-500 mb-2">ID: <span className="font-mono">{id}</span></div>
        <div className="space-y-1 mb-3">
          {geneticsTokens.length ? <GeneLine label="Genetics" genes={geneticsTokens} size="md" /> : <div className="text-xs text-neutral-500 uppercase tracking-wide">Genetics: -</div>}
        </div>
        {dataUrl ? <img src={dataUrl} className="w-64 h-64" alt={`QR ${id}`} /> : <div className="w-64 h-64 flex items-center justify-center">Generating…</div>}
        <div className="mt-3 flex gap-2">
          {dataUrl && <a className="px-3 py-2 rounded-lg text-sm border" download={`snake-${id}.png`} href={dataUrl}>Download</a>}
          <button className="px-3 py-2 rounded-lg text-sm border" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  ), document.body);
}

function EggBoxModal({ box, onClose, onSave, theme = 'blue' }) {
  const [notes, setNotes] = useState('');
  const [badEggs, setBadEggs] = useState('0');

  useEffect(() => {
    setNotes(box?.notes || '');
    setBadEggs(String(box?.badEggs || 0));
  }, [box]);

  if (!box || typeof document === 'undefined') return null;

  const title = box.eggBoxCount > 1
    ? `Egg box #${box.eggBoxNumber} (${box.eggBoxIndexInClutch} of ${box.eggBoxCount})`
    : `Egg box #${box.eggBoxNumber}`;
  const originalEggs = Math.max(0, Number(box.originalEggs ?? box.eggs) || 0);
  const badEggsCount = Math.max(0, Math.min(originalEggs, Math.floor(Number(badEggs) || 0)));
  const goodEggsCount = Math.max(0, originalEggs - badEggsCount);

  return createPortal((
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-[10020]" onClick={onClose}>
      <div className="relative z-[10021] bg-white w-full max-w-xl rounded-2xl shadow-2xl border overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-lg">{title}</div>
            <div className="text-sm text-neutral-500">Clutch #{box.clutchNumber || box.number}</div>
          </div>
          <button type="button" className="px-3 py-2 rounded-xl border text-sm" onClick={onClose}>Close</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border bg-neutral-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">Pairing</div>
              <div className="mt-1 font-medium text-neutral-900">{box.pairingLabel}</div>
            </div>
            <div className="rounded-xl border bg-neutral-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">Good eggs in this box</div>
              <div className="mt-1 font-medium text-neutral-900">{goodEggsCount}</div>
              <div className="mt-1 text-xs text-neutral-500">Started with {originalEggs}</div>
            </div>
            <div className="rounded-xl border bg-neutral-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">Laid</div>
              <div className="mt-1 font-medium text-neutral-900">{box.laidLabel || '-'}</div>
            </div>
            <div className="rounded-xl border bg-neutral-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">Due</div>
              <div className="mt-1 font-medium text-neutral-900">{box.dueLabel || '-'}</div>
            </div>
            {typeof box.remaining === 'number' ? (
              <div className="rounded-xl border bg-neutral-50 p-3 sm:col-span-2">
                <div className="text-[11px] uppercase tracking-wide text-neutral-500">Remaining</div>
                <div className="mt-1 font-medium text-neutral-900">{box.remaining} days</div>
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-medium">Bad eggs</label>
            <input
              type="number"
              min="0"
              max={originalEggs}
              className="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
              value={badEggs}
              onChange={e => setBadEggs(e.target.value)}
            />
            <div className="mt-1 text-xs text-neutral-500">
              Enter eggs that went bad. The egg box count will reduce to {goodEggsCount}.
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Egg box notes</label>
            <textarea
              className="mt-1 w-full min-h-32 border rounded-xl px-3 py-2 text-sm"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add incubation notes, egg condition, movement, or reminders."
            />
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button type="button" className="px-3 py-2 rounded-xl border text-sm" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, true))}
            onClick={() => onSave?.(box, { notes, badEggs: badEggsCount })}
          >
            Save egg box
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

function ExportQrModal({ open, onClose, snakes, groups, onGenerate, theme='blue', showAppAlert }) {
  const [mode, setMode] = useState('all'); // all | groups | selected
  const [selectedGroupsLocal, setSelectedGroupsLocal] = useState([]);
  const [selectedSnakesLocal, setSelectedSnakesLocal] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { t } = useTranslation();

  useEffect(()=>{ if (!open) { setMode('all'); setSelectedGroupsLocal([]); setSelectedSnakesLocal([]); setIsGenerating(false); } }, [open]);

  const handleGenerate = async () => {
    let toExport = [];
    if (mode === 'all') toExport = snakes;
    else if (mode === 'groups') {
      toExport = snakes.filter(s => (s.groups||[]).some(g=>selectedGroupsLocal.includes(g)));
    } else {
      toExport = snakes.filter(s => selectedSnakesLocal.includes(s.id));
    }
    if (!toExport.length) {
      const message = t("qrModal.emptySelection", { defaultValue: "Select at least one animal to export." });
      if (typeof showAppAlert === 'function') showAppAlert(message);
      else console.warn(message);
      return;
    }
    try {
      setIsGenerating(true);
      await onGenerate(toExport);
      onClose();
    } catch (err) {
      const message = err?.message || t("qrModal.exportFailed", { defaultValue: "QR export failed." });
      if (typeof showAppAlert === 'function') showAppAlert(message);
      else console.error('QR export failed', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return open && typeof document !== 'undefined' ? createPortal((
    <div className={cx("fixed inset-0 flex items-center justify-center p-4 z-[10010]", overlayClass(theme))} onClick={isGenerating ? undefined : onClose}>
      <div className="relative z-[10011] bg-white p-4 rounded-lg shadow w-full max-w-2xl" onClick={e=>e.stopPropagation()}>
        <div className="font-medium mb-2">{t("qrModal.title", { defaultValue: "Export QR to PDF (100mm x 50mm)" })}</div>
        <div className="space-y-3">
          <div>
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode==='all'} onChange={()=>setMode('all')} /> {t("qrModal.allSnakes", { defaultValue: "All snakes" })}</label>
          </div>
          <div>
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode==='groups'} onChange={()=>setMode('groups')} /> {t("qrModal.byGroups", { defaultValue: "By groups" })}</label>
            {mode==='groups' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {groups.map(g=>{
                  const checked = selectedGroupsLocal.includes(g);
                  return <label key={g} className="inline-flex items-center gap-2 px-2 py-1 border rounded-lg"><input type="checkbox" checked={checked} onChange={e=>{
                    const on = e.target.checked; setSelectedGroupsLocal(prev=>{
                      const set = new Set(prev||[]); on?set.add(g):set.delete(g); return [...set];
                    });
                  }} />{g}</label>;
                })}
              </div>
            )}
          </div>
          <div>
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode==='selected'} onChange={()=>setMode('selected')} /> {t("qrModal.selectedSnakes", { defaultValue: "Selected snakes" })}</label>
            {mode==='selected' && (
              <div className="mt-2 max-h-40 overflow-auto border rounded p-2">
                {snakes.map(s=>{
                  const checked = selectedSnakesLocal.includes(s.id);
                  return <label key={s.id} className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={e=>{
                    const on = e.target.checked; setSelectedSnakesLocal(prev=>{
                      const set = new Set(prev||[]); on?set.add(s.id):set.delete(s.id); return [...set];
                    });
                  }} />{s.name} <span className="text-xs text-neutral-500">{s.id}</span></label>;
                })}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-lg border" onClick={onClose} disabled={isGenerating}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
          <button className={cx('px-3 py-2 rounded-lg text-white', primaryBtnClass(theme,true))} onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? t("qrModal.generating", { defaultValue: "Generating..." }) : t("qrModal.generate", { defaultValue: "Generate PDF" })}
          </button>
        </div>
      </div>
    </div>
  ), document.body) : null;
}

function ExportPairingQrModal({ open, onClose, pairings = [], snakes = [], onGenerate, theme = 'blue', showAppAlert }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!open) {
      setMode('all');
      setSelectedIds([]);
      setIsGenerating(false);
    }
  }, [open]);

  const summaries = useMemo(() => {
    return pairings.map(pairing => {
      const male = snakeById(snakes, pairing.maleId);
      const female = snakeById(snakes, pairing.femaleId);
      const maleName = male?.name || pairing.maleId || t('snake.sex.male', { defaultValue: 'Male' });
      const femaleName = female?.name || pairing.femaleId || t('snake.sex.female', { defaultValue: 'Female' });
      const label = pairing.label || `${femaleName} × ${maleName}`;
      return {
        id: pairing.id,
        label,
        maleName,
        femaleName,
      };
    });
  }, [pairings, snakes, t]);

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev || []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return Array.from(next);
    });
  };

  const handleGenerate = async () => {
    if (typeof onGenerate !== 'function') {
      onClose();
      return;
    }
    const payload = mode === 'all'
      ? pairings
      : pairings.filter(p => selectedIds.includes(p.id));
    if (!payload.length) {
      if (typeof showAppAlert === 'function') {
        showAppAlert('Select at least one pairing to export.');
      } else {
        console.warn('Select at least one pairing to export.');
      }
      return;
    }
    try {
      setIsGenerating(true);
      await onGenerate(payload);
      onClose();
    } finally {
      setIsGenerating(false);
    }
  };

  return open && typeof document !== 'undefined' ? createPortal((
    <div className={cx('fixed inset-0 flex items-center justify-center p-4 z-[10010]', overlayClass(theme))} onClick={isGenerating ? undefined : onClose}>
      <div className="relative z-[10011] bg-white w-full max-w-2xl rounded-2xl shadow-xl border" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b font-semibold">
          {t('pairingQrModal.title', { defaultValue: 'Export pairing QR labels' })}
        </div>
        <div className="p-4 space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} />
            {t('pairingQrModal.all', { defaultValue: 'All pairings' })}
          </label>
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={mode === 'selected'} onChange={() => setMode('selected')} />
              {t('pairingQrModal.selected', { defaultValue: 'Selected pairings' })}
            </label>
            {mode === 'selected' && (
              <div className="mt-2 max-h-64 overflow-auto rounded-xl border divide-y">
                {summaries.length ? summaries.map(item => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <label key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <input type="checkbox" checked={checked} onChange={() => toggleSelection(item.id)} />
                      <span className="flex-1">
                        <span className="font-medium block">{item.label}</span>
                        <span className="text-xs text-neutral-500">
                          {t('pairingQrModal.pairingMeta', {
                            defaultValue: 'Male: {{male}} — Female: {{female}}',
                            male: item.maleName,
                            female: item.femaleName,
                          })}
                        </span>
                      </span>
                    </label>
                  );
                }) : (
                  <div className="px-3 py-4 text-sm text-neutral-500">{t('pairingQrModal.none', { defaultValue: 'No pairings available.' })}</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button type="button" className="px-3 py-2 rounded-xl border text-sm" onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            className={cx('px-3 py-2 rounded-xl text-sm text-white', primaryBtnClass(theme, true), !pairings.length && 'opacity-60 cursor-not-allowed')}
            onClick={handleGenerate}
            disabled={!pairings.length || isGenerating}
          >
            {isGenerating
              ? t('pairingQrModal.generating', { defaultValue: 'Generating...' })
              : t('pairingQrModal.generate', { defaultValue: 'Generate labels' })}
          </button>
        </div>
      </div>
    </div>
  ), document.body) : null;
}

const PT_TO_MM = 0.352778;

function fitTextToWidth(doc, text, maxWidth, maxFontSize = 18, minFontSize = 8) {
  if (!text) return minFontSize;
  let size = maxFontSize;
  while (size >= minFontSize) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= maxWidth) return size;
    size -= 1;
  }
  doc.setFontSize(minFontSize);
  return minFontSize;
}

function estimateLineHeight(fontSize, multiplier = 1.2) {
  return fontSize * PT_TO_MM * multiplier;
}

const canUseCanvas = typeof document !== 'undefined' && typeof document.createElement === 'function';

async function createQrDataUrl(text, logoUrl) {
  const size = 600;
  try {
    if (canUseCanvas) {
      const canvas = document.createElement('canvas');
      await new Promise((resolve, reject) => {
        QRCode.toCanvas(canvas, text, { width: size, margin: 1 }, err => err ? reject(err) : resolve());
      });
      if (logoUrl) {
        try {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const logo = await loadImageElement(logoUrl);
            const logoRatio = 0.2;
            const logoSize = size * logoRatio;
            const padding = logoSize * 0.25;
            const logoX = (size - logoSize) / 2;
            const logoY = (size - logoSize) / 2;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(logoX - padding / 2, logoY - padding / 2, logoSize + padding, logoSize + padding);
            ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
          }
        } catch (logoErr) {
          console.warn('Unable to overlay logo on QR code', logoErr);
        }
      }
      return canvas.toDataURL('image/png');
    }
  } catch (e) {
    console.warn('Falling back to basic QR generation', e);
  }
  return await QRCode.toDataURL(text, { width: size, margin: 1 });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function formatCatalogSex(rawSex) {
  const normalized = normalizeSexValue(rawSex);
  if (normalized === 'M') return '1.0';
  if (normalized === 'F') return '0.1';
  return String(rawSex || 'Unknown').trim() || 'Unknown';
}

function resolveCatalogMorph(animal) {
  if (!animal || typeof animal !== 'object') return '';
  if (typeof animal.genetics === 'string' && animal.genetics.trim()) {
    return animal.genetics.trim();
  }
  const normalized = normalizeMorphHetLists([
    ...(Array.isArray(animal.morphs) ? animal.morphs : []),
    ...(Array.isArray(animal.hets) ? animal.hets : []),
  ]);
  const tokens = combineMorphsAndHetsForDisplay(normalized.morphs, normalized.hets, animal.possibleHets);
  return tokens.join(', ');
}

function resolvePrimaryAnimalImage(animal) {
  if (!animal || typeof animal !== 'object') return '';
  if (typeof animal.primaryImage === 'string' && animal.primaryImage.trim()) return animal.primaryImage.trim();
  if (typeof animal.imageUrl === 'string' && animal.imageUrl.trim()) return animal.imageUrl.trim();
  const photos = Array.isArray(animal.photos) ? animal.photos : [];
  const latest = photos.length ? photos[photos.length - 1] : null;
  if (latest && typeof latest.url === 'string' && latest.url.trim()) return latest.url.trim();
  return '';
}

function isSnakeTaggedForSell(animal) {
  if (!animal || typeof animal !== 'object') return false;
  if (animal.forSale === true || animal.isForSale === true) return true;
  const statusToken = String(animal.status || '').trim().toLowerCase();
  if (
    statusToken === 'for sale'
    || statusToken === 'forsale'
    || statusToken === 'for sell'
    || statusToken === 'forsell'
    || statusToken.includes('for sale')
    || statusToken.includes('for sell')
  ) {
    return true;
  }
  const tags = Array.isArray(animal.tags) ? animal.tags : [];
  return tags.some((tag) => {
    const token = String(tag || '').trim().toLowerCase();
    return token === 'for sale' || token === 'forsale' || token === 'for sell' || token === 'forsell' || token === 'sale' || token === 'available';
  });
}

function drawCatalogImagePlaceholder(doc, x, y, width, height) {
  doc.setFillColor(225, 228, 232);
  doc.rect(x, y, width, height, 'F');
  doc.setDrawColor(190, 195, 201);
  doc.setLineWidth(0.3);
  doc.rect(x, y, width, height);
  doc.setTextColor(120, 125, 130);
  doc.setFontSize(14);
  setPdfFont(doc, 'normal');
  doc.text('No Image', x + (width / 2), y + (height / 2), { align: 'center', baseline: 'middle' });
}

async function generateSnakeCatalogPDF(animals = []) {
  if (!Array.isArray(animals) || !animals.length) {
    throw new Error('No animals available for catalog generation.');
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' });
  await applyPdfUnicodeFont(doc);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pagePadding = 12;
  const contentW = pageW - (pagePadding * 2);
  const contentH = pageH - (pagePadding * 2);
  const textColumnW = contentW * 0.37;
  const imageColumnW = contentW * 0.63;
  const textX = pagePadding + 4;
  const textLabelW = 24;
  const lineHeight = 7;
  const morphMaxWidth = Math.max(40, textColumnW - textLabelW - 8);
  const imageX = pagePadding + textColumnW;
  const imageY = pagePadding;
  const imageW = imageColumnW;
  const imageH = contentH;

  for (let index = 0; index < animals.length; index += 1) {
    if (index > 0) {
      doc.addPage('a4', 'landscape');
    }

    const animal = animals[index] || {};
    const idValue = String(animal.id || '—');
    const sexValue = formatCatalogSex(animal.sex);
    const morphValue = resolveCatalogMorph(animal) || '—';
    const priceRaw = animal.price;
    const pairingRaw = animal.pairing;
    const taggedForSell = isSnakeTaggedForSell(animal);
    const hasPrice = !(priceRaw === null || typeof priceRaw === 'undefined' || String(priceRaw).trim() === '');
    const hasPairing = !(pairingRaw === null || typeof pairingRaw === 'undefined' || String(pairingRaw).trim() === '');

    doc.setFillColor(244, 244, 244);
    doc.rect(0, 0, pageW, pageH, 'F');

    const primaryImage = resolvePrimaryAnimalImage(animal);
    if (primaryImage) {
      try {
        const image = await loadImageElement(primaryImage);
        const naturalW = Number(image.naturalWidth || image.width || 0);
        const naturalH = Number(image.naturalHeight || image.height || 0);
        if (naturalW > 0 && naturalH > 0) {
          const scale = Math.min(imageW / naturalW, imageH / naturalH);
          const drawW = naturalW * scale;
          const drawH = naturalH * scale;
          const drawX = imageX + ((imageW - drawW) / 2);
          const drawY = imageY + ((imageH - drawH) / 2);
          doc.addImage(primaryImage, 'JPEG', drawX, drawY, drawW, drawH);
        } else {
          drawCatalogImagePlaceholder(doc, imageX, imageY, imageW, imageH);
        }
      } catch (err) {
        drawCatalogImagePlaceholder(doc, imageX, imageY, imageW, imageH);
      }
    } else {
      drawCatalogImagePlaceholder(doc, imageX, imageY, imageW, imageH);
    }

    let cursorY = pagePadding + 22;
    const drawField = (label, value, { multiline = false } = {}) => {
      setPdfFont(doc, 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(28, 28, 28);
      doc.text(`${label}:`, textX, cursorY);
      setPdfFont(doc, 'normal');
      if (multiline) {
        const lines = doc.splitTextToSize(String(value || ''), morphMaxWidth);
        doc.text(lines, textX + textLabelW, cursorY);
        cursorY += (Math.max(1, lines.length) * 5.4) + 4;
      } else {
        doc.text(String(value || '—'), textX + textLabelW, cursorY);
        cursorY += lineHeight;
      }
    };

    drawField('ID', idValue);
    drawField('SEX', sexValue);
    drawField('MORPH', morphValue, { multiline: true });
    if (taggedForSell || hasPrice) drawField('PRICE', hasPrice ? String(priceRaw).trim() : '');
    if (hasPairing) drawField('PAIRING', String(pairingRaw).trim());
  }

  doc.save(`snake-catalog-${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function exportQrToPdf(snakesToExport, breederInfo = {}) {
  if (!Array.isArray(snakesToExport) || !snakesToExport.length) {
    throw new Error('Select at least one animal to export.');
  }
  const exportRows = snakesToExport
    .filter(Boolean)
    .map(snake => ({ ...snake, id: String(snake.id || '').trim() }))
    .filter(snake => snake.id);
  if (!exportRows.length) {
    throw new Error('Selected animals do not have IDs to export.');
  }
  const { jsPDF } = await import('jspdf');
  const layout = resolvePdfLabelLayout(breederInfo?.pdfLabelSettings);
  const pageW = layout.pageWidthMm;
  const pageH = layout.pageHeightMm;
  const pageOrientation = pageW >= pageH ? 'landscape' : 'portrait';
  const doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: pageOrientation });
  await applyPdfUnicodeFont(doc);
  const slotsPerPage = layout.mode === 'sheet'
    ? Math.max(1, Math.floor(layout.columns) * Math.floor(layout.rows))
    : 1;

  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : '';
  let renderedCount = 0;

  for (let i = 0; i < exportRows.length; i++) {
    if (i > 0 && i % slotsPerPage === 0) {
      doc.addPage([pageW, pageH], pageOrientation);
    }
    const slotIndex = i % slotsPerPage;
    const slotColumn = layout.mode === 'sheet' ? (slotIndex % layout.columns) : 0;
    const slotRow = layout.mode === 'sheet' ? Math.floor(slotIndex / layout.columns) : 0;
    const labelX = layout.marginLeftMm + (slotColumn * (layout.labelWidthMm + layout.gapXmm));
    const labelY = layout.marginTopMm + (slotRow * (layout.labelHeightMm + layout.gapYmm));
    const labelW = layout.labelWidthMm;
    const labelH = layout.labelHeightMm;

    const s = exportRows[i];
    const url = `${baseUrl}#snake=${encodeURIComponent(s.id)}`;
    try {
      let dataUrl;
      try {
        dataUrl = await createQrDataUrl(url, breederInfo?.logoUrl);
      } catch (qrErr) {
        console.warn('Logo QR generation failed; retrying without logo', qrErr);
        dataUrl = await createQrDataUrl(url, null);
      }
      const margin = Math.max(1.5, Math.min(4, labelW * 0.05));
      const qrSize = Math.min(labelH - margin * 2, Math.max(14, Math.min(38, labelW * 0.45)));
      const qrX = labelX + margin;
      const qrY = labelY + ((labelH - qrSize) / 2);
      doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

      const framePadding = 1.5;
      doc.setDrawColor(50);
      doc.setLineWidth(0.3);
      doc.rect(qrX - framePadding, qrY - framePadding, qrSize + framePadding * 2, qrSize + framePadding * 2);

      const textWidth = Math.max(12, (labelX + labelW) - (qrX + qrSize) - margin - 2);
      const nameText = s.name || 'Unnamed';
      const idText = s.id ? `ID: ${s.id}` : '';
      const normalizedSex = normalizeSexValue(s.sex);
      const sexText = normalizedSex === 'M' ? 'Sex: Male' : (normalizedSex === 'F' ? 'Sex: Female' : '');
  const geneticsTokens = combineMorphsAndHetsForDisplay(s.morphs, s.hets, s.possibleHets);
  const geneticsText = geneticsTokens.join(', ');

      let nameFont = fitTextToWidth(doc, nameText, textWidth, 18, 10);
      const nameFontMin = 8;
      let idFont = 10;
      const idFontMin = 8;
      if (idText) {
        idFont = fitTextToWidth(doc, idText, textWidth, idFont, idFontMin);
      }
      let geneticsFont = 9;
      const minGeneticsFont = 6;

      const recomputeNameMetrics = () => {
        doc.setFontSize(nameFont);
        const lines = doc.splitTextToSize(nameText, textWidth);
        const lineHeight = estimateLineHeight(nameFont, 1);
        return { lines, lineHeight, height: lines.length * lineHeight };
      };

      let { lines: nameLines, height: nameHeight } = recomputeNameMetrics();

  const geneticsSections = geneticsText ? [`Genetics: ${geneticsText}`] : [];

      const maxContentHeight = labelH - margin * 2;

      const calculateGeneticsLayout = (fontSize) => {
        doc.setFontSize(fontSize);
        const lines = [];
        geneticsSections.forEach(section => {
          const sectionLines = doc.splitTextToSize(section, textWidth);
          lines.push(...sectionLines);
        });
        const height = lines.length ? lines.length * estimateLineHeight(fontSize, 1) : 0;
        return { lines, height };
      };

      let { lines: geneticsLines, height: geneticsHeight } = calculateGeneticsLayout(geneticsFont);

      const spacingAfterName = 3;
      let spacingAfterId = (sexText || geneticsLines.length) ? 2 : 0;
      let spacingAfterSex = geneticsLines.length ? 2 : 0;
      let idHeight = idText ? estimateLineHeight(idFont, 1) : 0;
      let sexHeight = sexText ? estimateLineHeight(idFont, 1) : 0;
      let totalHeight = nameHeight + spacingAfterName + idHeight + spacingAfterId + sexHeight + spacingAfterSex + geneticsHeight;

      const recomputeIdHeights = () => {
        idHeight = idText ? estimateLineHeight(idFont, 1) : 0;
        sexHeight = sexText ? estimateLineHeight(idFont, 1) : 0;
      };

      while (totalHeight > maxContentHeight) {
        if (geneticsFont > minGeneticsFont) {
          geneticsFont -= 1;
          ({ lines: geneticsLines, height: geneticsHeight } = calculateGeneticsLayout(geneticsFont));
        } else if (nameFont > nameFontMin) {
          nameFont = Math.max(nameFont - 1, nameFontMin);
          ({ lines: nameLines, height: nameHeight } = recomputeNameMetrics());
        } else if (idFont > idFontMin) {
          idFont -= 1;
          recomputeIdHeights();
        } else {
          break;
        }
        spacingAfterId = (sexText || geneticsLines.length) ? 2 : 0;
        spacingAfterSex = geneticsLines.length ? 2 : 0;
        recomputeIdHeights();
        totalHeight = nameHeight + spacingAfterName + idHeight + spacingAfterId + sexHeight + spacingAfterSex + geneticsHeight;
      }

      let textY = labelY + ((labelH - totalHeight) / 2);
      if (textY < (labelY + margin)) textY = labelY + margin;
      const textX = qrX + qrSize + 8;

    setPdfFont(doc, 'bold');
    doc.setFontSize(nameFont);
    doc.text(nameLines, textX, textY, { baseline: 'top' });
    textY += nameHeight + spacingAfterName;

      setPdfFont(doc, 'normal');
      if (idText) {
        doc.setFontSize(idFont);
        doc.text(idText, textX, textY, { baseline: 'top' });
        textY += idHeight + spacingAfterId;
      }

      if (sexText) {
        doc.setFontSize(idFont);
        doc.text(sexText, textX, textY, { baseline: 'top' });
        textY += sexHeight + spacingAfterSex;
      }

      if (geneticsLines.length) {
        doc.setFontSize(geneticsFont);
        doc.text(geneticsLines, textX, textY, { baseline: 'top' });
      }
      renderedCount += 1;

    } catch (err) {
      console.error('QR gen failed', err);
    }

    doc.setDrawColor(120);
    doc.setLineWidth(0.25);
    doc.rect(labelX, labelY, labelW, labelH);
  }

  if (!renderedCount) {
    throw new Error('QR export failed before any labels could be generated.');
  }

  doc.save('qr-labels.pdf');
}

async function exportPairingQrLabels(pairingsToExport, { snakes = [], breederInfo = {} } = {}) {
  if (!Array.isArray(pairingsToExport) || !pairingsToExport.length) {
    throw new Error('Select at least one pairing to export.');
  }
  const { jsPDF } = await import('jspdf');
  const layout = resolvePdfLabelLayout(breederInfo?.pdfLabelSettings);
  const pageW = layout.pageWidthMm;
  const pageH = layout.pageHeightMm;
  const pageOrientation = pageW >= pageH ? 'landscape' : 'portrait';
  const doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: pageOrientation });
  await applyPdfUnicodeFont(doc);
  const slotsPerPage = layout.mode === 'sheet'
    ? Math.max(1, Math.floor(layout.columns) * Math.floor(layout.rows))
    : 1;

  const snakesById = new Map((snakes || []).filter(Boolean).map(s => [s.id, s]));
  const maxAppointments = 5;

  for (let i = 0; i < pairingsToExport.length; i++) {
    if (i > 0 && i % slotsPerPage === 0) {
      doc.addPage([pageW, pageH], pageOrientation);
    }
    const slotIndex = i % slotsPerPage;
    const slotColumn = layout.mode === 'sheet' ? (slotIndex % layout.columns) : 0;
    const slotRow = layout.mode === 'sheet' ? Math.floor(slotIndex / layout.columns) : 0;
    const labelX = layout.marginLeftMm + (slotColumn * (layout.labelWidthMm + layout.gapXmm));
    const labelY = layout.marginTopMm + (slotRow * (layout.labelHeightMm + layout.gapYmm));
    const labelW = layout.labelWidthMm;
    const labelH = layout.labelHeightMm;

    const raw = pairingsToExport[i];
    if (!raw) continue;
    const pairing = withPairingLifecycleDefaults(raw);
    if (!pairing.id) continue;

    const maleSnake = snakesById.get(pairing.maleId);
    const femaleSnake = snakesById.get(pairing.femaleId);
    const maleName = maleSnake?.name || pairing.maleId || 'Male';
    const femaleName = femaleSnake?.name || pairing.femaleId || 'Female';
    const pairingLabel = pairing.label || `${femaleName} × ${maleName}`;
    const link = `${window.location.origin}${window.location.pathname}#pairing=${encodeURIComponent(pairing.id)}`;

    const appointments = (pairing.appointments || [])
      .filter(ap => ap && ap.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, maxAppointments)
      .map(ap => formatDateForDisplay(ap.date) || ap.date);

    while (appointments.length < maxAppointments) {
      appointments.push('');
    }

    const margin = Math.max(1.5, Math.min(4, labelW * 0.05));
    const checkboxSize = Math.max(2.8, Math.min(3.8, labelW * 0.045));
    const layoutConfig = {
      qrSize: Math.min(labelH - margin * 2, Math.max(16, Math.min(34, labelW * 0.42))),
      minQrSize: 14,
      labelFont: 10,
      labelMin: 7.5,
      infoFont: 7.5,
      infoMin: 6,
      headingFont: 7,
      headingMin: 6,
      lineSpacing: 3.8,
      minLineSpacing: checkboxSize + 0.2,
    };
    const maxContentHeight = labelH - margin * 2;

    const computeLayoutState = () => {
      const qrSize = layoutConfig.qrSize;
      const qrX = labelX + margin;
      const qrY = labelY + ((labelH - qrSize) / 2);
      const textX = qrX + qrSize + Math.max(3, margin);
      const textWidth = Math.max(10, (labelX + labelW) - textX - margin);
      const positions = {};
      let cursorY = labelY + margin;

      setPdfFont(doc, 'bold');
      doc.setFontSize(layoutConfig.labelFont);
      const labelLines = doc.splitTextToSize(pairingLabel, textWidth);
      const labelHeight = labelLines.length * estimateLineHeight(layoutConfig.labelFont, 1);
      positions.labelY = cursorY;
      cursorY += labelHeight + 0.8;

      setPdfFont(doc, 'normal');
      doc.setFontSize(layoutConfig.infoFont);
      const maleLines = doc.splitTextToSize(`Male: ${maleName}`, textWidth);
      const maleHeight = maleLines.length * estimateLineHeight(layoutConfig.infoFont, 1);
      positions.maleY = cursorY;
      cursorY += maleHeight + 0.5;

      const femaleLines = doc.splitTextToSize(`Female: ${femaleName}`, textWidth);
      const femaleHeight = femaleLines.length * estimateLineHeight(layoutConfig.infoFont, 1);
      positions.femaleY = cursorY;
      cursorY += femaleHeight + 0.7;

      setPdfFont(doc, 'bold');
      doc.setFontSize(layoutConfig.headingFont);
      positions.headingY = cursorY;
      const headingHeight = estimateLineHeight(layoutConfig.headingFont, 1);
      cursorY += headingHeight + 0.4;

      setPdfFont(doc, 'normal');
      doc.setFontSize(layoutConfig.infoFont);
      positions.appointmentsY = cursorY;

      let desiredSpacing = Math.max(layoutConfig.minLineSpacing, layoutConfig.lineSpacing);
      const availableSpace = (labelY + labelH - margin) - cursorY - checkboxSize;
      if (availableSpace < desiredSpacing * maxAppointments) {
        desiredSpacing = Math.max(layoutConfig.minLineSpacing, availableSpace / maxAppointments);
      }
      const appointmentsHeight = maxAppointments * desiredSpacing + checkboxSize;
      const totalHeight = (cursorY + appointmentsHeight) - (labelY + margin);

      return {
        totalHeight,
        qrSize,
        qrX,
        qrY,
        textX,
        textWidth,
        labelLines,
        maleLines,
        femaleLines,
        lineSpacing: desiredSpacing,
        positions,
      };
    };

    let layoutState = computeLayoutState();
    let guard = 0;
    while (layoutState.totalHeight > maxContentHeight && guard < 60) {
      let adjusted = false;
      if (layoutConfig.labelFont > layoutConfig.labelMin) {
        layoutConfig.labelFont = Math.max(layoutConfig.labelMin, layoutConfig.labelFont - 0.5);
        adjusted = true;
      } else if (layoutConfig.infoFont > layoutConfig.infoMin) {
        layoutConfig.infoFont = Math.max(layoutConfig.infoMin, layoutConfig.infoFont - 0.5);
        adjusted = true;
      } else if (layoutConfig.headingFont > layoutConfig.headingMin) {
        layoutConfig.headingFont = Math.max(layoutConfig.headingMin, layoutConfig.headingFont - 0.25);
        adjusted = true;
      } else if (layoutConfig.qrSize > layoutConfig.minQrSize) {
        layoutConfig.qrSize = Math.max(layoutConfig.minQrSize, layoutConfig.qrSize - 1);
        adjusted = true;
      } else if (layoutConfig.lineSpacing > layoutConfig.minLineSpacing) {
        layoutConfig.lineSpacing = Math.max(layoutConfig.minLineSpacing, layoutConfig.lineSpacing - 0.2);
        adjusted = true;
      }
      if (!adjusted) break;
      layoutState = computeLayoutState();
      guard += 1;
    }

    const { qrSize, qrX, qrY, textX, labelLines, maleLines, femaleLines, lineSpacing, positions } = layoutState;

    try {
      const dataUrl = await createQrDataUrl(link, breederInfo?.logoUrl);
      doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      const framePadding = 1.2;
      doc.setDrawColor(50);
      doc.setLineWidth(0.3);
      doc.rect(qrX - framePadding, qrY - framePadding, qrSize + framePadding * 2, qrSize + framePadding * 2);
    } catch (err) {
      console.error('Unable to build pairing QR code', err);
    }

    setPdfFont(doc, 'bold');
    doc.setFontSize(layoutConfig.labelFont);
    doc.text(labelLines, textX, positions.labelY, { baseline: 'top' });

    setPdfFont(doc, 'normal');
    doc.setFontSize(layoutConfig.infoFont);
    doc.text(maleLines, textX, positions.maleY, { baseline: 'top' });
    doc.text(femaleLines, textX, positions.femaleY, { baseline: 'top' });

    setPdfFont(doc, 'bold');
    doc.setFontSize(layoutConfig.headingFont);
    doc.text('Appointments', textX, positions.headingY, { baseline: 'top' });

    setPdfFont(doc, 'normal');
    doc.setFontSize(layoutConfig.infoFont);
    const textBaselineOffset = checkboxSize - 0.8;
    appointments.forEach((label, idx) => {
      const lineTop = positions.appointmentsY + idx * lineSpacing;
      doc.rect(textX, lineTop, checkboxSize, checkboxSize);
      if (label) {
        doc.text(label, textX + checkboxSize + 2, lineTop + textBaselineOffset);
      }
    });

    doc.setDrawColor(120);
    doc.setLineWidth(0.25);
    doc.rect(labelX, labelY, labelW, labelH);
  }

  doc.save('pairing-qr-labels.pdf');
}

async function exportSnakeToPdf(snake, breederInfo = {}, theme='blue', pairings = []) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await applyPdfUnicodeFont(doc);
  const pageW = 210; const pageH = 297; const left = 15; let y = 20;
  const margin = 8;

  const themeColors = { blue: '#1E40AF', green: '#059669', dark: '#374151' };
  const frameColor = themeColors[theme] || themeColors.blue;
  const normalizedSnakeSex = normalizeSexValue(snake?.sex);
  const breedingCyclesByYear = normalizedSnakeSex === 'F' ? getFemaleBreedingCyclesByYear(snake?.id, pairings) : [];

  // helper: convert #rrggbb to rgb object
  function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    const h = String(hex).replace('#','');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }

  function headerLabel(k) {
    if (!k) return '';
    // replace camelCase/snake-case/underscores with spaces, then Title Case
  const spaced = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return spaced.split(/\s+/).map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ');
  }

  // helper to draw the frame and header (logo + breeder info + snake basic header)
  function drawPageDecor(isFirstPage = false) {
    // draw frame
    doc.setDrawColor(frameColor);
    doc.setLineWidth(1.5);
    doc.rect(margin, margin, pageW - margin*2, 297 - margin*2);

    if (isFirstPage) {
      // top area for first page only
      y = 20;
      try {
        if (breederInfo && breederInfo.logoUrl) {
          try { doc.addImage(breederInfo.logoUrl, 'PNG', left, y, 20, 20); } catch(e) { /* ignore */ }
        }
      } catch (e) {}
      const infoX = left + 24;
      doc.setFontSize(14);
      if (breederInfo.businessName) {
        doc.text(breederInfo.businessName, infoX, y + 6);
        doc.setFontSize(12);
        doc.text(breederInfo.name || '', infoX, y + 12);
      } else if (breederInfo.name) {
        doc.text(breederInfo.name, infoX, y + 6);
      }
      doc.setFontSize(10);
      const contact = [];
      if (breederInfo.email) contact.push(breederInfo.email);
      if (breederInfo.phone) contact.push(breederInfo.phone);
      if (contact.length) doc.text(contact.join(' • '), infoX, y + 18);
      // separator: end of header area
      const sepY1 = y + 26;
      doc.setLineWidth(0.6);
      doc.setDrawColor(180);
      doc.line(margin + 4, sepY1, pageW - margin - 4, sepY1);

      // advance y to after separator
      y = sepY1 + 6;

      // snake header (centered, multi-line on first page)
      doc.setFontSize(16); doc.text(snake.name || '', pageW/2, y, { align: 'center' }); y += 10;
      doc.setFontSize(10);
      doc.text(`ID: ${snake.id || ''}`, left, y); doc.text(`Sex: ${snake.sex || ''}`, left + 70, y); doc.text(`Birth date: ${snake.birthDate ? formatDateForDisplay(snake.birthDate) : ''}`, left + 110, y);
      y += 7;
      doc.text(`Weight: ${snake.weight || ''} g`, left, y); doc.text(`Groups: ${(snake.groups||[]).join(', ')}`, left + 70, y);
      y += 8;
  const geneticsTokens = combineMorphsAndHetsForDisplay(snake.morphs, snake.hets, snake.possibleHets);
  const geneticsLine = geneticsTokens.length ? geneticsTokens.join(', ') : '-';
  doc.text(`Genetics: ${geneticsLine}`, left, y);
      y += 8;
      // separator between snake info and data
      const sepY2 = y + 2;
      doc.setLineWidth(0.6);
      doc.setDrawColor(180);
      doc.line(margin + 4, sepY2, pageW - margin - 4, sepY2);
      y = sepY2 + 8;
    } else {
      // subsequent pages: start a bit below the top without additional header content
      y = margin + 18;
    }
  }

  // initialize first page decor
  drawPageDecor(true);

  // Logs summary: render tables for each log type and include a footer row with the count
  const logs = snake.logs || {};
  const usableWidth = pageW - left * 2;

  const bottomLimit = pageH - margin - 6; // leave small margin inside frame
  function ensureSpace(addHeight, onNewPage) {
    if (y + addHeight > bottomLimit) {
      // move to next page so content doesn't overflow the frame
      doc.addPage();
      drawPageDecor(false);
      if (typeof onNewPage === 'function') onNewPage();
      return true;
    }
    return false;
  }

  function drawTable(title, columns, rows, opts = {}) {
  const headerH = 9;
  const cellFontSize = opts.cellFontSize || 10;
  const minRowH = Math.max(4, Math.round((cellFontSize * 0.35278) * 0.8));
  const lineHeight = (cellFontSize * 0.35278) * 1.05; // approximate mm per line (pt -> mm)
    const colCount = columns.length;
    const colWidths = columns.map(c => c.width || (usableWidth / colCount));

    function renderTableTitleAndHeader() {
      // title
      doc.setFontSize(12); doc.text(title, left, y); y += 8;

      // header background + titles
      let x = left;
      const hdr = hexToRgb(frameColor);
      doc.setFillColor(hdr.r, hdr.g, hdr.b);
      // fill the entire header row once so there are no white gaps between columns
      doc.rect(left, y, usableWidth, headerH, 'F');
      for (let i=0;i<colCount;i++) {
        // stroke border (black)
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.rect(x, y, colWidths[i], headerH, 'S');
        doc.setFontSize(8);
        doc.setTextColor(255);
        setPdfFont(doc, 'bold');
        const lbl = headerLabel(columns[i].title || columns[i].key || '');
        const centerX = x + (colWidths[i] / 2);
        const centerY = y + (headerH / 2);
        doc.text(String(lbl), centerX, centerY, { align: 'center', baseline: 'middle' });
        setPdfFont(doc, 'normal');
        x += colWidths[i];
      }
      y += headerH;
      doc.setFontSize(cellFontSize); doc.setTextColor(10);
    }

    // initial header (render or page-break as needed)
    const didPage = ensureSpace(10 + headerH, renderTableTitleAndHeader);
    if (!didPage) renderTableTitleAndHeader();

    // render rows with wrapping and dynamic row height
    rows.forEach((r, rowIndex) => {
      // prepare cell lines for this row
      doc.setFontSize(cellFontSize);
      let maxLines = 1;
      const cellLines = [];
      for (let i=0;i<colCount;i++) {
        const key = columns[i].key;
        let val = '';
        if (typeof key === 'function') val = key(r) || '';
        else val = (r && typeof r[key] !== 'undefined') ? r[key] : '';
        let txt = '';
        if (val === null || typeof val === 'undefined') txt = '';
        else if (typeof val === 'boolean') txt = val ? 'Yes' : 'No';
        else if (Array.isArray(val)) txt = val.join(', ');
        else if (typeof val === 'object') txt = JSON.stringify(val);
        else txt = String(val);
        const colKey = (typeof key === 'string') ? key : columns[i].title;
        if (typeof txt === 'string' && (colKey === 'date' || /date$/i.test(String(colKey)))) txt = formatDateForDisplay(txt) || txt;
        const lines = doc.splitTextToSize(txt, Math.max(10, colWidths[i] - 4));
        cellLines.push(lines);
        if (lines.length > maxLines) maxLines = lines.length;
      }
      // compute row height: top/bottom padding 4mm total
      const paddingV = 4;
      const rowH = Math.max(minRowH, Math.ceil(maxLines * lineHeight)) + paddingV;

      // ensure space for this row (and render header on new page if needed)
      ensureSpace(rowH + 2, renderTableTitleAndHeader);

      // draw each cell's border and text (top-aligned)
      let cx = left;
      for (let i=0;i<colCount;i++) {
        const w = colWidths[i];
        // draw cell border
        doc.setDrawColor(0);
        doc.setLineWidth(0.25);
        doc.rect(cx, y, w, rowH, 'S');
        // draw cell text starting at y + 2mm padding
        const lines = cellLines[i] || [''];
        const textX = cx + 3;
        const textY = y + (rowH / 2) - ((lines.length - 1) * lineHeight) / 2;
        // use array form to render wrapped lines, vertically centered
        doc.setFontSize(cellFontSize);
        doc.text(lines, textX, textY);
        cx += w;
      }
      y += rowH;
    });

    // footer with count inside the table (spanning full width)
  // footer: draw boxed footer cell spanning full table width
  const footerH = Math.max(minRowH, Math.ceil(lineHeight)) + 4;
  ensureSpace(footerH + 2, renderTableTitleAndHeader);
  // draw footer box
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(left, y, usableWidth, footerH, 'S');
  doc.setFontSize(Math.max(8, cellFontSize));
  // vertically center the text within footer
  const footerTextY = y + 2 + (lineHeight/2);
  doc.text(`Total entries: ${rows.length}`, left + 3, footerTextY);
  y += footerH + 4;

    const spacingAfterTable = typeof opts.spacingAfter === 'number' ? opts.spacingAfter : 0;
    if (spacingAfterTable > 0) {
      const broke = ensureSpace(spacingAfterTable, null);
      if (!broke) y += spacingAfterTable;
    }

  }

  function drawSectionSeparator() {
    const paddingBefore = 2;
    const paddingAfter = 4;
    const needed = paddingBefore + paddingAfter + 1;
    const broke = ensureSpace(needed, null);
    if (broke) return;
    y += paddingBefore;
    doc.setDrawColor(200);
    doc.setLineWidth(0.4);
    doc.line(left, y, left + usableWidth, y);
    y += paddingAfter;
  }

  function drawBreedingCyclesSection(groups) {
    if (!Array.isArray(groups) || !groups.length) return;

    const sectionHeading = () => {
      doc.setFontSize(12);
      doc.text(t("pairing.breedingCycles", { defaultValue: "Breeding cycles" }), left, y);
      y += 7;
    };

    const renderGroupHeading = (yearLabel) => {
      doc.setFontSize(10);
      doc.text(String(yearLabel), left, y);
      y += 5.5;
    };

    sectionHeading();

    const lineFontSize = 9;
    const indent = 4;
    const cycleLineHeight = estimateLineHeight(lineFontSize, 1.05);

    groups.forEach(group => {
      ensureSpace(6, () => {
        drawPageDecor(false);
        sectionHeading();
      });
      renderGroupHeading(group.year);

      (group.cycles || []).forEach(cycle => {
        const lines = [];
        const pairingLabel = cycle.label || `Pairing ${cycle.id || ''}`;
        lines.push(`• ${pairingLabel}`);

        if (cycle.locks && cycle.locks.length) {
          const lockText = cycle.locks
            .map(lock => lock.display || formatDateTimeForDisplay(lock.iso))
            .filter(Boolean)
            .join(', ');
          if (lockText) lines.push(`   Locks: ${lockText}`);
        }
        if (cycle.ovulationDate) lines.push(`   Ovulation: ${formatDateForDisplay(cycle.ovulationDate)}`);
        if (cycle.preLayDate) lines.push(`   Pre-Lay Shed: ${formatDateForDisplay(cycle.preLayDate)}`);
        if (cycle.clutchDate) lines.push(`   Eggs laid: ${formatDateForDisplay(cycle.clutchDate)}`);
        if (cycle.hatchDate) lines.push(`   Hatched: ${formatDateForDisplay(cycle.hatchDate)}`);
        if (lines.length === 1) lines.push('   No events recorded');

        const wrapped = lines.flatMap(line => doc.splitTextToSize(line, usableWidth - indent));
        const blockHeight = wrapped.length * cycleLineHeight + 2;

        ensureSpace(blockHeight + 2, () => {
          drawPageDecor(false);
          sectionHeading();
          renderGroupHeading(group.year);
        });

        doc.setFontSize(lineFontSize);
        doc.text(wrapped, left + indent, y, { baseline: 'top' });
        y += blockHeight;
      });

      y += 2;
    });
  }

  // Feeds (explicit columns)
  if (breedingCyclesByYear.length) {
    drawBreedingCyclesSection(breedingCyclesByYear);
    drawSectionSeparator();
  }

  const feedsRows = (logs.feeds||[]).slice().reverse();
  const feedsCols = [
    { title: 'Date', key: 'date', width: 26 },
    { title: 'Food', key: 'feed', width: 46 },
    { title: 'Size', key: (r) => {
        if (!r) return '';
        const candidates = [r.size, r.sizeDetail, r.preySize, r.portionSize, r.itemSize];
        const found = candidates.find(v => typeof v === 'string' && v.trim().length) || candidates.find(v => typeof v === 'number');
        if (typeof found === 'number') return `${found}`;
        return found || '';
      }, width: 30 },
    { title: 'Weight', key: (r) => (r && (r.weightGrams || r.grams)) ? `${r.weightGrams || r.grams} g` : '' , width: 24 },
    { title: 'Form', key: (r) => {
        const m = r && (r.method || r.form);
        const md = r && (r.methodDetail || r.formDetail);
        if (!m) return '';
        return m === 'Other' ? (md || 'Other') : m;
      }, width: 36 },
    { title: 'Notes', key: 'notes', width: usableWidth - (26+46+30+24+36) }
  ];
  drawTable('Feed', feedsCols, feedsRows, { cellFontSize: 6, spacingAfter: 0 });
  drawSectionSeparator();

  // Weights
  const weightsRows = (logs.weights||[]).slice().reverse();
  const weightsCols = [
    { title: 'Date', key: 'date', width: 30 },
    { title: 'Grams', key: (r) => (r && typeof r.grams !== 'undefined') ? `${r.grams} g` : '' , width: 30 },
    { title: 'Notes', key: 'notes', width: usableWidth - (30+30) }
  ];
  drawTable('Weights', weightsCols, weightsRows, { cellFontSize: 6, spacingAfter: 0 });
  drawSectionSeparator();

  // Cleanings
  const cleanRows = (logs.cleanings||[]).slice().reverse();
  const cleanCols = [
    { title: 'Date', key: 'date', width: 30 },
    { title: 'Type', key: (r) => (r && r.deep) ? 'Deep cleaning' : 'Quick cleaning', width: 40 },
    { title: 'Notes', key: 'notes', width: usableWidth - (30+40) }
  ];
  drawTable('Cleanings', cleanCols, cleanRows, { cellFontSize: 6, spacingAfter: 0 });
  drawSectionSeparator();

  // Sheds
  const shedsRows = (logs.sheds||[]).slice().reverse();
  const shedsCols = [
    { title: 'Date', key: 'date', width: 30 },
    { title: 'Status', key: (r) => (r && r.complete) ? 'Complete' : 'Incomplete', width: 30 },
    { title: 'Notes', key: 'notes', width: usableWidth - (30+30) }
  ];
  drawTable('Sheds', shedsCols, shedsRows, { cellFontSize: 6, spacingAfter: 0 });
  drawSectionSeparator();

  // Meds
  const medsRows = (logs.meds||[]).slice().reverse();
  const medsCols = [
    { title: 'Date', key: 'date', width: 30 },
    { title: 'Drug', key: 'drug', width: 48 },
    { title: 'Dose', key: (r) => (r && (r.dose || r.dose === 0)) ? `${r.dose} mg` : '', width: 26 },
    { title: 'Notes', key: 'notes', width: usableWidth - (30+48+26) }
  ];
  drawTable('Meds', medsCols, medsRows, { cellFontSize: 6, spacingAfter: 0 });

  // Add page numbers to each page (top-left corner)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    // place in top-left inside margin
    doc.text(`Page ${i} / ${totalPages}`, left, 12);
  }

  // Save the file
  const fn = `${snake.id || 'snake'}-${(snake.name||'').replace(/\s+/g,'_')}.pdf`;
  doc.save(fn);
}

function splitEggBoxCounts(totalEggs) {
  const eggs = Number(totalEggs);
  if (!Number.isFinite(eggs) || eggs <= 0) return [0];
  const normalized = Math.floor(eggs);
  if (normalized <= 10) return [normalized];
  return [Math.floor(normalized / 2), Math.ceil(normalized / 2)];
}

function fitTextBlockToWidth(doc, text, maxWidth, maxLines = 2, maxFontSize = 18, minFontSize = 7) {
  const source = String(text || '').trim();
  if (!source) return { fontSize: minFontSize, lines: [''] };
  for (let size = maxFontSize; size >= minFontSize; size -= 1) {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(source, maxWidth);
    if (lines.length <= maxLines) return { fontSize: size, lines };
  }
  doc.setFontSize(minFontSize);
  const lines = doc.splitTextToSize(source, maxWidth);
  if (lines.length <= maxLines) return { fontSize: minFontSize, lines };
  const trimmedLines = lines.slice(0, maxLines);
  let lastLine = String(trimmedLines[maxLines - 1] || '').trim();
  while (lastLine.length > 0 && doc.getTextWidth(`${lastLine}...`) > maxWidth) {
    lastLine = lastLine.slice(0, -1).trimEnd();
  }
  trimmedLines[maxLines - 1] = lastLine ? `${lastLine}...` : '...';
  return { fontSize: minFontSize, lines: trimmedLines };
}

async function exportClutchCardToPdf(details = {}) {
  const { jsPDF } = await import('jspdf');
  const pageW = 100;
  const pageH = 50;
  const margin = 6;
  const doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: 'landscape' });
  await applyPdfUnicodeFont(doc);

  const clutchNumberText = details.clutchNumber ? String(details.clutchNumber) : '—';
  const baseHeading = details.label ? details.label : (details.clutchNumber ? `Clutch #${clutchNumberText}` : 'Clutch Card');
  const femaleName = details.femaleName || '—';
  const maleName = details.maleName || '—';
  const normalizeGeneticsLine = (value) => {
    if (value === null || typeof value === 'undefined') return '';
    const text = String(value).trim();
    if (!text || text === '—') return '';
    return text;
  };
  const femaleGeneticsLine = normalizeGeneticsLine(details.femaleGenetics);
  const maleGeneticsLine = normalizeGeneticsLine(details.maleGenetics);
  const clutchDate = details.clutchDate || '';
  const estimatedHatch = clutchDate ? addDaysYmd(clutchDate, 59) : '';
  const missingValue = '\u2014';
  const resolvedEggs = resolveEggCountForClutch(details.eggsTotal, details.fertileEggs);
  const eggBoxCounts = splitEggBoxCounts(resolvedEggs);
  const firstEggBoxNumber = Number(details.eggBoxNumber);
  const hasGlobalEggBoxNumber = Number.isFinite(firstEggBoxNumber) && firstEggBoxNumber > 0;

  eggBoxCounts.forEach((boxEggs, index) => {
    if (index > 0) doc.addPage([pageW, pageH], 'landscape');
    const boxIndexInClutch = index + 1;
    const boxNumber = hasGlobalEggBoxNumber ? firstEggBoxNumber : boxIndexInClutch;
    const heading = `${baseHeading} - Egg box #${boxNumber}`;

    doc.setDrawColor(80);
    doc.setLineWidth(0.5);
    doc.roundedRect(3, 3, pageW - 6, pageH - 6, 2, 2);

    const headingLayout = fitTextBlockToWidth(doc, heading, pageW - margin * 2, 2, 16, 7);
    setPdfFont(doc, 'bold');
    doc.setFontSize(headingLayout.fontSize);
    doc.text(headingLayout.lines, pageW / 2, margin, { align: 'center', baseline: 'top' });
    setPdfFont(doc, 'normal');

    const rows = [
      { label: 'Clutch #', value: clutchNumberText },
      { label: 'Egg box #', value: String(boxNumber) },
      ...(eggBoxCounts.length > 1 ? [{ label: 'Box in clutch', value: `${boxIndexInClutch} of ${eggBoxCounts.length}` }] : []),
      { label: 'Eggs in box', value: String(boxEggs) },
      { label: 'Date', value: clutchDate ? formatDateForDisplay(clutchDate) : missingValue },
      { label: 'Female', value: femaleName, secondary: femaleGeneticsLine },
      { label: 'Male', value: maleName, secondary: maleGeneticsLine },
      { label: 'Est. hatch', value: estimatedHatch ? formatDateForDisplay(estimatedHatch) : missingValue },
    ];

    const headingHeight = headingLayout.lines.length * estimateLineHeight(headingLayout.fontSize, 0.95);
    const startY = margin + headingHeight + 2;
    let y = startY;
    const availableWidth = pageW - margin * 2;
    const bodyFont = 9;
    doc.setFontSize(bodyFont);
    const lineHeight = estimateLineHeight(bodyFont, 1.02);
    const secondaryFont = Math.max(7, bodyFont - 1);

    rows.forEach(row => {
      const line = `${row.label}: ${row.value}`;
      const lines = doc.splitTextToSize(line, availableWidth);
      doc.text(lines, margin, y, { baseline: 'top' });
      y += lines.length * lineHeight;
      if (row.secondary) {
        doc.setFontSize(secondaryFont);
        const secondaryLines = doc.splitTextToSize(`   ${row.secondary}`, availableWidth);
        doc.text(secondaryLines, margin, y, { baseline: 'top' });
        y += secondaryLines.length * estimateLineHeight(secondaryFont, 1.02);
        doc.setFontSize(bodyFont);
      }
    });
  });

  const slugSource = details.label || (details.clutchNumber ? `clutch-${details.clutchNumber}` : 'clutch-card');
  const fileSafe = slugSource
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'clutch-card';
  doc.save(`${fileSafe}.pdf`);
}

function SnakeCard({ s, onEdit, onQuickPair, onOrderGeneticTest, onDelete, groups = [], setSnakes, pairings = [], onOpenPairing, lastFeedDefaults, setLastFeedDefaults, showAppAlert }) {
  const { t } = useTranslation();
  const hasEdit = typeof onEdit === "function";
  const hasQuick = typeof onQuickPair === "function";
  const hasDelete = typeof onDelete === "function";
  const [showPairingsModal, setShowPairingsModal] = useState(false);
  const [quickTagOpen, setQuickTagOpen] = useState(null);
  const [quickDraft, setQuickDraft] = useState({
    date: localYMD(new Date()),
    notes: '',
    grams: 0,
    feed: 'Mouse',
    size: 'pinky',
    sizeDetail: '',
    form: '',
    formDetail: '',
    drug: '',
    dose: '',
    refused: false,
  });
  const cardRef = useRef(null);
  const geneticsTokens = useMemo(
    () => getDisplayedSnakeGeneticsTokens(s),
    [s?.morphs, s?.hets, s?.possibleHets, s?.labGeneticsConfirmation?.markers]
  );
  const normalizedSex = useMemo(() => normalizeSexValue(s?.sex), [s?.sex]);
  const sexSymbol = useMemo(() => {
    if (normalizedSex === 'M') return '\u2642';
    if (normalizedSex === 'F') return '\u2640';
    return '?';
  }, [normalizedSex]);
  const sexBadgeClass = useMemo(() => {
    if (normalizedSex === 'M') return 'border-sky-200 bg-sky-50 text-sky-500';
    if (normalizedSex === 'F') return 'border-rose-200 bg-rose-50 text-rose-500';
    return 'border-neutral-200 bg-neutral-50 text-neutral-500';
  }, [normalizedSex]);
  const sexLabel = useMemo(() => {
    if (normalizedSex === 'M') return t('snake.sex.male', { defaultValue: 'Male' });
    if (normalizedSex === 'F') return t('snake.sex.female', { defaultValue: 'Female' });
    return t('snake.sex.unknown', { defaultValue: 'Unknown sex' });
  }, [normalizedSex, t]);
  const displayStatus = useMemo(() => {
    const raw = typeof s?.status === 'string' ? s.status.trim() : '';
    return raw || t("snakeEdit.status", { defaultValue: "Status" });
  }, [s?.status, t]);
  const isForSale = s?.forSale === true || isSnakeTaggedForSell(s);
  const cardPriceText = useMemo(() => {
    const raw = String(s?.price ?? '').trim();
    return raw || '—';
  }, [s?.price]);
  const weightHistory = useMemo(() => {
    const entries = Array.isArray(s?.logs?.weights) ? s.logs.weights : [];
    const mapped = entries
      .map((entry, index) => {
        const rawGrams = typeof entry?.grams === 'number'
          ? entry.grams
          : typeof entry?.weightGrams === 'number'
            ? entry.weightGrams
            : typeof entry?.weight === 'number'
              ? entry.weight
              : Number(entry?.grams ?? entry?.weightGrams ?? entry?.weight ?? entry?.value);
        if (!Number.isFinite(rawGrams)) return null;
        const dateInput = entry?.date || entry?.loggedAt || entry?.createdAt || null;
        const parsedYmd = typeof dateInput === 'string' ? parseYmd(dateInput) : null;
        const parsed = parsedYmd || (dateInput ? new Date(dateInput) : null);
        if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return null;
        return {
          grams: rawGrams,
          date: parsed,
          label: formatDateForDisplay(parsed) || parsed.toLocaleDateString(),
          rawDate: dateInput || parsed.toISOString(),
          index,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return mapped.slice(-12);
  }, [s?.logs?.weights]);
  const coverPhotoUrl = useMemo(() => {
    if (s?.imageUrl) return s.imageUrl;
    if (Array.isArray(s?.photos) && s.photos.length) {
      const last = s.photos[s.photos.length - 1];
      return last?.url || null;
    }
    return null;
  }, [s?.imageUrl, s?.photos]);
  const breedingCyclesByYear = useMemo(() => {
    if (normalizedSex !== 'F') return [];
    return getFemaleBreedingCyclesByYear(s?.id, pairings);
  }, [normalizedSex, s?.id, pairings]);

  // map tag text to activity key and defaults
  function tagToActivity(tag) {
    if (!tag) return { key: 'feeds', defaults: {} };
    const t = String(tag).toLowerCase();
    if (t.includes('weight')) return { key: 'weights', defaults: { grams: 0 } };
    if (t.includes('feed') || t.includes('feeding')) return { key: 'feeds', defaults: { feed: 'Mouse', size: 'pinky', grams: 0 } };
    if (t.includes('shed')) return { key: 'sheds', defaults: { complete: true } };
    if (t.includes('clean')) return { key: 'cleanings', defaults: { deep: false } };
    if (t.includes('med')) return { key: 'meds', defaults: { drug: '', dose: '' } };
    // fallback: if tag looks numeric or is common like 'proven' -> feeds by default
    return { key: 'feeds', defaults: {} };
  }

  function openQuickForKey(key, e) {
    e && e.stopPropagation();
    const mapping = {
      feeds: t("logs.feed", { defaultValue: "Feed" }),
      weights: t("logs.weight", { defaultValue: "Weight" }),
      cleanings: t("logs.cleaning", { defaultValue: "Cleaning" }),
      sheds: t("logs.shed", { defaultValue: "Shed" }),
      meds: t("logs.meds", { defaultValue: "Meds" })
    };
    const fakeTag = mapping[key] || key;
    // compute position near the activity grid (place under top area)
    try {
      const card = cardRef.current;
      if (card) {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } catch (e) {
      // ignore positioning errors
    }
    // prefill based on key; for feeds, prefer shared lastFeedDefaults (do not bring grams)
    const activity = tagToActivity(fakeTag);
    if (activity.key === 'feeds' && lastFeedDefaults) {
      setQuickDraft({
        date: localYMD(new Date()),
        notes: lastFeedDefaults.notes || '',
        grams: activity.defaults.grams || 0,
        feed: lastFeedDefaults.feed || activity.defaults.feed || 'Mouse',
        size: lastFeedDefaults.size || activity.defaults.size || 'pinky',
        sizeDetail: lastFeedDefaults.sizeDetail || '',
        form: lastFeedDefaults.form || activity.defaults.form || '',
        formDetail: lastFeedDefaults.formDetail || '',
        refused: false,
        drug: activity.defaults.drug || '',
        dose: activity.defaults.dose || ''
      });
    } else {
      setQuickDraft({
        date: localYMD(new Date()),
        notes: '',
        grams: activity.defaults.grams || 0,
        feed: activity.defaults.feed || 'Mouse',
        size: activity.defaults.size || 'pinky',
        sizeDetail: activity.defaults.sizeDetail || '',
        form: activity.defaults.form || '',
        formDetail: activity.defaults.formDetail || '',
        drug: activity.defaults.drug || '',
        dose: activity.defaults.dose || '',
        refused: false,
      });
    }
    setQuickTagOpen(fakeTag);
  }

  function closeQuickAdd() { setQuickTagOpen(null); }


  async function submitQuickAdd(tag, options = {}) {
    if (!setSnakes) {
      if (typeof showAppAlert === 'function') {
        await showAppAlert('Editing not enabled');
      } else {
        console.warn('Editing not enabled');
      }
      closeQuickAdd();
      return;
    }
    const low = (tag||'').toLowerCase();
    // choose activity bucket
    let key = 'feeds';
    if (low.includes('weight')) key = 'weights';
    else if (low.includes('feed')) key = 'feeds';
    else if (low.includes('shed')) key = 'sheds';
    else if (low.includes('clean')) key = 'cleanings';
    else if (low.includes('med')) key = 'meds';

    const entry = { date: quickDraft.date };
    if (key === 'weights') entry.grams = Number(quickDraft.grams) || 0;
    const forceRefused = options.forceRefused === true;

    if (key === 'feeds') {
      entry.feed = quickDraft.feed;
  entry.size = quickDraft.size === 'Other' ? (quickDraft.sizeDetail || '') : quickDraft.size;
      entry.weightGrams = Number(quickDraft.grams) || 0;
      // map form -> method/methodDetail consistent with LogsEditor
      if (quickDraft.form) {
        entry.method = quickDraft.form === 'Other' ? 'Other' : quickDraft.form;
        entry.methodDetail = quickDraft.form === 'Other' ? (quickDraft.formDetail || '') : '';
      } else {
        entry.method = 'Other';
        entry.methodDetail = '';
      }
      entry.refused = forceRefused ? true : !!quickDraft.refused;
    }
    if (key === 'meds') { entry.drug = quickDraft.drug; entry.dose = quickDraft.dose; }
    entry.notes = quickDraft.notes || '';

    setSnakes(prev => prev.map(x => x.id === s.id ? ({ ...x, logs: { ...x.logs, [key]: [...(x.logs[key] || []), entry] } }) : x));
    // persist feed defaults (but NOT the weight) so next quick-add will reuse fields
    if (key === 'feeds' && typeof setLastFeedDefaults === 'function') {
      try {
        setLastFeedDefaults({
          feed: quickDraft.feed,
          size: quickDraft.size,
          sizeDetail: quickDraft.sizeDetail || '',
          form: quickDraft.form,
          formDetail: quickDraft.formDetail || '',
          notes: quickDraft.notes || '',
          refused: false,
        });
      } catch (e) {
        // ignore
      }
    }
    closeQuickAdd();
  }
  return (
  <div ref={cardRef} className="relative bg-white border rounded-xl p-2 flex flex-col gap-1 min-h-[280px] max-h-[520px] min-w-0 text-sm">
      <div className="flex items-start gap-3">
        {/* thumbnail top-left */}
        <div className="flex-shrink-0">
          {coverPhotoUrl ? (
            <div className="w-12 h-12 rounded-full overflow-hidden border ring-1 ring-white/60 shadow-sm">
              <img
                src={coverPhotoUrl}
                alt={s?.name ? `${s.name} photo` : 'Snake photo'}
                className="w-full h-full object-cover object-center"
                onError={(e)=>{e.currentTarget.style.display='none';}}
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full border bg-neutral-50 flex items-center justify-center text-[11px] text-neutral-400 text-center leading-tight px-1 ring-1 ring-white/60 shadow-sm">{t("snakeEdit.image.none")}</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium text-base truncate">{s.name}</div>
              <div className="text-xs font-mono text-neutral-500 mt-1 truncate">{s.id}</div>
              <div className="text-xs text-neutral-500">{s.birthDate ? formatDateForDisplay(s.birthDate) : ''}</div>
            </div>
            <div className="shrink-0">
              <span
                title={sexLabel}
                aria-label={sexLabel}
                className={cx(
                  'inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 text-xl font-semibold leading-none',
                  sexBadgeClass
                )}
              >
                {sexSymbol}
              </span>
            </div>
          </div>
          <div className="mt-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1">
              {geneticsTokens.length ? <GeneLine label={t("snakeEdit.geneticsShort", { defaultValue: "Genetics" })} genes={geneticsTokens} size="sm" /> : <div className="text-[11px] uppercase tracking-wide text-neutral-500">{t("snakeEdit.geneticsShort", { defaultValue: "Genetics" })}: -</div>}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        {hasEdit && (
          <button className="text-[11px] px-2 py-0.5 border rounded-lg" onClick={() => onEdit(s)}>
            {t("actions.edit", { defaultValue: "Edit" })}
          </button>
        )}
        {hasQuick && (
          <button className="text-[11px] px-2 py-0.5 border rounded-lg" onClick={() => onQuickPair(s)}>
            {t("actions.pair", { defaultValue: "Pair" })}
          </button>
        )}
        {hasDelete && (
          <button
            className="text-[11px] px-2 py-0.5 border rounded-lg text-rose-600"
            onClick={() => onDelete(s)}
            title="Delete snake"
          >
            {t("actions.delete")}
          </button>
        )}
        {isForSale && (
          <span className="ml-auto text-[11px] font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg px-2 py-0.5">
            For Sale
          </span>
        )}
      </div>

  {/* picture moved to thumbnail in header; large inline image removed */}
  {/* main content: scrollable when overflow */}
  <div className="flex-1 overflow-auto">
  {/* recent activity badges: single-line items, two-per-row (half width) */}
      <div className="mt-2 grid grid-cols-2 gap-1">
        {(() => {
          const logs = s.logs || {};
          const lastFeed = logs.feeds && logs.feeds.length ? logs.feeds[logs.feeds.length-1] : null;
          const lastWeight = logs.weights && logs.weights.length ? logs.weights[logs.weights.length-1] : null;
          const lastCleaning = logs.cleanings && logs.cleanings.length ? logs.cleanings[logs.cleanings.length-1] : null;
          const lastShed = logs.sheds && logs.sheds.length ? logs.sheds[logs.sheds.length-1] : null;
          const lastMed = logs.meds && logs.meds.length ? logs.meds[logs.meds.length-1] : null;
          const groupsArr = s.groups || [];

          const ordered = [
            { key: 'feeds', entry: lastFeed },
            { key: 'weights', entry: lastWeight },
            { key: 'cleanings', entry: lastCleaning },
            { key: 'sheds', entry: lastShed },
            { key: 'meds', entry: lastMed },
            { key: 'groups', groups: groupsArr }
          ];

          return ordered.map(a => {
            const k = a.key;
            const date = (a.entry && a.entry.date) || '';
            const labelText = k === 'feeds'
              ? t("logs.feed", { defaultValue: "Feed" })
              : k === 'weights'
                ? t("logs.weight", { defaultValue: "Weight" })
                : k === 'cleanings'
                  ? t("logs.cleaning", { defaultValue: "Cleaning" })
                  : k === 'sheds'
                    ? t("logs.shed", { defaultValue: "Shed" })
                    : k === 'meds'
                      ? t("logs.meds", { defaultValue: "Meds" })
                      : t("snakeEdit.group", { defaultValue: "Group" });
            const isClickableActivity = ['feeds','weights','cleanings','sheds','meds'].includes(k);
            const pal = activityPalettes[k] || { bg: '#efefef', border: '#ddd' };
            return (
              <div key={k} onClick={(e)=>{ if (isClickableActivity) { e.stopPropagation(); openQuickForKey(k,e); } }} role={isClickableActivity? 'button': undefined}
                className={cx(isClickableActivity? 'cursor-pointer':'' ,'w-full px-2 py-1 text-[11px] rounded-lg border flex flex-col justify-between gap-1 min-h-[48px]')}
                style={{ backgroundColor: pal.bg, borderColor: pal.border }}>
                  <div className="flex items-center justify-between">
                      <div className="text-[10px] text-neutral-600 font-semibold uppercase">{labelText}</div>
                      <div className="text-[10px] text-neutral-600">{formatDateForDisplay(date) || ' '}</div>
                    </div>
                <div className="min-w-0">
                  {k === 'feeds' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">{i18n.t("logs.noData", { defaultValue: "No data" })}</div>;
                    const en = a.entry;
                    const normalizedKind = (en.feed || en.item || '').trim();
                    const sizeText = (en.size || '').trim();
                    const gramsText = (typeof en.weightGrams === 'number' && en.weightGrams > 0)
                      ? `${en.weightGrams} g`
                      : (typeof en.grams === 'number' && en.grams > 0 ? `${en.grams} g` : '');
                    const methodText = en.method
                      ? (en.methodDetail ? `${en.method} (${en.methodDetail})` : en.method)
                      : '';
                    let detailText = '';
                    if (!en.refused) {
                      const detailParts = [];
                      if (normalizedKind) detailParts.push(normalizedKind);
                      if (sizeText) detailParts.push(sizeText);
                      if (gramsText) detailParts.push(gramsText);
                      if (methodText) detailParts.push(methodText);
                      detailText = detailParts.join(' — ');
                    }
                    const primaryText = en.refused ? t("logs.refused", { defaultValue: "Refused feed" }) : (detailText || t("logs.feed", { defaultValue: "Feed" }));
                    return (
                      <>
                        <div className={cx('truncate', en.refused ? 'font-semibold text-rose-600' : 'font-medium text-neutral-800')}>
                          {primaryText}
                        </div>
                        {en.refused && detailText ? (
                          <div className="text-[11px] text-neutral-700 truncate">{detailText}</div>
                        ) : null}
                        {en.notes ? <div className="text-[11px] text-neutral-700 truncate">{en.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'weights' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">{i18n.t("logs.noData", { defaultValue: "No data" })}</div>;
                    const w = a.entry;
                    return (
                      <>
                        <div className="font-medium">{(typeof w.grams === 'number' ? `${w.grams} g` : `${w.grams || ''}`)}</div>
                        {w.notes ? <div className="text-[11px] text-neutral-700 truncate">{w.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'cleanings' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">{i18n.t("logs.noData", { defaultValue: "No data" })}</div>;
                    const c = a.entry;
                    return (
                      <>
                        <div className="font-medium">{i18n.t("logs.cleaning", { defaultValue: "Cleaning" })}{c.deep ? " — " + i18n.t("logs.deepClean", { defaultValue: "Deep clean" }) : ""}</div>
                        {c.notes ? <div className="text-[11px] text-neutral-700 truncate">{c.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'sheds' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">{i18n.t("logs.noData", { defaultValue: "No data" })}</div>;
                    const sh = a.entry;
                    return (
                      <>
                        <div className="font-medium">{i18n.t("logs.shed", { defaultValue: "Shed" })}{sh.complete ? " — " + i18n.t("logs.complete", { defaultValue: "Complete" }) : ""}</div>
                        {sh.notes ? <div className="text-[11px] text-neutral-700 truncate">{sh.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'meds' ? (() => {
                    if (!a.entry) return <div className="text-sm text-neutral-700">{i18n.t("logs.noData", { defaultValue: "No data" })}</div>;
                    const m = a.entry;
                    return (
                      <>
                        <div className="font-medium truncate">{m.drug} {m.dose ? `— ${m.dose}` : ''}</div>
                        {m.notes ? <div className="text-[11px] text-neutral-700 truncate">{m.notes}</div> : null}
                      </>
                    );
                  })() : null}

                  {k === 'groups' ? (() => {
                    const gs = a.groups || [];
                    if (!gs.length) return <div className="text-sm text-neutral-700">{i18n.t("logs.noData", { defaultValue: "No data" })}</div>;
                    const groupText = gs.join(', ');
                    if (groupText.trim().toLowerCase() === 'group') return <div className="text-sm text-neutral-700">{i18n.t("logs.noData", { defaultValue: "No data" })}</div>;
                    return <div className="font-medium truncate">{groupText}</div>;
                  })() : null}

                </div>
                {/* date moved into header */}
              </div>
            );
          });
        })()}
      </div>

      {/* genetics moved to header */}
      {/* weight display removed per user request */}
  {/* birth date moved to header */}
      </div>
      {/* Quick-add popover for activities (feeds, weights, cleanings, sheds, meds) */}
      {quickTagOpen && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            e.stopPropagation();
            closeQuickAdd();
          }}
        >
          <div
            className="pointer-events-auto w-full max-w-md bg-white border rounded-xl shadow-2xl p-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-semibold">{t("actions.add", { defaultValue: "Add" })} {quickTagOpen}</div>
              <button
                className="text-sm px-2 py-1 border rounded-lg text-neutral-500 hover:text-neutral-700"
                onClick={(e)=>{ e.stopPropagation(); closeQuickAdd(); }}
              >
                {t("common.close", { defaultValue: "Close" })}
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-neutral-500">{t("animals.quickAdd.date", { defaultValue: "Date" })}</div>
                <input className="w-full px-2 py-1 border rounded" type="date" value={quickDraft.date} onChange={(e)=>setQuickDraft(d=>({...d, date: e.target.value}))} />
              </div>
              {quickTagOpen.toLowerCase().includes('feed') && (
                <>
                  <div>
                    <div className="text-xs text-neutral-500">{t("animals.quickAdd.feedType", { defaultValue: "Feed type" })}</div>
                    <select className="w-full px-2 py-1 border rounded" value={quickDraft.feed||''} onChange={(e)=>setQuickDraft(d=>({...d, feed: e.target.value, size: (e.target.value === 'Mouse' || e.target.value === 'Rat') ? (d.size||'pinky') : ''}))}>
                      <option value="Mouse">{t("animals.quickAdd.feedOptions.mouse", { defaultValue: "Mouse" })}</option>
                      <option value="Rat">{t("animals.quickAdd.feedOptions.rat", { defaultValue: "Rat" })}</option>
                      <option value="Chick">{t("animals.quickAdd.feedOptions.chick", { defaultValue: "Chick" })}</option>
                      <option value="Other">{t("animals.quickAdd.feedOptions.other", { defaultValue: "Other" })}</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">{t("animals.quickAdd.size", { defaultValue: "Size" })}</div>
                    {(quickDraft.feed === 'Mouse' || quickDraft.feed === 'Rat') ? (
                      <select className="w-full px-2 py-1 border rounded" value={quickDraft.size||''} onChange={e=>setQuickDraft(d=>({...d, size: e.target.value}))}>
                        <option value="pinky">{t("animals.quickAdd.sizeOptions.pinky", { defaultValue: "pinky" })}</option>
                        <option value="fuzzy">{t("animals.quickAdd.sizeOptions.fuzzy", { defaultValue: "fuzzy" })}</option>
                        <option value="medium">{t("animals.quickAdd.sizeOptions.medium", { defaultValue: "medium" })}</option>
                        <option value="adult">{t("animals.quickAdd.sizeOptions.adult", { defaultValue: "adult" })}</option>
                        <option value="Other">{t("animals.quickAdd.sizeOptions.other", { defaultValue: "Other" })}</option>
                      </select>
                    ) : (
                      <>
                        <select className="w-full px-2 py-1 border rounded" value={quickDraft.size||''} onChange={e=>setQuickDraft(d=>({...d, size: e.target.value}))}>
                          <option value="">{t("animals.quickAdd.selectPlaceholder", { defaultValue: "Select" })}</option>
                          <option value="Other">{t("animals.quickAdd.sizeOptions.other", { defaultValue: "Other" })}</option>
                        </select>
                        {quickDraft.size === 'Other' && (
                          <input className="mt-2 w-full px-2 py-1 border rounded" placeholder={t("animals.quickAdd.customSizePlaceholder", { defaultValue: "Custom size" })} value={quickDraft.sizeDetail||''} onChange={e=>setQuickDraft(d=>({...d, sizeDetail: e.target.value}))} />
                        )}
                      </>
                    )}
                    {quickDraft.size === 'Other' && quickDraft.feed !== 'Mouse' && quickDraft.feed !== 'Rat' && (
                      <input className="mt-2 w-full px-2 py-1 border rounded" placeholder={t("animals.quickAdd.customSizePlaceholder", { defaultValue: "Custom size" })} value={quickDraft.sizeDetail||''} onChange={e=>setQuickDraft(d=>({...d, sizeDetail: e.target.value}))} />
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">{t("animals.quickAdd.weight", { defaultValue: "Weight (g)" })}</div>
                    <input className="w-full px-2 py-1 border rounded" type="number" value={quickDraft.grams} onChange={(e)=>setQuickDraft(d=>({...d, grams: e.target.value}))} />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">{t("animals.quickAdd.form", { defaultValue: "Form" })}</div>
                    <select className="w-full px-2 py-1 border rounded" value={quickDraft.form||''} onChange={(e)=>setQuickDraft(d=>({...d, form: e.target.value}))}>
                      <option value="">{t("animals.quickAdd.selectPlaceholder", { defaultValue: "Select" })}</option>
                      <option value="Live">{t("animals.quickAdd.formOptions.live", { defaultValue: "Live" })}</option>
                      <option value="Freshly killed">{t("animals.quickAdd.formOptions.fresh", { defaultValue: "Freshly killed" })}</option>
                      <option value="Frozen/thawed">{t("animals.quickAdd.formOptions.frozen", { defaultValue: "Frozen/thawed" })}</option>
                      <option value="Other">{t("animals.quickAdd.formOptions.other", { defaultValue: "Other" })}</option>
                    </select>
                    {quickDraft.form === 'Other' && (
                      <input className="mt-2 w-full px-2 py-1 border rounded" placeholder={t("animals.quickAdd.methodDetailsPlaceholder", { defaultValue: "Method details" })} value={quickDraft.formDetail||''} onChange={e=>setQuickDraft(d=>({...d, formDetail: e.target.value}))} />
                    )}
                  </div>
                </>
              )}
                      {quickTagOpen.toLowerCase().includes('weight') && (
                        <>
                          <div>
                            <div className="text-xs text-neutral-500">{t("animals.quickAdd.gramsLabel", { defaultValue: "Grams" })}</div>
                            <input className="w-full px-2 py-1 border rounded" type="number" value={quickDraft.grams} onChange={(e)=>setQuickDraft(d=>({...d, grams: e.target.value}))} />
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">{t("animals.quickAdd.recentProgress", { defaultValue: "Recent progress" })}</div>
                            <WeightTrendMiniChart data={weightHistory} />
                          </div>
                        </>
                      )}
              {quickTagOpen.toLowerCase().includes('med') && (
                <>
                  <div>
                    <div className="text-xs text-neutral-500">{t("animals.quickAdd.medicationDrug", { defaultValue: "Drug" })}</div>
                    <input className="w-full px-2 py-1 border rounded" value={quickDraft.drug} onChange={(e)=>setQuickDraft(d=>({...d, drug: e.target.value}))} />
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">{t("animals.quickAdd.medicationDose", { defaultValue: "Dose" })}</div>
                    <input className="w-full px-2 py-1 border rounded" value={quickDraft.dose} onChange={(e)=>setQuickDraft(d=>({...d, dose: e.target.value}))} />
                  </div>
                </>
              )}
              <div>
                <div className="text-xs text-neutral-500">{t("animals.quickAdd.notes", { defaultValue: "Notes" })}</div>
                <input className="w-full px-2 py-1 border rounded" value={quickDraft.notes} onChange={(e)=>setQuickDraft(d=>({...d, notes: e.target.value}))} />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button className="px-2 py-1 border rounded" onClick={(e)=>{ e.stopPropagation(); closeQuickAdd(); }}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
                {quickTagOpen.toLowerCase().includes('feed') && (
                  <button
                    className="px-2 py-1 border rounded text-rose-600"
                    onClick={(e)=>{
                      e.stopPropagation();
                      submitQuickAdd(quickTagOpen, { forceRefused: true });
                    }}
                  >
                    {t("logs.refused", { defaultValue: "Refused feed" })}
                  </button>
                )}
                <button className="px-2 py-1 bg-emerald-500 text-white rounded" onClick={(e)=>{ e.stopPropagation(); submitQuickAdd(quickTagOpen); }}>{t("actions.add", { defaultValue: "Add" })}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* single-group selector (smaller; limited to ~3 lines) */}
      <div className="mt-2">
        <div className="text-xs text-neutral-500 mb-1">{t("snakeEdit.assignGroup", { defaultValue: "Assign group" })}</div>
  <div className="flex flex-wrap gap-2 text-[11px]">
          {groups.map(g => (
            <label key={g} className="inline-flex items-center gap-1 px-2 py-0.5 border rounded-lg bg-white text-[11px] min-w-0">
              <input type="radio" name={`group-${s.id}`} className="w-3 h-3"
                checked={(s.groups||[]).includes(g)}
                onChange={() => {
                  if (!setSnakes) return;
                  setSnakes(prev => prev.map(x => x.id === s.id ? { ...x, groups: [g] } : x));
                }} />
              <span className="truncate max-w-[8rem]">{g}</span>
            </label>
          ))}
          <label className="inline-flex items-center gap-1 px-2 py-0.5 border rounded-lg bg-white text-[11px]">
            <input type="radio" name={`group-${s.id}`} className="w-3 h-3" checked={!(s.groups||[]).length}
              onChange={() => { if (!setSnakes) return; setSnakes(prev => prev.map(x => x.id === s.id ? { ...x, groups: [] } : x)); }} />
            <span>{t("snakeEdit.noGroup", { defaultValue: "None" })}</span>
          </label>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StatusDot status={displayStatus} />
        <div className="text-xs">{displayStatus}</div>
      </div>
      {isForSale && (
        <div className="mt-1 text-xs text-neutral-700">
          <span className="font-semibold">{t('snakeEdit.price', { defaultValue: 'Price' })}:</span> {cardPriceText}
        </div>
      )}

      {normalizedSex === 'F' && breedingCyclesByYear.length > 0 && (
        <div className="mt-2">
        <div className="text-xs text-neutral-500 mb-1">{t("pairing.breedingCycles", { defaultValue: "Breeding cycles" })}</div>
          <div className="flex flex-col gap-1 max-h-40 overflow-auto pr-1">
            {breedingCyclesByYear.map(group => (
              <div key={group.year} className="rounded-lg border bg-neutral-50 p-2 space-y-1">
                <div className="text-[10px] font-semibold uppercase text-neutral-500">{group.year}</div>
                {group.cycles.map(cycle => (
                  <div key={cycle.id} className="rounded-lg border bg-white px-2 py-1 text-[11px] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">{cycle.label}</div>
                      {onOpenPairing && cycle.id && (
                        <button
                          className="text-[10px] px-1.5 py-0.5 border rounded-lg"
                          onClick={() => onOpenPairing(cycle.id)}
                        >
                          Open
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5 text-neutral-700">
                      {cycle.locks && cycle.locks.length ? (
                        <div>
                          <span className="font-semibold text-neutral-600">Locks:</span>{' '}
                          <span>{cycle.locks.map(lock => lock.display || formatDateTimeForDisplay(lock.iso)).filter(Boolean).join(', ')}</span>
                        </div>
                      ) : null}
                      {cycle.ovulationDate ? (
                        <div><span className="font-semibold text-neutral-600">Ovulation:</span> <span>{formatDateForDisplay(cycle.ovulationDate)}</span></div>
                      ) : null}
                      {cycle.preLayDate ? (
                        <div><span className="font-semibold text-neutral-600">Pre-Lay Shed:</span> <span>{formatDateForDisplay(cycle.preLayDate)}</span></div>
                      ) : null}
                      {cycle.clutchDate ? (
                        <div><span className="font-semibold text-neutral-600">Eggs laid:</span> <span>{formatDateForDisplay(cycle.clutchDate)}</span></div>
                      ) : null}
                      {cycle.hatchDate ? (
                        <div><span className="font-semibold text-neutral-600">Hatched:</span> <span>{formatDateForDisplay(cycle.hatchDate)}</span></div>
                      ) : null}
                      {!cycle.locks?.length && !cycle.ovulationDate && !cycle.preLayDate && !cycle.clutchDate && !cycle.hatchDate ? (
                        <div className="text-neutral-500">No cycle events recorded.</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pairings involving this snake */}
      <div className="mt-2">
        <div className="text-xs text-neutral-500 mb-1">{t("snakeEdit.pairingsLabel", { defaultValue: "Pairings" })}</div>
        {(() => {
          const myPairings = pairings.filter(p => p.maleId === s.id || p.femaleId === s.id);
          const visible = myPairings.slice(0,3);
          return (
            <div className="flex flex-col gap-1 max-h-36 overflow-auto">
              {visible.map(p => (
                <button key={p.id} className="text-sm text-left px-2 py-1 rounded-lg border hover:bg-neutral-50 min-w-0" onClick={()=> onOpenPairing ? onOpenPairing(p.id) : null}>
                  <div className="font-medium truncate">{p.label || `${p.femaleId} × ${p.maleId}`}</div>
                  <div className="text-xs text-neutral-500">{t("pairing.startDate", { defaultValue: "Start" })}: {p.startDate ? formatDateForDisplay(p.startDate) : '—'}</div>
                </button>
              ))}
              {myPairings.length === 0 && (<div className="text-xs text-neutral-500">{t("snakeEdit.noPairingsYet")}</div>)}
              {myPairings.length > 3 && (
                <button className="text-xs mt-1 px-2 py-1 border rounded-lg text-neutral-700" onClick={()=>setShowPairingsModal(true)}>+{myPairings.length - 3} {i18n.t("snakeEdit.more", { defaultValue: "more" })}</button>
              )}
            </div>
          );
        })()}
      </div>
      {showPairingsModal && (
        <PairingsModal
          snake={s}
          pairings={pairings.filter(p => p.maleId === s.id || p.femaleId === s.id)}
          onClose={() => setShowPairingsModal(false)}
          onOpenPairing={(pid) => { setShowPairingsModal(false); if (onOpenPairing) onOpenPairing(pid); }}
        />
      )}
    </div>
  );
}

function WeightTrendMiniChart({ data = [] }) {
  const { t } = useTranslation();
  const accent = '#0ea5e9';
  const chartWidth = 320;
  const chartHeight = 140;
  const padding = { top: 18, right: 28, bottom: 32, left: 42 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const gradientId = useMemo(() => `weight-gradient-${Math.random().toString(36).slice(2, 8)}`, []);

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="mt-2 border rounded-lg bg-neutral-50 px-3 py-4 text-xs text-neutral-500">
        {t("logs.weightsEmpty", { defaultValue: "No weight history yet. Log a weight to start tracking progress." })}
      </div>
    );
  }

  const gramsValues = data.map(d => d.grams);
  const minValue = Math.min(...gramsValues);
  const maxValue = Math.max(...gramsValues);
  const range = maxValue - minValue || 1;
  const baselineY = padding.top + innerHeight;
  const formatNumber = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

  const pointCoords = data.map((entry, idx) => {
    const ratio = data.length === 1 ? 0.5 : idx / (data.length - 1);
    const x = padding.left + innerWidth * ratio;
    const y = padding.top + innerHeight - ((entry.grams - minValue) / range) * innerHeight;
    return { x, y, grams: entry.grams, label: entry.label || '' };
  });

  const linePath = pointCoords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
    .join(' ');

  const areaPath = pointCoords.length > 1
    ? `${linePath} L${pointCoords[pointCoords.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L${pointCoords[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`
    : null;

  const latest = pointCoords[pointCoords.length - 1];
  const first = pointCoords[0];
  const diff = latest.grams - first.grams;
  const diffLabel = `${diff >= 0 ? '+' : ''}${formatNumber(diff)} g`;

  return (
    <div className="mt-2 border rounded-lg bg-neutral-50 p-3">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Weight trend chart"
        className="w-full h-32"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect
          x={padding.left}
          y={padding.top}
          width={innerWidth}
          height={innerHeight}
          fill="#f8fafc"
          rx={12}
        />
        <line
          x1={padding.left}
          y1={baselineY}
          x2={padding.left + innerWidth}
          y2={baselineY}
          stroke="#e2e8f0"
          strokeDasharray="4 4"
        />
        {areaPath ? (
          <path d={areaPath} fill={`url(#${gradientId})`} />
        ) : null}
        <path
          d={linePath}
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pointCoords.map((pt, idx) => (
          <circle
            key={`weight-point-${idx}`}
            cx={pt.x}
            cy={pt.y}
            r={4}
            fill="#fff"
            stroke={accent}
            strokeWidth={2}
          />
        ))}
      </svg>
      <div className="mt-2 text-[11px] text-neutral-600 grid grid-cols-2 gap-y-1">
        <div>
          <span className="font-semibold text-neutral-700">{t("logs.latest", { defaultValue: "Latest" })}:</span> {formatNumber(latest.grams)} g
        </div>
        <div className="text-right">
          <span className="font-semibold text-neutral-700">{t("logs.change", { defaultValue: "Change" })}:</span> {diffLabel}
        </div>
        <div className="col-span-2 text-neutral-500">
          {pointCoords.length > 1
            ? t("logs.fromTo", { defaultValue: "From {{start}} to {{end}}", start: first.label, end: latest.label })
            : t("logs.loggedOn", { defaultValue: "Logged on {{date}}", date: latest.label })}
        </div>
      </div>
      {pointCoords.length > 1 && (
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-neutral-400">
          <span>{data[0].label}</span>
          <span>{data[data.length - 1].label}</span>
        </div>
      )}
    </div>
  );
}

function PairingsModal({ snake, pairings, onClose, onOpenPairing }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[200]" onClick={onClose}>
      <div className="bg-white p-4 rounded-lg shadow w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{t("snakeEdit.pairingsFor", { defaultValue: "Pairings for {{name}}", name: snake.name })}</div>
            <div className="text-xs text-neutral-500">{t("pairing.openHint", { defaultValue: "Click a pairing to open it." })}</div>
          </div>
          <button className="text-sm px-2 py-1 border rounded" onClick={onClose}>{t("actions.close", { defaultValue: "Close" })}</button>
        </div>
        <div className="mt-3 space-y-2 max-h-72 overflow-auto">
          {pairings.length ? pairings.map(p => (
            <div key={p.id} className="p-2 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.label}</div>
                  <div className="text-xs text-neutral-500">{t("pairing.startDate", { defaultValue: "Start" })}: {p.startDate ? formatDateForDisplay(p.startDate) : '—'}</div>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs px-2 py-1 border rounded-lg" onClick={() => onOpenPairing && onOpenPairing(p.id)}>{t("actions.open", { defaultValue: "Open" })}</button>
                </div>
              </div>
                  <div className="mt-2 text-xs">
                {t("pairing.appointmentsLabel", { defaultValue: "Appointments:" })}
                <div className="mt-1 space-y-1">
                  {(p.appointments||[]).map(ap => (
                    <div key={ap.id} className="text-[11px] px-2 py-1 rounded border bg-neutral-50">{formatDateForDisplay(ap.date)} {ap.notes ? ` — ${ap.notes}` : ''}</div>
                  ))}
                </div>
              </div>
            </div>
          )) : <div className="text-sm text-neutral-500">{t("snakeEdit.noPairingsYet")}</div>}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  const bg = status === "Active" ? "bg-emerald-500" : status === "Hold" ? "bg-amber-500" : "bg-rose-500";
  return <span className={cx("inline-block w-2 h-2 rounded-full", bg)} />;
}

function SnakeListTable({ snakes = [], onEdit, onQuickPair, onOrderGeneticTest, onDelete, pairings = [], onOpenPairing }) {
  const { t } = useTranslation();
  const [pairingsSnake, setPairingsSnake] = useState(null);

  const pairingsBySnake = useMemo(() => {
    const map = new Map();
    (Array.isArray(pairings) ? pairings : []).forEach(pairing => {
      if (!pairing) return;
      if (pairing.femaleId) {
        if (!map.has(pairing.femaleId)) map.set(pairing.femaleId, []);
        map.get(pairing.femaleId).push(pairing);
      }
      if (pairing.maleId) {
        if (!map.has(pairing.maleId)) map.set(pairing.maleId, []);
        map.get(pairing.maleId).push(pairing);
      }
    });
    return map;
  }, [pairings]);

  const list = Array.isArray(snakes) ? snakes : [];

  const handleOpenPairings = (snake) => {
    if (!snake) return;
    setPairingsSnake(snake);
  };

  const renderSexSummary = (snake) => {
    const normalized = normalizeSexValue(snake?.sex);
    if (normalized === 'M') return { symbol: '\u2642', label: t('snake.sex.male', { defaultValue: 'Male' }) };
    if (normalized === 'F') return { symbol: '\u2640', label: t('snake.sex.female', { defaultValue: 'Female' }) };
    return { symbol: '?', label: t('snake.sex.unknown', { defaultValue: 'Unknown sex' }) };
  };

  const renderWeight = (snake) => {
    const manualWeight = Number(snake?.weight);
    const weightEntry = getLatestLogEntry(snake?.logs, 'weights');
    const loggedWeight = Number(weightEntry?.grams ?? weightEntry?.weightGrams ?? weightEntry?.weight);
    if (Number.isFinite(manualWeight) && manualWeight > 0) {
      return { value: `${manualWeight} g`, date: snake?.weightDate ? formatDateForDisplay(snake.weightDate) : '' };
    }
    if (Number.isFinite(loggedWeight) && loggedWeight > 0) {
      return {
        value: `${loggedWeight} g`,
        date: weightEntry?.date ? formatDateForDisplay(weightEntry.date) : '',
      };
    }
    return { value: '—', date: '' };
  };

  const renderFeed = (snake) => {
    const entry = getLatestLogEntry(snake?.logs, 'feeds');
    if (!entry) {
      return {
        summary: t('logs.noData', { defaultValue: 'No data' }),
        date: '',
      };
    }
    if (entry.refused) {
      return {
        summary: t('logs.refused', { defaultValue: 'Refused feed' }),
        date: entry.date ? formatDateForDisplay(entry.date) : '',
      };
    }
    const feedParts = [entry.feed, entry.size === 'Other' ? entry.sizeDetail : entry.size]
      .concat(
        (() => {
          const grams = Number(entry.weightGrams ?? entry.grams);
          return Number.isFinite(grams) && grams > 0 ? [`${grams} g`] : [];
        })()
      )
      .filter(Boolean)
      .map(part => String(part).trim());
    return {
      summary: feedParts.length ? feedParts.join(' — ') : t('logs.feed', { defaultValue: 'Feed' }),
      date: entry.date ? formatDateForDisplay(entry.date) : '',
    };
  };

  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <table className="min-w-[960px] w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-neutral-500 bg-neutral-50">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">{t('animals.list.columns.animal', { defaultValue: 'Animal' })}</th>
            <th className="text-left px-3 py-2 font-semibold">{t('animals.list.columns.genetics', { defaultValue: 'Genetics' })}</th>
            <th className="text-left px-3 py-2 font-semibold">{t('animals.list.columns.status', { defaultValue: 'Status' })}</th>
            <th className="text-left px-3 py-2 font-semibold">{t('animals.list.columns.weight', { defaultValue: 'Weight' })}</th>
            <th className="text-left px-3 py-2 font-semibold">{t('animals.list.columns.lastFeed', { defaultValue: 'Last feed' })}</th>
            <th className="text-left px-3 py-2 font-semibold">{t('animals.list.columns.groups', { defaultValue: 'Groups & tags' })}</th>
            <th className="text-left px-3 py-2 font-semibold">{t('animals.list.columns.actions', { defaultValue: 'Actions' })}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((snake, index) => {
            const sexSummary = renderSexSummary(snake);
            const geneticsTokens = combineMorphsAndHetsForDisplay(snake?.morphs, snake?.hets, snake?.possibleHets);
            const geneticsSummary = joinTokens(geneticsTokens);
            const statusLabel = typeof snake?.status === 'string' && snake.status.trim()
              ? snake.status.trim()
              : t('snakeEdit.status', { defaultValue: 'Status' });
            const weightInfo = renderWeight(snake);
            const feedInfo = renderFeed(snake);
            const groupsLabel = joinTokens(snake?.groups) || t('snakeEdit.noGroup', { defaultValue: 'No group' });
            const tagsLabel = joinTokens(snake?.tags);
            const relatedPairings = pairingsBySnake.get(snake?.id) || [];
            return (
              <tr key={snake.id || `snake-row-${index}`} className="border-t border-neutral-100">
                <td className="px-3 py-3 align-top">
                  <div className="font-medium text-base">{snake.name || t('snakeEdit.unnamed', { defaultValue: 'Unnamed' })}</div>
                  <div className="text-xs font-mono text-neutral-500">{snake.id || '—'}</div>
                  <div className="mt-1 inline-flex items-center gap-2 text-xs text-neutral-600">
                    <span className="font-semibold">{sexSummary.symbol}</span>
                    <span>{sexSummary.label}</span>
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  {geneticsSummary ? (
                    <div className="text-sm text-neutral-800 max-w-xs truncate" title={geneticsSummary}>{geneticsSummary}</div>
                  ) : (
                    <div className="text-xs text-neutral-500">{t('snakeEdit.geneticsShort', { defaultValue: 'Genetics' })}: —</div>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-center gap-2 text-sm">
                    <StatusDot status={statusLabel} />
                    <span>{statusLabel}</span>
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="text-sm font-medium">{weightInfo.value}</div>
                  {weightInfo.date && <div className="text-xs text-neutral-500">{weightInfo.date}</div>}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="text-sm font-medium" title={feedInfo.summary}>{feedInfo.summary}</div>
                  {feedInfo.date && <div className="text-xs text-neutral-500">{feedInfo.date}</div>}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="text-sm">{groupsLabel}</div>
                  {tagsLabel && (
                    <div className="text-xs text-neutral-500 truncate" title={tagsLabel}>{tagsLabel}</div>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-wrap gap-2">
                    {typeof onEdit === 'function' && (
                      <button className="text-[11px] px-2 py-1 border rounded-lg" onClick={() => onEdit(snake)}>{t('actions.edit', { defaultValue: 'Edit' })}</button>
                    )}
                    {typeof onQuickPair === 'function' && (
                      <button className="text-[11px] px-2 py-1 border rounded-lg" onClick={() => onQuickPair(snake)}>{t('actions.pair', { defaultValue: 'Pair' })}</button>
                    )}
                    {typeof onOrderGeneticTest === 'function' && (
                      <button className="text-[11px] px-2 py-1 border rounded-lg" onClick={() => onOrderGeneticTest(snake)}>
                        {t('actions.orderGeneticTest', { defaultValue: 'Order Genetic Test' })}
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-[11px] px-2 py-1 border rounded-lg"
                      onClick={() => handleOpenPairings(snake)}
                    >
                      {t('snakeEdit.pairingsLabel', { defaultValue: 'Pairings' })}{relatedPairings.length ? ` (${relatedPairings.length})` : ''}
                    </button>
                    {typeof onDelete === 'function' && (
                      <button className="text-[11px] px-2 py-1 border rounded-lg text-rose-600" onClick={() => onDelete(snake)}>{t('actions.delete')}</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pairingsSnake && (
        <PairingsModal
          snake={pairingsSnake}
          pairings={pairingsBySnake.get(pairingsSnake.id) || []}
          onClose={() => setPairingsSnake(null)}
          onOpenPairing={(pid) => {
            setPairingsSnake(null);
            if (onOpenPairing) onOpenPairing(pid);
          }}
        />
      )}
    </div>
  );
}

function filterSnakes(list, query, tag) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const tokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : [];
  const normalizedTag = String(tag || 'all').trim().toLowerCase();

  return list.filter(snake => {
    if (!snake) return false;

    if (normalizedTag !== 'all') {
      const tagMatches = (Array.isArray(snake.tags) ? snake.tags : [])
        .some(entry => String(entry || '').trim().toLowerCase() === normalizedTag);
      if (!tagMatches) return false;
    }

    if (!tokens.length) return true;

    const geneTokens = combineMorphsAndHetsForDisplay(snake.morphs, snake.hets, snake.possibleHets);
    const searchFields = [
      snake.id,
      snake.name,
      ...(Array.isArray(geneTokens) ? geneTokens : []),
      snake.morphHetInput,
      ...(Array.isArray(snake.morphs) ? snake.morphs : []),
      ...(Array.isArray(snake.hets) ? snake.hets : []),
      ...(Array.isArray(snake.tags) ? snake.tags : []),
      ...(Array.isArray(snake.groups) ? snake.groups : []),
    ]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    if (!searchFields.length) return false;

    return tokens.every(token => searchFields.some(field => field.includes(token)));
  });
}

function AddGroupInline({ onAdd }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2 px-2">
      <input className="flex-1 border rounded-lg px-2 py-1 text-sm" placeholder="Add new group"
        value={val} onChange={e=>setVal(e.target.value)} />
      <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>{
        const g = val.trim();
        if (!g) return;
        onAdd(g);
        setVal("");
      }}>Add</button>
    </div>
  );
}

// Breeder section for contact and logo
function BreederSection({
  breederInfo,
  setBreederInfo,
  morphAliases,
  setMorphAliases,
  geneAliases,
  setGeneAliases,
  theme = 'blue',
  onSaved,
  createBackupPayload,
  onRestoreBackup,
  backupSettings,
  updateBackupSettings,
  autoBackupSnapshot,
  onTriggerAutoBackup,
  backupVault,
  onCreateVaultEntry,
  onRenameVaultEntry,
  onDeleteVaultEntry,
  snakes,
  pairings,
  animalExportFields,
  setAnimalExportFields,
  pairingExportFields,
  setPairingExportFields,
  exportFeedback,
  setExportFeedback,
  showAppAlert,
  showAppPrompt,
  showAppConfirm,
  onResetToDefaults,
}) {
  const { t } = useTranslation();
  const info = useMemo(() => normalizeBreederInfo(breederInfo), [breederInfo]);
  const idConfig = useMemo(() => normalizeIdGeneratorConfig(info.idGenerator), [info.idGenerator]);

  const persistBreederInfo = useCallback((updater) => {
    if (typeof setBreederInfo !== 'function') return;
    setBreederInfo(prev => {
      const current = normalizeBreederInfo(prev);
      const nextValue = typeof updater === 'function' ? updater(current) : updater;
      return normalizeBreederInfo(nextValue);
    });
  }, [setBreederInfo]);

  const updateIdConfig = useCallback((patch) => {
    persistBreederInfo(prev => {
      const merged = { ...prev.idGenerator, ...(patch || {}) };
      return { ...prev, idGenerator: normalizeIdGeneratorConfig(merged) };
    });
  }, [persistBreederInfo]);

  const updatePdfLabelSettings = useCallback((patchOrUpdater) => {
    persistBreederInfo(prev => {
      const current = normalizePdfLabelSettings(prev?.pdfLabelSettings);
      const next = typeof patchOrUpdater === 'function'
        ? patchOrUpdater(current)
        : { ...current, ...(patchOrUpdater || {}) };
      return { ...prev, pdfLabelSettings: normalizePdfLabelSettings(next) };
    });
  }, [persistBreederInfo]);

  const updateLabLabelSettings = useCallback((nextSettings) => {
    persistBreederInfo(prev => ({
      ...prev,
      labLabelSettings: normalizeLabLabelSizeSettings(nextSettings),
    }));
  }, [persistBreederInfo]);

  const handleResetIdConfig = useCallback(() => {
    persistBreederInfo(prev => ({ ...prev, idGenerator: getDefaultIdGeneratorConfig() }));
  }, [persistBreederInfo]);

  const handleTemplateTokenToggle = useCallback((token) => {
    const template = idConfig.template || '';
    const insertion = token === '[-]' ? '[-]' : token;
    const input = templateInputRef.current;
    const captureLastPosition = (start, end) => {
      lastTemplateSelectionRef.current = { start, end };
    };

    if (token !== '[-]' && template.includes(insertion)) {
      const index = template.indexOf(insertion);
      if (index === -1) return;
      const next = `${template.slice(0, index)}${template.slice(index + insertion.length)}`;
      pendingTemplateSelectionRef.current = { start: index, end: index, focus: true };
      captureLastPosition(index, index);
      updateIdConfig({ template: next });
      return;
    }

    let start = template.length;
    let end = template.length;
    if (input && typeof input.selectionStart === 'number' && typeof input.selectionEnd === 'number') {
      start = input.selectionStart;
      end = input.selectionEnd;
    } else if (lastTemplateSelectionRef.current) {
      const { start: lastStart, end: lastEnd } = lastTemplateSelectionRef.current;
      if (typeof lastStart === 'number' && typeof lastEnd === 'number') {
        start = lastStart;
        end = lastEnd;
      }
    }
    const next = `${template.slice(0, start)}${insertion}${template.slice(end)}`;
    const cursor = start + insertion.length;
    pendingTemplateSelectionRef.current = { start: cursor, end: cursor, focus: true };
    captureLastPosition(cursor, cursor);
    updateIdConfig({ template: next });
  }, [idConfig.template, updateIdConfig]);

  const captureTemplateSelection = useCallback(() => {
    const input = templateInputRef.current;
    if (!input) return;
    const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    lastTemplateSelectionRef.current = { start, end };
  }, []);

  const [setupTab, setSetupTab] = useState('info');
  const isDevEnvironment = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
  const [aliasDraftAlias, setAliasDraftAlias] = useState('');
  const [aliasDraftGenes, setAliasDraftGenes] = useState('');
  const [aliasDraftNotes, setAliasDraftNotes] = useState('');
  const [editingAliasKey, setEditingAliasKey] = useState('');
  const [geneAliasDraftName, setGeneAliasDraftName] = useState('');
  const [geneAliasDraftAliases, setGeneAliasDraftAliases] = useState('');
  const [geneAliasDraftShorthand, setGeneAliasDraftShorthand] = useState('');
  const [editingGeneAliasKey, setEditingGeneAliasKey] = useState('');
  const aliasImportInputRef = useRef(null);
  const geneAliasImportInputRef = useRef(null);
  const [backupFeedback, setBackupFeedback] = useState(null);
  const [restoreFeedback, setRestoreFeedback] = useState(null);
  const restoreInputRef = useRef(null);
  const legacyRestoreInputRef = useRef(null);
  const normalizedBackupSettings = useMemo(() => normalizeBackupSettings(backupSettings), [backupSettings]);
  const vaultEntries = useMemo(() => (Array.isArray(backupVault) ? backupVault : []), [backupVault]);
  const normalizedAnimalExportFields = useMemo(
    () => normalizeExportFieldSelection(animalExportFields, DEFAULT_ANIMAL_EXPORT_FIELDS, ANIMAL_EXPORT_FIELD_DEFS),
    [animalExportFields]
  );
  const normalizedPairingExportFields = useMemo(
    () => normalizeExportFieldSelection(pairingExportFields, DEFAULT_PAIRING_EXPORT_FIELDS, PAIRING_EXPORT_FIELD_DEFS),
    [pairingExportFields]
  );
  const animalFieldSections = useMemo(() => groupFieldDefsBySection(ANIMAL_EXPORT_FIELD_DEFS), []);
  const pairingFieldSections = useMemo(() => groupFieldDefsBySection(PAIRING_EXPORT_FIELD_DEFS), []);
  const animalFieldSet = useMemo(() => new Set(normalizedAnimalExportFields), [normalizedAnimalExportFields]);
  const pairingFieldSet = useMemo(() => new Set(normalizedPairingExportFields), [normalizedPairingExportFields]);
  const vaultLimitValue = typeof normalizedBackupSettings.maxVaultEntries === 'number' && normalizedBackupSettings.maxVaultEntries > 0
    ? String(normalizedBackupSettings.maxVaultEntries)
    : 'unlimited';
  const vaultLimitDescription = normalizedBackupSettings.maxVaultEntries
    ? `Keeping the latest ${normalizedBackupSettings.maxVaultEntries} backups. Oldest entries are pruned automatically.`
    : 'Keeping all backups (no limit).';
  const autoBackupStats = useMemo(() => {
    if (!autoBackupSnapshot || typeof autoBackupSnapshot !== 'object') return null;
    const payload = autoBackupSnapshot.payload || {};
    return {
      snakes: Array.isArray(payload.snakes) ? payload.snakes.length : 0,
      pairings: Array.isArray(payload.pairings) ? payload.pairings.length : 0,
      groups: Array.isArray(payload.groups) ? payload.groups.length : 0,
    };
  }, [autoBackupSnapshot]);
  const lastAutoBackupDisplay = normalizedBackupSettings.lastRun
    ? formatDateTimeForDisplay(normalizedBackupSettings.lastRun)
    : 'Never';
  const manualFeedback = backupFeedback?.context === 'manual' ? backupFeedback : null;
  const autoFeedback = backupFeedback && typeof backupFeedback.context === 'string'
    && backupFeedback.context.startsWith('auto')
    ? backupFeedback
    : null;
  const vaultFeedback = backupFeedback && typeof backupFeedback.context === 'string'
    && backupFeedback.context.startsWith('vault')
    ? backupFeedback
    : null;
  const animalExportFeedback = exportFeedback && exportFeedback.context === 'animals' ? exportFeedback : null;
  const pairingExportFeedback = exportFeedback && exportFeedback.context === 'pairings' ? exportFeedback : null;
  const hasAnimalData = Array.isArray(snakes) && snakes.length > 0;
  const hasPairingData = Array.isArray(pairings) && pairings.length > 0;
  const normalizedMorphAliases = useMemo(() => {
    const normalized = normalizeMorphAliasDatabase(morphAliases);
    return normalized.length ? normalized : [...DEFAULT_MORPH_ALIASES];
  }, [morphAliases]);
  const aliasRows = useMemo(() => {
    return [...normalizedMorphAliases].sort((a, b) => a.alias.localeCompare(b.alias));
  }, [normalizedMorphAliases]);
  const normalizedGeneAliases = useMemo(() => mergeGeneAliasRows(geneAliases), [geneAliases]);
  const geneAliasRows = useMemo(() => {
    return [...normalizedGeneAliases].sort((a, b) => a.geneName.localeCompare(b.geneName, undefined, { sensitivity: 'base' }));
  }, [normalizedGeneAliases]);

  const persistMorphAliases = useCallback((updater) => {
    if (typeof setMorphAliases !== 'function') return;
    setMorphAliases((prev) => {
      const current = normalizeMorphAliasDatabase(prev);
      const nextValue = typeof updater === 'function' ? updater(current) : updater;
      const normalized = normalizeMorphAliasDatabase(nextValue);
      return normalized.length ? normalized : [...DEFAULT_MORPH_ALIASES];
    });
  }, [setMorphAliases]);

  const resetAliasDraft = useCallback(() => {
    setAliasDraftAlias('');
    setAliasDraftGenes('');
    setAliasDraftNotes('');
    setEditingAliasKey('');
  }, []);
  const resetGeneAliasDraft = useCallback(() => {
    setGeneAliasDraftName('');
    setGeneAliasDraftAliases('');
    setGeneAliasDraftShorthand('');
    setEditingGeneAliasKey('');
  }, []);

  const handleSaveAlias = useCallback(() => {
    const alias = String(aliasDraftAlias || '').trim();
    const genes = String(aliasDraftGenes || '')
      .split(/[\n,;|/]+/)
      .map(value => String(value || '').trim())
      .filter(Boolean);
    const notes = String(aliasDraftNotes || '').trim();
    if (!alias || !genes.length) {
      if (typeof showAppAlert === 'function') {
        showAppAlert(t('setup.aliases.validation.aliasAndGeneRequired', { defaultValue: 'Alias and at least one gene are required.' }));
      }
      return;
    }
    const aliasKey = normalizeMorphAliasLookupKey(alias);
    persistMorphAliases((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      const editKey = normalizeMorphAliasLookupKey(editingAliasKey);
      const existingIndex = next.findIndex(item => normalizeMorphAliasLookupKey(item.alias) === (editKey || aliasKey));
      const row = { alias, genes, ...(notes ? { notes } : {}) };
      if (existingIndex >= 0) {
        next[existingIndex] = row;
      } else {
        next.push(row);
      }
      return next;
    });
    resetAliasDraft();
  }, [aliasDraftAlias, aliasDraftGenes, aliasDraftNotes, editingAliasKey, persistMorphAliases, resetAliasDraft, showAppAlert, t]);

  const handleEditAlias = useCallback((row) => {
    if (!row) return;
    setAliasDraftAlias(row.alias || '');
    setAliasDraftGenes(Array.isArray(row.genes) ? row.genes.join(', ') : '');
    setAliasDraftNotes(row.notes || '');
    setEditingAliasKey(row.alias || '');
  }, []);

  const handleDeleteAlias = useCallback((alias) => {
    const key = normalizeMorphAliasLookupKey(alias);
    if (!key) return;
    persistMorphAliases((prev) => prev.filter(item => normalizeMorphAliasLookupKey(item.alias) !== key));
    if (normalizeMorphAliasLookupKey(editingAliasKey) === key) {
      resetAliasDraft();
    }
  }, [editingAliasKey, persistMorphAliases, resetAliasDraft]);

  const handleExportAliases = useCallback(() => {
    const payload = JSON.stringify(normalizedMorphAliases, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `morph-aliases-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [normalizedMorphAliases]);

  const handleImportAliases = useCallback(async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeMorphAliasDatabase(parsed);
      if (!normalized.length) {
        if (typeof showAppAlert === 'function') {
          showAppAlert(t('setup.aliases.import.noValidRows', { defaultValue: 'No valid alias rows were found in this JSON file.' }));
        }
        return;
      }
      setMorphAliases(normalized);
      if (typeof showAppAlert === 'function') {
        showAppAlert(t('setup.aliases.import.importedMorphAliases', { defaultValue: 'Imported {{count}} morph aliases.', count: normalized.length }));
      }
      resetAliasDraft();
    } catch (error) {
      console.error('Failed to import morph aliases', error);
      if (typeof showAppAlert === 'function') {
        showAppAlert(t('setup.aliases.import.failedMorphAliases', { defaultValue: 'Failed to import alias JSON.' }));
      }
    } finally {
      if (event?.target) {
        event.target.value = '';
      }
    }
  }, [resetAliasDraft, setMorphAliases, showAppAlert, t]);

  const persistGeneAliases = useCallback((updater) => {
    if (typeof setGeneAliases !== 'function') return;
    setGeneAliases((prev) => {
      const current = mergeGeneAliasRows(prev);
      const nextValue = typeof updater === 'function' ? updater(current) : updater;
      return mergeGeneAliasRows(nextValue);
    });
  }, [setGeneAliases]);

  const handleSaveGeneAlias = useCallback(() => {
    const geneName = String(geneAliasDraftName || '').trim();
    const aliases = String(geneAliasDraftAliases || '')
      .split(/[\n,;|/]+/)
      .map(value => String(value || '').trim())
      .filter(Boolean);
    const shorthand = String(geneAliasDraftShorthand || '')
      .split(/[\n,;|/]+/)
      .map(value => String(value || '').trim())
      .filter(Boolean);
    if (!geneName) {
      if (typeof showAppAlert === 'function') showAppAlert(t('setup.aliases.validation.geneNameRequired', { defaultValue: 'Gene name is required.' }));
      return;
    }

    const row = {
      geneName,
      aliases: normalizeGeneAliasRows([{ geneName, aliases }])[0]?.aliases || [geneName],
      shorthand: normalizeGeneAliasRows([{ geneName, shorthand }])[0]?.shorthand || [],
    };

    persistGeneAliases((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      const key = (editingGeneAliasKey || geneName).toLowerCase();
      const index = list.findIndex(item => String(item?.geneName || '').trim().toLowerCase() === key);
      if (index >= 0) {
        list[index] = row;
      } else {
        list.push(row);
      }
      return list;
    });
    resetGeneAliasDraft();
  }, [editingGeneAliasKey, geneAliasDraftAliases, geneAliasDraftName, geneAliasDraftShorthand, persistGeneAliases, resetGeneAliasDraft, showAppAlert, t]);

  const handleEditGeneAlias = useCallback((row) => {
    if (!row) return;
    setGeneAliasDraftName(row.geneName || '');
    setGeneAliasDraftAliases(Array.isArray(row.aliases) ? row.aliases.join(', ') : '');
    setGeneAliasDraftShorthand(Array.isArray(row.shorthand) ? row.shorthand.join(', ') : '');
    setEditingGeneAliasKey(row.geneName || '');
  }, []);

  const handleDeleteGeneAlias = useCallback((geneName) => {
    const key = String(geneName || '').trim().toLowerCase();
    if (!key) return;
    persistGeneAliases((prev) => (Array.isArray(prev) ? prev.filter(item => String(item?.geneName || '').trim().toLowerCase() !== key) : []));
    if (String(editingGeneAliasKey || '').trim().toLowerCase() === key) {
      resetGeneAliasDraft();
    }
  }, [editingGeneAliasKey, persistGeneAliases, resetGeneAliasDraft]);

  const handleExportGeneAliases = useCallback(() => {
    const payload = JSON.stringify(geneAliasRows, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gene-aliases-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [geneAliasRows]);

  const handleImportGeneAliases = useCallback(async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = mergeGeneAliasRows(parsed);
      if (!normalized.length) {
        if (typeof showAppAlert === 'function') showAppAlert(t('setup.aliases.import.noValidGeneRows', { defaultValue: 'No valid gene alias rows were found in this JSON file.' }));
        return;
      }
      setGeneAliases(normalized);
      if (typeof showAppAlert === 'function') {
        showAppAlert(t('setup.aliases.import.importedGeneAliases', { defaultValue: 'Imported {{count}} gene alias rows.', count: normalized.length }));
      }
      resetGeneAliasDraft();
    } catch (error) {
      console.error('Failed to import gene aliases', error);
      if (typeof showAppAlert === 'function') showAppAlert(t('setup.aliases.import.failedGeneAliases', { defaultValue: 'Failed to import gene alias JSON.' }));
    } finally {
      if (event?.target) event.target.value = '';
    }
  }, [resetGeneAliasDraft, setGeneAliases, showAppAlert, t]);
  const [pairingExportType, setPairingExportType] = useState('default');
  const [pairingSeasonFilter, setPairingSeasonFilter] = useState('all');
  const [pairingStatusFilter, setPairingStatusFilter] = useState([]);
  const [includeUnpairedMales, setIncludeUnpairedMales] = useState(false);
  const pairingSeasonOptions = useMemo(() => {
    const map = new Map();
    (Array.isArray(pairings) ? pairings : []).forEach(pairing => {
      const token = getPairingSeasonToken(pairing);
      if (!token || map.has(token)) return;
      const name = resolvePairingSeasonName(pairing) || `Season ${token}`;
      map.set(token, { value: token, label: name });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  }, [pairings]);
  const availablePairingStatuses = useMemo(() => {
    const set = new Set();
    (Array.isArray(pairings) ? pairings : []).forEach(pairing => {
      if (typeof pairing?.status === 'string' && pairing.status.trim()) {
        set.add(pairing.status.trim());
      }
    });
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }, [pairings]);
  const pairingMatrixOptions = useMemo(() => ({
    seasonId: pairingSeasonFilter && pairingSeasonFilter !== 'all' ? pairingSeasonFilter : null,
    statuses: pairingStatusFilter,
    includeUnpaired: includeUnpairedMales,
  }), [pairingSeasonFilter, pairingStatusFilter, includeUnpairedMales]);
  const canExportPairings = useMemo(() => {
    if (pairingExportType === 'byPairing') {
      const rows = getPairingExportRows(pairings, snakes, pairingMatrixOptions || {});
      return rows.length > 0;
    }
    return hasPairingData;
  }, [pairingExportType, pairings, snakes, pairingMatrixOptions, hasPairingData]);
  const translateExportDataset = useCallback((dataset) => ({
    ...dataset,
    columns: (dataset?.columns || []).map(column => ({
      ...column,
      label: t(`export.fields.${column.key}`, { defaultValue: column.label }),
    })),
  }), [t]);
  const translateExportSection = useCallback((section) => {
    const key = String(section || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    return t(`export.sections.${key}`, { defaultValue: section });
  }, [t]);
  const normalizedPdfLabelSettings = useMemo(
    () => normalizePdfLabelSettings(info.pdfLabelSettings),
    [info.pdfLabelSettings]
  );
  const pdfLabelLayout = useMemo(
    () => resolvePdfLabelLayout(normalizedPdfLabelSettings),
    [normalizedPdfLabelSettings]
  );
  const pdfLabelLayoutValidation = useMemo(
    () => validatePdfLabelLayout(normalizedPdfLabelSettings),
    [normalizedPdfLabelSettings]
  );
  const selectedPresetFormat = normalizedPdfLabelSettings.formatType === 'sheet'
    ? 'sheet'
    : (normalizedPdfLabelSettings.formatType === 'custom' ? 'custom' : 'thermal');
  const labelBrandOptions = useMemo(
    () => getLabelBrands(),
    []
  );
  const labelCategoryOptions = useMemo(
    () => getLabelCategories(selectedPresetFormat === 'custom' ? undefined : selectedPresetFormat),
    [selectedPresetFormat]
  );
  const labelPresetOptions = useMemo(() => {
    if (selectedPresetFormat === 'custom') return [];
    const presets = getLabelPresets(selectedPresetFormat);
    return presets.filter(item => (
      item.brand === normalizedPdfLabelSettings.brand
      && item.category === normalizedPdfLabelSettings.category
    ));
  }, [selectedPresetFormat, normalizedPdfLabelSettings.brand, normalizedPdfLabelSettings.category]);
  const handlePdfFormatTypeChange = useCallback((nextFormat) => {
    if (!nextFormat) return;
    if (nextFormat === 'custom') {
      updatePdfLabelSettings(prev => ({ ...prev, formatType: 'custom', brand: 'Custom', presetKey: 'custom' }));
      return;
    }
    const presets = getLabelPresets(nextFormat);
    const preset = presets[0];
    if (!preset) return;
    updatePdfLabelSettings({
      formatType: nextFormat,
      brand: preset.brand,
      category: preset.category,
      presetKey: preset.key,
    });
  }, [updatePdfLabelSettings]);
  const handlePdfBrandChange = useCallback((nextBrand) => {
    if (!nextBrand) return;
    if (selectedPresetFormat === 'custom') {
      updatePdfLabelSettings({ brand: nextBrand });
      return;
    }
    const presets = getLabelPresets(selectedPresetFormat).filter(item => item.brand === nextBrand);
    const matchingCategoryPreset = presets.find(item => item.category === normalizedPdfLabelSettings.category);
    const preset = matchingCategoryPreset || presets[0];
    if (!preset) return;
    updatePdfLabelSettings({
      brand: preset.brand,
      category: preset.category,
      presetKey: preset.key,
    });
  }, [normalizedPdfLabelSettings.category, selectedPresetFormat, updatePdfLabelSettings]);
  const handlePdfCategoryChange = useCallback((nextCategory) => {
    if (!nextCategory) return;
    if (selectedPresetFormat === 'custom') {
      updatePdfLabelSettings({ category: nextCategory });
      return;
    }
    const presets = getLabelPresets(selectedPresetFormat).filter(item => (
      item.brand === normalizedPdfLabelSettings.brand && item.category === nextCategory
    ));
    const preset = presets[0]
      || getLabelPresets(selectedPresetFormat).find(item => item.brand === normalizedPdfLabelSettings.brand)
      || getLabelPresets(selectedPresetFormat)[0];
    if (!preset) return;
    updatePdfLabelSettings({
      category: preset.category,
      presetKey: preset.key,
      brand: preset.brand,
    });
  }, [normalizedPdfLabelSettings.brand, selectedPresetFormat, updatePdfLabelSettings]);
  const handlePdfPresetChange = useCallback((nextPresetKey) => {
    if (!nextPresetKey) return;
    const allPresets = getLabelPresets(selectedPresetFormat === 'custom' ? undefined : selectedPresetFormat);
    const selectedPreset = allPresets.find(item => item.key === nextPresetKey);
    updatePdfLabelSettings({
      presetKey: nextPresetKey,
      ...(selectedPreset ? {
        brand: selectedPreset.brand,
        category: selectedPreset.category,
      } : {}),
    });
  }, [selectedPresetFormat, updatePdfLabelSettings]);
  const handlePdfCustomNumberChange = useCallback((key, value) => {
    const parsed = Number(value);
    updatePdfLabelSettings({
      [key]: Number.isFinite(parsed) ? parsed : 0,
    });
  }, [updatePdfLabelSettings]);
  const normalizedLabLabelSettings = useMemo(
    () => normalizeLabLabelSizeSettings(info.labLabelSettings),
    [info.labLabelSettings]
  );
  const activeLabLabelSize = useMemo(
    () => getActiveLabelSize(normalizedLabLabelSettings),
    [normalizedLabLabelSettings]
  );
  const [labLabelDraft, setLabLabelDraft] = useState(() => ({
    widthMm: String(activeLabLabelSize.widthMm),
    heightMm: String(activeLabLabelSize.heightMm),
    presetKey: activeLabLabelSize.presetKey,
  }));
  const [labLabelSettingsError, setLabLabelSettingsError] = useState('');
  const [labLabelDebugGuides, setLabLabelDebugGuides] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(LAB_LABEL_DEBUG_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    setLabLabelDraft({
      widthMm: String(activeLabLabelSize.widthMm),
      heightMm: String(activeLabLabelSize.heightMm),
      presetKey: activeLabLabelSize.presetKey,
    });
    setLabLabelSettingsError('');
  }, [activeLabLabelSize.heightMm, activeLabLabelSize.presetKey, activeLabLabelSize.widthMm]);
  const labLabelDraftValidation = useMemo(
    () => validateLabLabelSize(labLabelDraft.widthMm, labLabelDraft.heightMm),
    [labLabelDraft.heightMm, labLabelDraft.widthMm]
  );
  const previewLabLabelSize = useMemo(() => {
    if (!labLabelDraftValidation.isValid) {
      return activeLabLabelSize;
    }
    return {
      widthMm: Number(labLabelDraft.widthMm),
      heightMm: Number(labLabelDraft.heightMm),
      presetKey: labLabelDraft.presetKey,
    };
  }, [activeLabLabelSize, labLabelDraft.heightMm, labLabelDraft.presetKey, labLabelDraft.widthMm, labLabelDraftValidation.isValid]);
  const handleLabLabelDraftChange = useCallback((key, value) => {
    setLabLabelDraft(prev => ({
      ...prev,
      [key]: value,
      presetKey: 'custom',
    }));
    setLabLabelSettingsError('');
  }, []);
  const handleLabLabelPresetChange = useCallback((nextPresetKey) => {
    const preset = getLabLabelPresetByKey(nextPresetKey);
    if (!preset) return;
    setLabLabelDraft({
      widthMm: String(preset.widthMm),
      heightMm: String(preset.heightMm),
      presetKey: preset.key,
    });
    setLabLabelSettingsError('');
  }, []);
  const handleSaveLabLabelSettings = useCallback(() => {
    const validation = validateLabLabelSize(labLabelDraft.widthMm, labLabelDraft.heightMm);
    if (!validation.isValid) {
      setLabLabelSettingsError(validation.errors[0] || 'Invalid label size.');
      return;
    }
    const widthMm = Number(labLabelDraft.widthMm);
    const heightMm = Number(labLabelDraft.heightMm);
    const matchingPreset = LAB_LABEL_SIZE_PRESETS.find(item => item.widthMm === widthMm && item.heightMm === heightMm);
    updateLabLabelSettings({
      widthMm,
      heightMm,
      presetKey: matchingPreset ? matchingPreset.key : 'custom',
    });
    setLabLabelSettingsError('');
  }, [labLabelDraft.heightMm, labLabelDraft.widthMm, updateLabLabelSettings]);
  const handleResetLabLabelSettings = useCallback(() => {
    const defaults = getDefaultLabLabelSizeSettings();
    updateLabLabelSettings(defaults);
    setLabLabelDraft({
      widthMm: String(defaults.widthMm),
      heightMm: String(defaults.heightMm),
      presetKey: defaults.presetKey,
    });
    setLabLabelSettingsError('');
  }, [updateLabLabelSettings]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LAB_LABEL_DEBUG_STORAGE_KEY, labLabelDebugGuides ? 'true' : 'false');
    } catch {
      // Ignore storage failures in preview-only debug setting.
    }
  }, [labLabelDebugGuides]);
  const [previewName, setPreviewName] = useState(() => info.name || info.businessName || BORIS_PREVIEW_DEFAULTS.name);
  const [previewYear, setPreviewYear] = useState(() => BORIS_PREVIEW_DEFAULTS.year);
  const [previewBirthYear, setPreviewBirthYear] = useState(() => BORIS_PREVIEW_DEFAULTS.birthYear);
  const [previewSex, setPreviewSex] = useState(BORIS_PREVIEW_DEFAULTS.sex);
  const [previewSequence, setPreviewSequence] = useState(1);
  const [previewGenes, setPreviewGenes] = useState(() => BORIS_PREVIEW_DEFAULTS.genes || '');
  const templateInputRef = useRef(null);
  const pendingTemplateSelectionRef = useRef(null);
  const lastTemplateSelectionRef = useRef({ start: null, end: null });

  const handleReturnToDefaults = useCallback(async () => {
    if (typeof onResetToDefaults !== 'function') {
      if (typeof showAppAlert === 'function') {
        await showAppAlert('Return to Defaults is unavailable in this build.');
      }
      return;
    }

    let confirmed = true;
    if (typeof showAppConfirm === 'function') {
      confirmed = await showAppConfirm(
        'This will permanently erase all local Breeding Planner data on this device and restore factory defaults. This cannot be undone.',
        {
          title: 'Return to Defaults',
          confirmLabel: 'Return to Defaults',
          cancelLabel: 'Cancel',
        }
      );
    }
    if (!confirmed) return;

    try {
      await onResetToDefaults();
      if (typeof showAppAlert === 'function') {
        await showAppAlert('Factory reset complete. The app will now reload.', {
          title: 'Return to Defaults Complete',
          confirmLabel: 'Reload Now',
        });
      }
      if (typeof window !== 'undefined' && window.location) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to reset app to defaults', error);
      if (typeof showAppAlert === 'function') {
        await showAppAlert(error?.message || 'Failed to return app to defaults.');
      }
    }
  }, [onResetToDefaults, showAppAlert, showAppConfirm]);

  const handleManualBackupDownload = useCallback(() => {
    if (typeof createBackupPayload !== 'function') {
      setBackupFeedback({
        type: 'error',
        message: 'Backup export is unavailable.',
        context: 'manual',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      const payload = createBackupPayload();
      const serialized = JSON.stringify(payload, null, 2);
      const iso = new Date().toISOString();
      const timestamp = iso.replace(/[:.]/g, '-');
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Downloads are not supported in this environment.');
      }
      const filename = buildBackupFilename('breeding-planner-backup', timestamp);
      const blob = new Blob([serialized], { type: BACKUP_FILE_MIME });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupFeedback({
        type: 'success',
        message: `Backup downloaded (${Array.isArray(payload.snakes) ? payload.snakes.length : 0} snakes, ${Array.isArray(payload.pairings) ? payload.pairings.length : 0} pairings).`,
        context: 'manual',
        timestamp: iso,
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Unable to download backup.',
        context: 'manual',
        timestamp: new Date().toISOString(),
      });
    }
  }, [createBackupPayload]);

  const handleSaveBackupToVault = useCallback(async () => {
    if (typeof createBackupPayload !== 'function' || typeof onCreateVaultEntry !== 'function') {
      setBackupFeedback({
        type: 'error',
        message: 'Backup vault is unavailable.',
        context: 'vault',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      const payload = createBackupPayload();
      const nowIso = new Date().toISOString();
      const manualLabel = t("setup.manualBackup", { defaultValue: "Manual backup" });
      const promptTitle = t("electron.prompts.backupName.title", { defaultValue: "Name this backup file" });
      let desiredName = `${manualLabel} - ${formatDateTimeForDisplay(nowIso)}`;
      if (typeof showAppPrompt === 'function') {
        const prompted = await showAppPrompt(promptTitle, {
          defaultValue: desiredName,
          confirmLabel: t('common.save', { defaultValue: 'Save' }),
          cancelLabel: t('common.cancel', { defaultValue: 'Cancel' }),
        });
        if (prompted && prompted.trim()) {
          desiredName = prompted.trim();
        }
      } else {
        console.warn('Backup naming prompt unavailable because showAppPrompt is not configured.');
      }
      const entry = onCreateVaultEntry(payload, { source: 'manual', name: desiredName, savedAt: nowIso });
      setBackupFeedback({
        type: entry ? 'success' : 'error',
        message: entry ? `Saved "${entry.name}" to the backup vault.` : 'Failed to save backup to the vault.',
        context: 'vault',
        timestamp: nowIso,
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Unable to save the backup to the vault.',
        context: 'vault',
        timestamp: new Date().toISOString(),
      });
    }
  }, [createBackupPayload, onCreateVaultEntry, showAppPrompt, t]);

  const handleAutoBackupDownload = useCallback(() => {
    if (!autoBackupSnapshot || !autoBackupSnapshot.payload) {
      setBackupFeedback({
        type: 'error',
        message: 'No automatic backup is available yet.',
        context: 'auto-download',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Downloads are not supported in this environment.');
      }
      const payload = autoBackupSnapshot.payload;
      const serialized = JSON.stringify(payload, null, 2);
      const sourceIso = autoBackupSnapshot.savedAt || new Date().toISOString();
      const timestamp = sourceIso.replace(/[:.]/g, '-');
      const filename = buildBackupFilename('breeding-planner-auto-backup', timestamp);
      const blob = new Blob([serialized], { type: BACKUP_FILE_MIME });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupFeedback({
        type: 'success',
        message: 'Latest automatic backup downloaded.',
        context: 'auto-download',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Unable to download the automatic backup.',
        context: 'auto-download',
        timestamp: new Date().toISOString(),
      });
    }
  }, [autoBackupSnapshot]);

  const handleToggleAnimalField = useCallback((fieldKey) => {
    setAnimalExportFields(prev => {
      const baseline = normalizeExportFieldSelection(prev, DEFAULT_ANIMAL_EXPORT_FIELDS, ANIMAL_EXPORT_FIELD_DEFS);
      if (!fieldKey) return baseline;
      const exists = baseline.includes(fieldKey);
      if (exists) {
        if (baseline.length <= 1) return baseline;
        return baseline.filter(key => key !== fieldKey);
      }
      return [...baseline, fieldKey];
    });
  }, [setAnimalExportFields]);

  const handleSelectAllAnimalFields = useCallback(() => {
    setAnimalExportFields(ANIMAL_EXPORT_FIELD_DEFS.map(def => def.key));
  }, [setAnimalExportFields]);

  const handleResetAnimalFields = useCallback(() => {
    setAnimalExportFields([...DEFAULT_ANIMAL_EXPORT_FIELDS]);
  }, [setAnimalExportFields]);

  const handleTogglePairingField = useCallback((fieldKey) => {
    setPairingExportFields(prev => {
      const baseline = normalizeExportFieldSelection(prev, DEFAULT_PAIRING_EXPORT_FIELDS, PAIRING_EXPORT_FIELD_DEFS);
      if (!fieldKey) return baseline;
      const exists = baseline.includes(fieldKey);
      if (exists) {
        if (baseline.length <= 1) return baseline;
        return baseline.filter(key => key !== fieldKey);
      }
      return [...baseline, fieldKey];
    });
  }, [setPairingExportFields]);

  const handleSelectAllPairingFields = useCallback(() => {
    setPairingExportFields(PAIRING_EXPORT_FIELD_DEFS.map(def => def.key));
  }, [setPairingExportFields]);

  const handleResetPairingFields = useCallback(() => {
    setPairingExportFields([...DEFAULT_PAIRING_EXPORT_FIELDS]);
  }, [setPairingExportFields]);

  const handleTogglePairingStatusFilter = useCallback((status) => {
    if (!status) return;
    setPairingStatusFilter(prev => {
      const baseline = Array.isArray(prev) ? prev : [];
      const exists = baseline.includes(status);
      if (exists) {
        return baseline.filter(entry => entry !== status);
      }
      return [...baseline, status];
    });
  }, []);

  const handleClearPairingStatusFilter = useCallback(() => {
    setPairingStatusFilter([]);
  }, []);

  const buildPairingExportPayload = useCallback(() => {
    if (pairingExportType === 'byPairing') {
      return buildPairingMatrixExportDataset(pairings, snakes, pairingMatrixOptions || {});
    }
    return buildPairingExportDataset(pairings, snakes, normalizedPairingExportFields);
  }, [pairings, snakes, pairingExportType, pairingMatrixOptions, normalizedPairingExportFields]);

  const handleAnimalsExportPdf = useCallback(async () => {
    const timestamp = new Date().toISOString();
    try {
      const dataset = translateExportDataset(buildAnimalExportDataset(snakes, pairings, normalizedAnimalExportFields));
      if (!dataset.columns.length) {
        throw new Error(t('export.errors.selectField', { defaultValue: 'Select at least one field before exporting.' }));
      }
      if (!dataset.rows.length) {
        throw new Error(t('export.errors.noAnimals', { defaultValue: 'No animals available to export.' }));
      }
      const safeStamp = timestamp.replace(/[:.]/g, '-');
      await exportDatasetToPdf(dataset, {
        title: t('export.animalsTitle', { defaultValue: 'Animals export' }),
        subtitle: t('export.animalsSubtitle', { defaultValue: '{{animals}} animals - {{fields}} fields', animals: dataset.rows.length, fields: dataset.columns.length }),
        fileName: `animals-export-${safeStamp}.pdf`,
      });
      setExportFeedback({
        type: 'success',
        message: t('export.feedback.animalsPdf', { defaultValue: 'Exported {{count}} animals to PDF.', count: dataset.rows.length }),
        context: 'animals',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Animals PDF export failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || t('export.feedback.animalsPdfFailed', { defaultValue: 'Failed to export animals to PDF.' }),
        context: 'animals',
        timestamp: new Date().toISOString(),
      });
    }
  }, [snakes, pairings, normalizedAnimalExportFields, setExportFeedback, t, translateExportDataset]);

  const handleAnimalsExportSheet = useCallback(async () => {
    const timestamp = new Date().toISOString();
    try {
      const dataset = translateExportDataset(buildAnimalExportDataset(snakes, pairings, normalizedAnimalExportFields));
      if (!dataset.columns.length) {
        throw new Error(t('export.errors.selectField', { defaultValue: 'Select at least one field before exporting.' }));
      }
      if (!dataset.rows.length) {
        throw new Error(t('export.errors.noAnimals', { defaultValue: 'No animals available to export.' }));
      }
      const safeStamp = timestamp.replace(/[:.]/g, '-');
      await exportDatasetToXlsx(dataset, {
        fileName: `animals-export-${safeStamp}.xlsx`,
        sheetName: t('export.animalsSheetName', { defaultValue: 'Animals' }),
      });
      setExportFeedback({
        type: 'success',
        message: t('export.feedback.animalsSheet', { defaultValue: 'Exported {{count}} animals to spreadsheet.', count: dataset.rows.length }),
        context: 'animals',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Animals sheet export failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || t('export.feedback.animalsSheetFailed', { defaultValue: 'Failed to export animals to spreadsheet.' }),
        context: 'animals',
        timestamp: new Date().toISOString(),
      });
    }
  }, [snakes, pairings, normalizedAnimalExportFields, setExportFeedback, t, translateExportDataset]);

  const handleGenerateSnakeCatalog = useCallback(async () => {
    const timestamp = new Date().toISOString();
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    try {
      const pairingsBySnakeId = groupPairingsBySnake(pairings, makeSnakeMap(snakes));
      const forSaleAnimals = (Array.isArray(snakes) ? snakes : [])
        .filter((snake) => isSnakeTaggedForSell(snake))
        .sort((a, b) => collator.compare(String(a?.id || ''), String(b?.id || '')))
        .map((snake) => {
          const linkedPairings = pairingsBySnakeId.get(snake.id) || [];
          const pairingLabel = linkedPairings.length ? String(linkedPairings[0]?.label || '').trim() : '';
          return {
            ...snake,
            genetics: resolveCatalogMorph(snake),
            pairing: snake?.pairing || pairingLabel || '',
            primaryImage: resolvePrimaryAnimalImage(snake),
          };
        });

      if (!forSaleAnimals.length) {
        throw new Error(t('export.errors.noSaleAnimals', { defaultValue: 'No animals marked for sale were found.' }));
      }

      await generateSnakeCatalogPDF(forSaleAnimals);
      setExportFeedback({
        type: 'success',
        message: t('export.feedback.catalogGenerated', { defaultValue: 'Generated snake catalog ({{count}} pages).', count: forSaleAnimals.length }),
        context: 'animals',
        timestamp,
      });
    } catch (err) {
      console.error('Snake catalog generation failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || t('export.feedback.catalogFailed', { defaultValue: 'Failed to generate snake catalog.' }),
        context: 'animals',
        timestamp,
      });
    }
  }, [pairings, setExportFeedback, snakes, t]);

  const handlePairingsExportPdf = useCallback(async () => {
    const timestamp = new Date().toISOString();
    try {
      const dataset = translateExportDataset(buildPairingExportPayload());
      if (!dataset.columns.length) {
        throw new Error(t('export.errors.selectField', { defaultValue: 'Select at least one field before exporting.' }));
      }
      if (!dataset.rows.length) {
        throw new Error(t('export.errors.noPairings', { defaultValue: 'No breeding projects available to export.' }));
      }
      const safeStamp = timestamp.replace(/[:.]/g, '-');
      await exportDatasetToPdf(dataset, {
        title: pairingExportType === 'byPairing'
          ? t('export.pairingsByMaleTitle', { defaultValue: 'Pairings by male' })
          : t('export.pairingsTitle', { defaultValue: 'Breeding projects export' }),
        subtitle: t('export.rowsSubtitle', { defaultValue: '{{rows}} rows - {{fields}} fields', rows: dataset.rows.length, fields: dataset.columns.length }),
        fileName: `${pairingExportType === 'byPairing' ? 'pairings-by-male' : 'pairings-export'}-${safeStamp}.pdf`,
      });
      setExportFeedback({
        type: 'success',
        message: pairingExportType === 'byPairing'
          ? t('export.feedback.pairingRowsPdf', { defaultValue: 'Exported {{count}} pairing rows to PDF.', count: dataset.rows.length })
          : t('export.feedback.projectsPdf', { defaultValue: 'Exported {{count}} projects to PDF.', count: dataset.rows.length }),
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Pairings PDF export failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || t('export.feedback.projectsPdfFailed', { defaultValue: 'Failed to export breeding projects to PDF.' }),
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    }
  }, [buildPairingExportPayload, pairingExportType, setExportFeedback, t, translateExportDataset]);

  const handlePairingsExportSheet = useCallback(async () => {
    const timestamp = new Date().toISOString();
    try {
      const dataset = translateExportDataset(buildPairingExportPayload());
      if (!dataset.columns.length) {
        throw new Error(t('export.errors.selectField', { defaultValue: 'Select at least one field before exporting.' }));
      }
      if (!dataset.rows.length) {
        throw new Error(t('export.errors.noPairings', { defaultValue: 'No breeding projects available to export.' }));
      }
      const safeStamp = timestamp.replace(/[:.]/g, '-');
      await exportDatasetToXlsx(dataset, {
        fileName: `${pairingExportType === 'byPairing' ? 'pairings-by-male' : 'pairings-export'}-${safeStamp}.xlsx`,
        sheetName: pairingExportType === 'byPairing'
          ? t('export.maleToFemaleSheetName', { defaultValue: 'Male-to-female' })
          : t('export.pairingsSheetName', { defaultValue: 'Pairings' }),
      });
      setExportFeedback({
        type: 'success',
        message: pairingExportType === 'byPairing'
          ? t('export.feedback.pairingRowsSheet', { defaultValue: 'Exported {{count}} pairing rows to spreadsheet.', count: dataset.rows.length })
          : t('export.feedback.projectsSheet', { defaultValue: 'Exported {{count}} projects to spreadsheet.', count: dataset.rows.length }),
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Pairings sheet export failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || t('export.feedback.projectsSheetFailed', { defaultValue: 'Failed to export breeding projects to spreadsheet.' }),
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    }
  }, [buildPairingExportPayload, pairingExportType, setExportFeedback, t, translateExportDataset]);

  const handlePairingsExportCsv = useCallback(async () => {
    const timestamp = new Date().toISOString();
    try {
      const dataset = translateExportDataset(buildPairingExportPayload());
      if (!dataset.columns.length) {
        throw new Error(t('export.errors.selectField', { defaultValue: 'Select at least one field before exporting.' }));
      }
      if (!dataset.rows.length) {
        throw new Error(t('export.errors.noPairings', { defaultValue: 'No breeding projects available to export.' }));
      }
      const safeStamp = timestamp.replace(/[:.]/g, '-');
      await exportDatasetToCsv(dataset, {
        fileName: `${pairingExportType === 'byPairing' ? 'pairings-by-male' : 'pairings-export'}-${safeStamp}.csv`,
      });
      setExportFeedback({
        type: 'success',
        message: pairingExportType === 'byPairing'
          ? t('export.feedback.pairingRowsCsv', { defaultValue: 'Exported {{count}} pairing rows to CSV.', count: dataset.rows.length })
          : t('export.feedback.projectsCsv', { defaultValue: 'Exported {{count}} projects to CSV.', count: dataset.rows.length }),
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Pairings CSV export failed', err);
      setExportFeedback({
        type: 'error',
        message: err?.message || t('export.feedback.projectsCsvFailed', { defaultValue: 'Failed to export breeding projects to CSV.' }),
        context: 'pairings',
        timestamp: new Date().toISOString(),
      });
    }
  }, [buildPairingExportPayload, pairingExportType, setExportFeedback, t, translateExportDataset]);

  const handleBackupFrequencyChange = useCallback((event) => {
    const nextValue = event?.target?.value || 'off';
    if (typeof updateBackupSettings === 'function') {
      updateBackupSettings({ frequency: nextValue });
    }
  }, [updateBackupSettings]);

  const handleVaultLimitChange = useCallback((event) => {
    if (typeof updateBackupSettings !== 'function') return;
    const rawValue = event?.target?.value;
    if (rawValue === 'unlimited') {
      updateBackupSettings({ maxVaultEntries: 'unlimited' });
      return;
    }
    const parsed = parseInt(rawValue, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      updateBackupSettings({ maxVaultEntries: parsed });
    }
  }, [updateBackupSettings]);

  const handleRunAutoBackupNow = useCallback(() => {
    if (typeof onTriggerAutoBackup !== 'function') {
      setBackupFeedback({
        type: 'error',
        message: 'Automatic backup is unavailable.',
        context: 'auto',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      onTriggerAutoBackup();
      setBackupFeedback({
        type: 'success',
        message: 'Automatic backup created.',
        context: 'auto',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Automatic backup failed.',
        context: 'auto',
        timestamp: new Date().toISOString(),
      });
    }
  }, [onTriggerAutoBackup]);

  const handleDownloadVaultEntry = useCallback((entryId) => {
    const entry = vaultEntries.find(item => item.id === entryId);
    if (!entry) {
      setBackupFeedback({
        type: 'error',
        message: 'Backup file not found.',
        context: 'vault-download',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('Downloads are not supported in this environment.');
      }
      const serialized = JSON.stringify(entry.payload, null, 2);
      const fileSafeName = entry.name.replace(/[\\/:*?"<>|]+/g, '-');
      const filenameBase = fileSafeName || 'breeding-planner-backup';
      const filename = buildBackupFilename(filenameBase, entry.id);
      const blob = new Blob([serialized], { type: BACKUP_FILE_MIME });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupFeedback({
        type: 'success',
        message: `Downloaded "${entry.name}".`,
        context: 'vault-download',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setBackupFeedback({
        type: 'error',
        message: err?.message || 'Unable to download the backup.',
        context: 'vault-download',
        timestamp: new Date().toISOString(),
      });
    }
  }, [vaultEntries]);

  const handleRestoreVaultEntry = useCallback((entryId) => {
    const entry = vaultEntries.find(item => item.id === entryId);
    if (!entry) {
      setRestoreFeedback({
        type: 'error',
        message: 'Backup file not found.',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      if (typeof onRestoreBackup !== 'function') {
        throw new Error('Restore handler is unavailable.');
      }
      onRestoreBackup(entry.payload);
      setRestoreFeedback({
        type: 'success',
        message: `Restored data from "${entry.name}".`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setRestoreFeedback({
        type: 'error',
        message: err?.message || 'Failed to restore backup.',
        timestamp: new Date().toISOString(),
      });
    }
  }, [vaultEntries, onRestoreBackup]);

  const handleRenameVaultEntry = useCallback(async (entryId) => {
    if (typeof onRenameVaultEntry !== 'function') return;
    const entry = vaultEntries.find(item => item.id === entryId);
    if (!entry) return;
    const renameTitle = t("electron.prompts.backupRename.title", { defaultValue: "Rename backup" });
    let next = null;
    if (typeof showAppPrompt === 'function') {
      next = await showAppPrompt(renameTitle, {
        defaultValue: entry.name,
        confirmLabel: t('common.save', { defaultValue: 'Save' }),
        cancelLabel: t('common.cancel', { defaultValue: 'Cancel' }),
      });
    } else {
      console.warn('Backup rename prompt unavailable because showAppPrompt is not configured.');
    }
    if (next && next.trim()) {
      onRenameVaultEntry(entryId, next.trim());
      setBackupFeedback({
        type: 'success',
        message: `Renamed backup to "${next.trim()}".`,
        context: 'vault-rename',
        timestamp: new Date().toISOString(),
      });
    }
  }, [onRenameVaultEntry, showAppPrompt, t, vaultEntries]);

  const handleDeleteVaultEntry = useCallback(async (entryId) => {
    if (typeof onDeleteVaultEntry !== 'function') return;
    const entry = vaultEntries.find(item => item.id === entryId);
    if (!entry) return;
    let confirmed = true;
    const confirmMessage = t("electron.prompts.backupDelete.message", {
      defaultValue: 'Delete "{{name}}"? This cannot be undone.',
      name: entry.name,
    });
    if (typeof showAppConfirm === 'function') {
      confirmed = await showAppConfirm(confirmMessage, {
        confirmLabel: t('common.delete', { defaultValue: 'Delete' }),
        cancelLabel: t('common.cancel', { defaultValue: 'Cancel' }),
      });
    } else {
      console.warn('Backup delete confirmation unavailable because showAppConfirm is not configured.');
    }
    if (!confirmed) return;
    onDeleteVaultEntry(entryId);
    setBackupFeedback({
      type: 'success',
      message: `Deleted "${entry.name}".`,
      context: 'vault-delete',
      timestamp: new Date().toISOString(),
    });
  }, [onDeleteVaultEntry, showAppConfirm, t, vaultEntries]);

  const handleRestoreFileSelected = useCallback(async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const allowLegacyJson = event?.target?.dataset?.allowLegacyJson === 'true';
      const name = typeof file.name === 'string' ? file.name : '';
      const lowerName = name.toLowerCase();
      const isNativeBackup = !!name && lowerName.endsWith(BACKUP_FILE_DOT_EXTENSION);
      const isLegacyJson = !!name && lowerName.endsWith('.json');

      if (!isNativeBackup) {
        if (!allowLegacyJson || !isLegacyJson) {
          throw new Error(`Select a ${BACKUP_FILE_DOT_EXTENSION} backup${allowLegacyJson ? ' or legacy .json file' : ''}.`);
        }
      }

      if (file.type) {
        const normalizedType = file.type.toLowerCase();
        const allowedNativeTypes = [BACKUP_FILE_MIME, 'application/octet-stream'];
        const allowedLegacyTypes = ['application/json', 'text/json', 'application/octet-stream'];
        if (isNativeBackup && !allowedNativeTypes.includes(normalizedType)) {
          throw new Error('Unsupported backup file type.');
        }
        if (!isNativeBackup && allowLegacyJson && isLegacyJson && !allowedLegacyTypes.includes(normalizedType)) {
          throw new Error('Unsupported legacy backup file type.');
        }
      }
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (typeof onRestoreBackup !== 'function') {
        throw new Error('Restore handler is unavailable.');
      }
      await Promise.resolve(onRestoreBackup(parsed));
      setRestoreFeedback({
        type: 'success',
        message: `Restored data from ${file.name}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      setRestoreFeedback({
        type: 'error',
        message: err?.message || 'Failed to restore backup.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      if (event?.target) {
        event.target.value = '';
      }
    }
  }, [onRestoreBackup]);

  useEffect(() => {
    const fallback = info.name || info.businessName;
    if (fallback && !previewName) {
      setPreviewName(fallback);
    }
  }, [info.name, info.businessName, previewName]);

  useEffect(() => {
    const pending = pendingTemplateSelectionRef.current;
    if (!pending) return;
    const input = templateInputRef.current;
    if (input) {
      try {
        if (pending.focus) {
          input.focus();
        }
        const valueLength = input.value?.length ?? 0;
        const start = Math.max(0, Math.min(pending.start ?? valueLength, valueLength));
        const end = Math.max(0, Math.min(pending.end ?? valueLength, valueLength));
        input.setSelectionRange(start, end);
        lastTemplateSelectionRef.current = { start, end };
      } catch (err) {
        /* ignore selection errors */
      }
    }
    pendingTemplateSelectionRef.current = null;
  }, [idConfig.template]);

  const previewId = useMemo(() => {
    try {
      const yearNumeric = Number(previewYear);
      const normalizedYear = Number.isFinite(yearNumeric) && yearNumeric > 0 ? yearNumeric : new Date().getFullYear();
  const birthYearNumeric = Number(previewBirthYear);
  const normalizedBirthYear = Number.isFinite(birthYearNumeric) && birthYearNumeric > 0 ? birthYearNumeric : normalizedYear;
      const seqNumeric = Number(previewSequence);
      const normalizedSeq = Number.isFinite(seqNumeric) && seqNumeric > 0 ? seqNumeric : 1;
      const parsed = splitMorphHetInput(previewGenes);
      const morphTokens = parsed.morphs || [];
      const hetTokens = parsed.hets || [];
      const context = buildIdTemplateContext({
        name: previewName,
        rawName: previewName,
        morphs: morphTokens,
        hets: hetTokens,
        year: normalizedYear,
        sex: previewSex,
        birthYear: normalizedBirthYear,
      });
      return buildIdFromTemplateNormalized(idConfig, context, normalizedSeq);
    } catch (err) {
      return 'Template error';
    }
  }, [idConfig, previewName, previewYear, previewBirthYear, previewSex, previewSequence, previewGenes]);

  return (
    <Card title={t("nav.setup", { defaultValue: "Settings" })}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <TabButton theme={theme} active={setupTab === 'info'} onClick={() => setSetupTab('info')}>{t("setup.info")}</TabButton>
        <TabButton theme={theme} active={setupTab === 'id'} onClick={() => setSetupTab('id')}>{t("setup.idWizard")}</TabButton>
        <TabButton theme={theme} active={setupTab === 'aliases'} onClick={() => setSetupTab('aliases')}>{t('setup.aliases.morphTitle', { defaultValue: 'Morph Alias Manager' })}</TabButton>
        <TabButton theme={theme} active={setupTab === 'geneAliases'} onClick={() => setSetupTab('geneAliases')}>{t('setup.aliases.geneTitle', { defaultValue: 'Gene Alias Manager' })}</TabButton>
        <TabButton theme={theme} active={setupTab === 'export'} onClick={() => setSetupTab('export')}>{t("setup.exports")}</TabButton>
        <TabButton theme={theme} active={setupTab === 'appearance'} onClick={() => setSetupTab('appearance')}>{t("setup.appearance", { defaultValue: "Appearance" })}</TabButton>
        <TabButton theme={theme} active={setupTab === 'backup'} onClick={() => setSetupTab('backup')}>{t("setup.backups")}</TabButton>
        <TabButton theme={theme} active={setupTab === 'language'} onClick={() => setSetupTab('language')}>{t("setup.language")}</TabButton>
        {isDevEnvironment && (
          <TabButton theme={theme} active={setupTab === 'devTools'} onClick={() => setSetupTab('devTools')}>Developer Tools</TabButton>
        )}
      </div>

      {setupTab === 'info' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium">{t('setup.name', { defaultValue: 'Name' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.name}
                onChange={e => persistBreederInfo(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.businessName', { defaultValue: 'Business name' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.businessName}
                onChange={e => persistBreederInfo(prev => ({ ...prev, businessName: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.email', { defaultValue: 'Email' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.email}
                onChange={e => persistBreederInfo(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.phone', { defaultValue: 'Phone' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.phone}
                onChange={e => persistBreederInfo(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.street', { defaultValue: 'Street' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.street}
                onChange={e => persistBreederInfo(prev => ({ ...prev, street: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.postalCode', { defaultValue: 'Postal code' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.postalCode}
                onChange={e => persistBreederInfo(prev => ({ ...prev, postalCode: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.city', { defaultValue: 'City' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.city}
                onChange={e => persistBreederInfo(prev => ({ ...prev, city: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.country', { defaultValue: 'Country' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={info.country}
                onChange={e => persistBreederInfo(prev => ({ ...prev, country: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium">{t('setup.logo', { defaultValue: 'Logo' })}</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="breeder-logo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async e => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    try {
                      const data = await readFileAsDataURL(f);
                      persistBreederInfo(prev => ({ ...prev, logoUrl: data }));
                    } catch (error) {
                      console.error(error);
                    }
                  }}
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border text-sm"
                  onClick={() => {
                    const el = document.getElementById('breeder-logo-upload');
                    if (el) el.click();
                  }}
                >
                  {t('setup.uploadLogo', { defaultValue: 'Upload logo' })}
                </button>
                {info.logoUrl && <img src={info.logoUrl} alt="logo" className="w-20 h-20 object-cover rounded-md border" />}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              className={cx('px-3 py-2 rounded-lg text-white', primaryBtnClass(theme,true))}
              onClick={() => {
                if (typeof showAppAlert === 'function') {
                  showAppAlert(t('setup.saveInfoNotice', { defaultValue: 'Breeder info saved locally for this demo' }));
                } else {
                  console.warn(t('setup.saveInfoNotice', { defaultValue: 'Breeder info saved locally for this demo' }));
                }
                if (typeof onSaved === 'function') onSaved();
              }}
            >
              {t('modal.save', { defaultValue: 'Save' })}
            </button>
          </div>
        </div>
      )}

      {setupTab === 'id' && (
        <div className="border-t pt-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">{t('setup.idTitle', { defaultValue: 'ID generator wizard' })}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {t('setup.idHelp', { defaultValue: 'Define how automatic IDs are created when you add animals, generate hatchlings, or import data.' })}
              </div>
            </div>
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded-lg"
              onClick={handleResetIdConfig}
            >
              {t('setup.resetDefault', { defaultValue: 'Reset to default' })}
            </button>
          </div>

          <div>
            <label className="text-xs font-medium">{t('setup.template', { defaultValue: 'Template' })}</label>
            <input
              className="mt-1 w-full border rounded-xl px-3 py-2 font-mono text-sm"
              ref={templateInputRef}
              value={idConfig.template}
              onChange={e => {
                updateIdConfig({ template: e.target.value });
                captureTemplateSelection();
              }}
              onSelect={captureTemplateSelection}
              onKeyUp={captureTemplateSelection}
              onClick={captureTemplateSelection}
              onFocus={captureTemplateSelection}
              onBlur={captureTemplateSelection}
              placeholder={DEFAULT_ID_GENERATOR_CONFIG.template}
            />
            <div className="mt-1 text-[11px] text-neutral-500">
              {t('setup.templateHint', { defaultValue: "Use tokens such as [YROB], [GEN3], [SEX], and [SEQ]. The sequence token is required; we'll append it automatically if you omit it." })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium">{t('setup.sequencePadding', { defaultValue: 'Sequence padding' })}</label>
              <input
                type="number"
                min={1}
                max={6}
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={idConfig.sequencePadding}
                onChange={e => updateIdConfig({ sequencePadding: parseInt(e.target.value, 10) || 1 })}
              />
              <div className="mt-1 text-[11px] text-neutral-500">{t('setup.sequencePaddingHelp', { defaultValue: 'Pads the [SEQ] number (e.g., 001).' })}</div>
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.letterCasing', { defaultValue: 'Letter casing' })}</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={idConfig.uppercase}
                  onChange={e => updateIdConfig({ uppercase: e.target.checked })}
                />
                <span className="text-sm">{t('setup.forceUppercase', { defaultValue: 'Force uppercase output' })}</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">{t('setup.forceUppercaseHelp', { defaultValue: 'Uncheck to keep mixed case like Ath.' })}</div>
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.freeText', { defaultValue: 'Free text token value' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={idConfig.customText}
                onChange={e => updateIdConfig({ customText: e.target.value })}
                placeholder="BREED"
              />
              <div className="mt-1 text-[11px] text-neutral-500">{t('setup.freeTextHelp', { defaultValue: 'Rendered wherever [TEXT] appears in your template.' })}</div>
            </div>
          </div>

          <div className="border rounded-xl bg-neutral-50 p-4 space-y-3">
            <div className="font-medium text-sm">{t('setup.livePreview', { defaultValue: 'Live preview' })}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <label className="text-xs font-medium">{t('setup.sampleName', { defaultValue: 'Sample name' })}</label>
                <input
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewName}
                  onChange={e => setPreviewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">{t('setup.year', { defaultValue: 'Year' })}</label>
                <input
                  type="number"
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewYear}
                  onChange={e => setPreviewYear(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">{t('setup.birthYear', { defaultValue: 'Birth year' })}</label>
                <input
                  type="number"
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewBirthYear}
                  onChange={e => setPreviewBirthYear(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">{t('setup.sex', { defaultValue: 'Sex' })}</label>
                <select
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-white"
                  value={previewSex}
                  onChange={e => setPreviewSex(e.target.value)}
                >
                  <option value="F">{t('snakeEdit.sexFemale', { defaultValue: 'Female' })}</option>
                  <option value="M">{t('snakeEdit.sexMale', { defaultValue: 'Male' })}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">{t('setup.sequence', { defaultValue: 'Sequence' })}</label>
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewSequence}
                  onChange={e => setPreviewSequence(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium">{t('setup.sampleGenes', { defaultValue: 'Sample genes' })}</label>
                <input
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                  value={previewGenes}
                  onChange={e => setPreviewGenes(e.target.value)}
                  placeholder="Enchi, Fire, Clown"
                />
                <div className="mt-1 text-[11px] text-neutral-500">{t('setup.sampleGenesHelp', { defaultValue: 'Comma, slash, or newline separated list. Each gene contributes a three-letter chunk.' })}</div>
              </div>
            </div>
            <div className="text-sm">
              {t('setup.exampleId', { defaultValue: 'Example ID:' })} <code className="font-mono text-base font-semibold">{previewId}</code>
            </div>
          </div>

          <div className="space-y-1 text-[11px] text-neutral-600">
            <div className="font-semibold text-neutral-700">{t('setup.availableTokens', { defaultValue: 'Available tokens' })}</div>
            <div className="space-y-1.5">
              {ID_TEMPLATE_TOKENS.map(({ token, description }) => {
                const templateValue = token;
                const hasToken = (idConfig.template || '').includes(templateValue);
                const tokenKey = token === '[-]' ? 'dash' : token.replace(/^\[|\]$/g, '').toLowerCase();
                return (
                  <button
                    key={token}
                    type="button"
                    aria-pressed={hasToken}
                    onClick={() => handleTemplateTokenToggle(token)}
                    className={cx(
                      'status-tag-neutral-button w-full flex items-center gap-3 rounded-lg border px-2 py-1.5 text-left transition',
                      hasToken
                        ? 'border-blue-500/60 text-blue-700 shadow-sm'
                        : 'border-neutral-200 bg-white hover:border-blue-400'
                    )}
                  >
                    <span className={cx(
                      'font-mono text-[10px] px-1.5 py-0.5 rounded border',
                      hasToken ? 'border-blue-400 bg-white text-blue-700' : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                    )}
                    >
                      {token}
                    </span>
                    <span className="flex-1 text-[11px] sm:text-xs text-neutral-600">
                      {t(`setup.tokenDesc.${tokenKey}`, { defaultValue: description })}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                      {hasToken
                        ? t('setup.tokenRemove', { defaultValue: 'Remove' })
                        : t('setup.tokenAdd', { defaultValue: 'Add' })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {setupTab === 'aliases' && (
        <div className="border-t pt-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">{t('setup.aliases.morphTitle', { defaultValue: 'Morph Alias Manager' })}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {t('setup.aliases.morphDescription', { defaultValue: 'Map common combo names (e.g. Batman, Pompeii) to underlying genes.' })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={aliasImportInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportAliases}
              />
              <button type="button" className="text-xs px-2 py-1 border rounded-lg" onClick={() => aliasImportInputRef.current?.click()}>
                {t('setup.aliases.importJson', { defaultValue: 'Import JSON' })}
              </button>
              <button type="button" className="text-xs px-2 py-1 border rounded-lg" onClick={handleExportAliases}>
                {t('setup.aliases.exportJson', { defaultValue: 'Export JSON' })}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">{t('setup.aliases.aliasLabel', { defaultValue: 'Alias' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={aliasDraftAlias}
                onChange={e => setAliasDraftAlias(e.target.value)}
                placeholder="Pompeii"
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.aliases.genesLabel', { defaultValue: 'Genes (comma separated)' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={aliasDraftGenes}
                onChange={e => setAliasDraftGenes(e.target.value)}
                placeholder="Black Pastel, Red Stripe, Spotnose, Yellow Belly, Clown"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium">{t('setup.aliases.notesLabel', { defaultValue: 'Notes (optional)' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={aliasDraftNotes}
                onChange={e => setAliasDraftNotes(e.target.value)}
                placeholder="BEL complex combinations"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className={cx('px-3 py-2 rounded-lg text-white text-sm', primaryBtnClass(theme, true))} onClick={handleSaveAlias}>
              {editingAliasKey
                ? t('setup.aliases.updateAlias', { defaultValue: 'Update alias' })
                : t('setup.aliases.addAlias', { defaultValue: 'Add alias' })}
            </button>
            {editingAliasKey && (
              <button type="button" className="px-3 py-2 rounded-lg border text-sm" onClick={resetAliasDraft}>
                {t('setup.aliases.cancelEdit', { defaultValue: 'Cancel edit' })}
              </button>
            )}
          </div>

          <div className="border rounded-xl overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 bg-neutral-50 border-b">
              {t('setup.aliases.aliasesCount', { defaultValue: 'Aliases ({{count}})', count: aliasRows.length })}
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {aliasRows.length ? aliasRows.map(row => (
                <div key={row.alias} className="px-3 py-2 text-sm flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-neutral-800">{row.alias}</div>
                    <div className="text-neutral-600">{(row.genes || []).join(', ')}</div>
                    {row.notes && <div className="text-[11px] text-neutral-500 mt-0.5">{row.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <button type="button" className="text-xs px-2 py-1 border rounded-lg" onClick={() => handleEditAlias(row)}>{t('actions.edit', { defaultValue: 'Edit' })}</button>
                    <button type="button" className="text-xs px-2 py-1 border rounded-lg text-rose-600" onClick={() => handleDeleteAlias(row.alias)}>{t('actions.delete', { defaultValue: 'Delete' })}</button>
                  </div>
                </div>
              )) : (
                <div className="px-3 py-4 text-sm text-neutral-500">{t('setup.aliases.emptyAliases', { defaultValue: 'No aliases configured.' })}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {setupTab === 'geneAliases' && (
        <div className="border-t pt-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">{t('setup.aliases.geneTitle', { defaultValue: 'Gene Alias Manager' })}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {t('setup.aliases.geneDescription', { defaultValue: 'Manage standardized gene aliases and shorthand used in parsing (e.g. OD -> Orange Dream).' })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={geneAliasImportInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportGeneAliases}
              />
              <button type="button" className="text-xs px-2 py-1 border rounded-lg" onClick={() => geneAliasImportInputRef.current?.click()}>
                {t('setup.aliases.importJson', { defaultValue: 'Import JSON' })}
              </button>
              <button type="button" className="text-xs px-2 py-1 border rounded-lg" onClick={handleExportGeneAliases}>
                {t('setup.aliases.exportJson', { defaultValue: 'Export JSON' })}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium">{t('setup.aliases.geneNameLabel', { defaultValue: 'Gene name' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={geneAliasDraftName}
                onChange={e => setGeneAliasDraftName(e.target.value)}
                placeholder="Orange Dream"
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.aliases.geneAliasesLabel', { defaultValue: 'Aliases (comma separated)' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={geneAliasDraftAliases}
                onChange={e => setGeneAliasDraftAliases(e.target.value)}
                placeholder="Orange Dream, OrangeDream"
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t('setup.aliases.shorthandLabel', { defaultValue: 'Shorthand (comma separated)' })}</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={geneAliasDraftShorthand}
                onChange={e => setGeneAliasDraftShorthand(e.target.value)}
                placeholder="OD"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className={cx('px-3 py-2 rounded-lg text-white text-sm', primaryBtnClass(theme, true))} onClick={handleSaveGeneAlias}>
              {editingGeneAliasKey
                ? t('setup.aliases.updateGeneAlias', { defaultValue: 'Update gene alias' })
                : t('setup.aliases.addGeneAlias', { defaultValue: 'Add gene alias' })}
            </button>
            {editingGeneAliasKey && (
              <button type="button" className="px-3 py-2 rounded-lg border text-sm" onClick={resetGeneAliasDraft}>
                {t('setup.aliases.cancelEdit', { defaultValue: 'Cancel edit' })}
              </button>
            )}
          </div>

          <div className="border rounded-xl overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 bg-neutral-50 border-b">
              {t('setup.aliases.geneAliasesCount', { defaultValue: 'Gene aliases ({{count}})', count: geneAliasRows.length })}
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {geneAliasRows.length ? geneAliasRows.map(row => (
                <div key={row.geneName} className="px-3 py-2 text-sm flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-neutral-800">{row.geneName}</div>
                    <div className="text-neutral-600">{t('setup.aliases.aliasesPrefix', { defaultValue: 'Aliases:' })} {(row.aliases || []).join(', ') || '-'}</div>
                    <div className="text-neutral-500 text-xs">{t('setup.aliases.shorthandPrefix', { defaultValue: 'Shorthand:' })} {(row.shorthand || []).join(', ') || '-'}</div>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <button type="button" className="text-xs px-2 py-1 border rounded-lg" onClick={() => handleEditGeneAlias(row)}>{t('actions.edit', { defaultValue: 'Edit' })}</button>
                    <button type="button" className="text-xs px-2 py-1 border rounded-lg text-rose-600" onClick={() => handleDeleteGeneAlias(row.geneName)}>{t('actions.delete', { defaultValue: 'Delete' })}</button>
                  </div>
                </div>
              )) : (
                <div className="px-3 py-4 text-sm text-neutral-500">{t('setup.aliases.emptyGeneAliases', { defaultValue: 'No gene aliases configured.' })}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {setupTab === 'export' && (
        <div className="border-t pt-4 space-y-6">
          <div className="space-y-3">
            <div>
              <div className="font-semibold text-sm">{t('setup.dataExports', { defaultValue: 'Data exports' })}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {t('setup.dataExportsHelp', { defaultValue: 'Choose the columns to include and download PDF or spreadsheet summaries for animals and breeding projects.' })}
              </div>
            </div>
            <div className="border rounded-xl bg-white p-3 shadow-sm space-y-4">
              <div>
                <div className="font-semibold text-sm">{t('export.shedTestingLabelSize', { defaultValue: 'Shed Testing Label Size' })}</div>
                <div className="text-xs text-neutral-500 mt-1">
                  {t('export.shedTestingLabelSizeHelp', { defaultValue: 'These dimensions are used for both shipping labels and individual sample QR labels in the shed testing workflow.' })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {LAB_LABEL_SIZE_PRESETS.map((preset) => {
                  const isActivePreset = labLabelDraft.presetKey === preset.key
                    || (Number(labLabelDraft.widthMm) === preset.widthMm && Number(labLabelDraft.heightMm) === preset.heightMm);
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={cx(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        isActivePreset
                          ? 'border-sky-300 bg-sky-50 text-sky-700'
                          : 'border-neutral-300 bg-white text-neutral-700 hover:border-sky-300'
                      )}
                      onClick={() => handleLabLabelPresetChange(preset.key)}
                    >
                      {preset.label} ({preset.widthMm} × {preset.heightMm} mm)
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold text-neutral-600">
                  <span>{t('export.labelWidthMm', { defaultValue: 'Label Width (mm)' })}</span>
                  <input
                    type="number"
                    min={LAB_LABEL_SIZE_LIMITS_MM.min}
                    max={LAB_LABEL_SIZE_LIMITS_MM.max}
                    step="1"
                    className="w-full border rounded-lg px-2 py-2 text-sm"
                    value={labLabelDraft.widthMm}
                    onChange={e => handleLabLabelDraftChange('widthMm', e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-neutral-600">
                  <span>{t('export.labelHeightMm', { defaultValue: 'Label Height (mm)' })}</span>
                  <input
                    type="number"
                    min={LAB_LABEL_SIZE_LIMITS_MM.min}
                    max={LAB_LABEL_SIZE_LIMITS_MM.max}
                    step="1"
                    className="w-full border rounded-lg px-2 py-2 text-sm"
                    value={labLabelDraft.heightMm}
                    onChange={e => handleLabLabelDraftChange('heightMm', e.target.value)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={cx('px-3 py-2 rounded-lg text-sm text-white', primaryBtnClass(theme, true))}
                  onClick={handleSaveLabLabelSettings}
                >
                  {t('modal.save', { defaultValue: 'Save' })}
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border text-sm"
                  onClick={handleResetLabLabelSettings}
                >
                  {t('setup.resetDefault', { defaultValue: 'Reset to Default' })}
                </button>
                <div className="text-xs text-neutral-500">
                  {t('export.allowedRangeMm', { defaultValue: 'Allowed range: {{min}} to {{max}} mm.', min: LAB_LABEL_SIZE_LIMITS_MM.min, max: LAB_LABEL_SIZE_LIMITS_MM.max })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={labLabelDebugGuides}
                  onChange={e => setLabLabelDebugGuides(e.target.checked)}
                />
                <span>{t('export.showDebugGuides', { defaultValue: 'Show debug guides in preview and generated labels' })}</span>
              </label>
              {labLabelSettingsError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {labLabelSettingsError}
                </div>
              ) : null}
              {!labLabelSettingsError && !labLabelDraftValidation.isValid ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {labLabelDraftValidation.errors[0]}
                </div>
              ) : null}
              <div className="rounded-lg bg-neutral-50 border px-3 py-2 text-xs text-neutral-700">
                <div>
                  {t('export.activeLabelSize', { defaultValue: 'Active label size: {{width}} × {{height}} mm', width: activeLabLabelSize.widthMm, height: activeLabLabelSize.heightMm })}
                </div>
                <div>
                  {t('export.draftPreviewSize', { defaultValue: 'Draft preview size: {{width}} × {{height}} mm', width: previewLabLabelSize.widthMm, height: previewLabLabelSize.heightMm })}
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="text-xs font-semibold text-neutral-700">{t('export.shippingLabelPreview', { defaultValue: 'Shipping label preview' })}</div>
                  <div className="mt-1 text-[11px] text-neutral-500">{t('export.shippingLabelPreviewHelp', { defaultValue: 'Preview uses the same layout boxes and safe area as the PDF generator.' })}</div>
                  <div className="mt-3 flex justify-center">
                    <ShippingLabelPreview
                      size={previewLabLabelSize}
                      debug={labLabelDebugGuides}
                      data={{
                        orderId: 'order_preview',
                        orderNumber: 'BP-ORDER-001',
                        labName: 'ProHerper Genetics Laboratory',
                        labAddress: {
                          line1: '123 Lab Lane',
                          city: 'Phoenix',
                          stateOrRegion: 'AZ',
                          postalCode: '85001',
                          country: 'US',
                        },
                        breeder: {
                          name: info.name || info.businessName || 'Breeder Name',
                          address: {
                            line1: info.street || '123 Breeder Street',
                            city: info.city || 'Berlin',
                            stateOrRegion: '',
                            postalCode: info.postalCode || '10115',
                            country: info.country || 'DE',
                          },
                        },
                        createdAt: new Date().toISOString(),
                        sampleCount: 1,
                      }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="text-xs font-semibold text-neutral-700">{t('export.sampleLabelPreview', { defaultValue: 'Sample label preview' })}</div>
                  <div className="mt-1 text-[11px] text-neutral-500">{t('export.sampleLabelPreviewHelp', { defaultValue: 'One page per sample with fixed text and QR regions.' })}</div>
                  <div className="mt-3 flex justify-center">
                    <SampleLabelPreview
                      size={previewLabLabelSize}
                      debug={labLabelDebugGuides}
                      data={{
                        sampleId: 'SMP-001',
                        orderId: 'order_preview',
                        orderNumber: 'BP-ORDER-001',
                        animalId: 'ANIMAL-001',
                        breederName: info.name || info.businessName || 'Breeder Name',
                        requestedTests: ['Clown', 'Ultramel', 'Sex Determination', 'Puzzle'],
                        sampleStatus: 'pending',
                        qrPayload: 'lab-sample-preview',
                        sampleType: 'shed',
                        labName: 'ProHerper Genetics Laboratory',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="border rounded-xl bg-white p-3 shadow-sm space-y-3">
              <div>
                <div className="font-semibold text-sm">{t('export.pdfLabelSettings', { defaultValue: 'PDF label settings' })}</div>
                <div className="text-xs text-neutral-500 mt-1">
                  {t('export.pdfLabelSettingsHelp', { defaultValue: 'Select a thermal or sheet preset, or define a custom label layout.' })}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="space-y-1 text-xs font-semibold text-neutral-600">
                  <span>{t('export.formatType', { defaultValue: 'Format type' })}</span>
                  <select
                    className="w-full border rounded-lg px-2 py-2 bg-white text-sm"
                    value={normalizedPdfLabelSettings.formatType}
                    onChange={e => handlePdfFormatTypeChange(e.target.value)}
                  >
                    <option value="thermal">{t('export.thermalLabels', { defaultValue: 'Thermal Labels' })}</option>
                    <option value="sheet">{t('export.sheetLabels', { defaultValue: 'Sheet Labels' })}</option>
                    <option value="custom">{t('export.customSize', { defaultValue: 'Custom Size' })}</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-neutral-600">
                  <span>{t('export.brand', { defaultValue: 'Brand' })}</span>
                  <select
                    className="w-full border rounded-lg px-2 py-2 bg-white text-sm"
                    value={normalizedPdfLabelSettings.brand}
                    onChange={e => handlePdfBrandChange(e.target.value)}
                  >
                    {labelBrandOptions.map(brand => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-neutral-600">
                  <span>{t('export.labelCategory', { defaultValue: 'Label category' })}</span>
                  <select
                    className="w-full border rounded-lg px-2 py-2 bg-white text-sm"
                    value={normalizedPdfLabelSettings.category}
                    onChange={e => handlePdfCategoryChange(e.target.value)}
                  >
                    {labelCategoryOptions.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                {normalizedPdfLabelSettings.formatType !== 'custom' && (
                  <label className="space-y-1 text-xs font-semibold text-neutral-600">
                    <span>{t('export.sizePreset', { defaultValue: 'Size preset' })}</span>
                    <select
                      className="w-full border rounded-lg px-2 py-2 bg-white text-sm"
                      value={normalizedPdfLabelSettings.presetKey}
                      onChange={e => handlePdfPresetChange(e.target.value)}
                    >
                      {labelPresetOptions.map(item => (
                        <option key={item.key} value={item.key}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {normalizedPdfLabelSettings.formatType === 'custom' && (
                  <>
                    <label className="space-y-1 text-xs font-semibold text-neutral-600">
                      <span>{t('export.unit', { defaultValue: 'Unit' })}</span>
                      <select
                        className="w-full border rounded-lg px-2 py-2 bg-white text-sm"
                        value={normalizedPdfLabelSettings.unit}
                        onChange={e => updatePdfLabelSettings({ unit: e.target.value })}
                      >
                        <option value="mm">mm</option>
                        <option value="cm">cm</option>
                        <option value="in">in</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-semibold text-neutral-600">
                      <span>{t('export.labelWidth', { defaultValue: 'Label width' })}</span>
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        className="w-full border rounded-lg px-2 py-2 text-sm"
                        value={normalizedPdfLabelSettings.width}
                        onChange={e => handlePdfCustomNumberChange('width', e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-semibold text-neutral-600">
                      <span>{t('export.labelHeight', { defaultValue: 'Label height' })}</span>
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        className="w-full border rounded-lg px-2 py-2 text-sm"
                        value={normalizedPdfLabelSettings.height}
                        onChange={e => handlePdfCustomNumberChange('height', e.target.value)}
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="rounded-lg bg-neutral-50 border px-3 py-2 text-xs text-neutral-700">
                <div>
                  {t('export.activeLayout', {
                    defaultValue: 'Active layout: {{mode}} - Label {{width}} × {{height}} mm',
                    mode: pdfLabelLayout.mode === 'sheet'
                      ? t('export.sheetGrid', { defaultValue: 'Sheet grid' })
                      : t('export.thermalSingleLabel', { defaultValue: 'Thermal single-label' }),
                    width: pdfLabelLayout.labelWidthMm.toFixed(1),
                    height: pdfLabelLayout.labelHeightMm.toFixed(1),
                  })}
                </div>
                <div>
                  {t('export.pageLayout', {
                    defaultValue: 'Page {{width}} × {{height}} mm',
                    width: pdfLabelLayout.pageWidthMm.toFixed(1),
                    height: pdfLabelLayout.pageHeightMm.toFixed(1),
                  })}
                  {pdfLabelLayout.mode === 'sheet'
                    ? ` - ${t('export.labelsPerPage', { defaultValue: '{{columns}} × {{rows}} labels/page', columns: pdfLabelLayout.columns, rows: pdfLabelLayout.rows })}`
                    : ''}
                </div>
                {!pdfLabelLayoutValidation.isValid && (
                  <div className="mt-1 text-amber-700">
                    {pdfLabelLayoutValidation.warnings.join(' ')}
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="border rounded-xl bg-white p-3 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">{t('setup.animals', { defaultValue: 'Animals' })}</div>
                    <div className="text-xs text-neutral-500">
                      {t('export.selectedFields', { defaultValue: 'Selected {{selected}} of {{total}} fields.', selected: normalizedAnimalExportFields.length, total: ANIMAL_EXPORT_FIELD_DEFS.length })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm text-white', primaryBtnClass(theme, true), (!hasAnimalData ? 'opacity-60 cursor-not-allowed' : ''))}
                      onClick={handleAnimalsExportPdf}
                      disabled={!hasAnimalData}
                    >
                      {t('actions.exportPdf', { defaultValue: 'Export PDF' })}
                    </button>
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm border', hasAnimalData ? '' : 'opacity-60 cursor-not-allowed')}
                      onClick={handleAnimalsExportSheet}
                      disabled={!hasAnimalData}
                    >
                      {t('export.exportSheetXlsx', { defaultValue: 'Export sheet (.xlsx)' })}
                    </button>
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm border', hasAnimalData ? '' : 'opacity-60 cursor-not-allowed')}
                      onClick={handleGenerateSnakeCatalog}
                      disabled={!hasAnimalData}
                    >
                      {t('export.generateCatalog', { defaultValue: 'Generate Catalog' })}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
                  <button type="button" className="underline" onClick={handleSelectAllAnimalFields}>{t('export.selectAll', { defaultValue: 'Select all' })}</button>
                  <button type="button" className="underline" onClick={handleResetAnimalFields}>{t('export.resetDefaults', { defaultValue: 'Reset defaults' })}</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {animalFieldSections.map(section => (
                    <div key={section.section} className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{translateExportSection(section.section)}</div>
                      <div className="space-y-1.5">
                        {section.fields.map(field => {
                          const checked = animalFieldSet.has(field.key);
                          return (
                            <label key={field.key} className="flex items-center gap-2 text-sm text-neutral-700">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-neutral-300"
                                checked={checked}
                                onChange={() => handleToggleAnimalField(field.key)}
                              />
                              <span>{t(`export.fields.${field.key}`, { defaultValue: field.label })}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {!hasAnimalData && (
                  <div className="text-[11px] text-neutral-500">{t("export.addAnimalsHint", { defaultValue: "Add animals to enable exports." })}</div>
                )}
                {animalExportFeedback && (
                  <div className={cx('text-xs', animalExportFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                    {animalExportFeedback.message}
                    {animalExportFeedback.timestamp ? ` — ${formatDateTimeForDisplay(animalExportFeedback.timestamp)}` : ''}
                  </div>
                )}
              </div>
              <div className="border rounded-xl bg-white p-3 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">{t('setup.breedingProjects', { defaultValue: 'Breeding projects' })}</div>
                    <div className="text-xs text-neutral-500">
                      {t('export.selectedFields', { defaultValue: 'Selected {{selected}} of {{total}} fields.', selected: normalizedPairingExportFields.length, total: PAIRING_EXPORT_FIELD_DEFS.length })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm text-white', primaryBtnClass(theme, true), (!canExportPairings ? 'opacity-60 cursor-not-allowed' : ''))}
                      onClick={handlePairingsExportPdf}
                      disabled={!canExportPairings}
                    >
                      {t('actions.exportPdf', { defaultValue: 'Export PDF' })}
                    </button>
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm border', canExportPairings ? '' : 'opacity-60 cursor-not-allowed')}
                      onClick={handlePairingsExportSheet}
                      disabled={!canExportPairings}
                    >
                      {t('export.exportSheetXlsx', { defaultValue: 'Export sheet (.xlsx)' })}
                    </button>
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-lg text-sm border', canExportPairings ? '' : 'opacity-60 cursor-not-allowed')}
                      onClick={handlePairingsExportCsv}
                      disabled={!canExportPairings}
                    >
                      {t('export.exportCsv', { defaultValue: 'Export CSV' })}
                    </button>
                  </div>
                </div>
                <div className="rounded-xl bg-neutral-50 px-3 py-3 space-y-3 text-[11px] text-neutral-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold uppercase tracking-wide text-[10px]">{t('export.layout', { defaultValue: 'Export layout' })}</span>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className={cx('px-2.5 py-1.5 rounded-full border text-xs font-semibold transition', pairingExportType === 'default'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'border-neutral-300 text-neutral-700 bg-white')}
                        onClick={() => setPairingExportType('default')}
                      >
                        {t('export.defaultLayout', { defaultValue: 'Default' })}
                      </button>
                      <button
                        type="button"
                        className={cx('px-2.5 py-1.5 rounded-full border text-xs font-semibold transition', pairingExportType === 'byPairing'
                          ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                          : 'border-neutral-300 text-neutral-700 bg-white')}
                        onClick={() => setPairingExportType('byPairing')}
                      >
                        {t('export.byPairingLayout', { defaultValue: 'By pairing (Male -> Females)' })}
                      </button>
                    </div>
                  </div>
                  {pairingExportType === 'byPairing' && (
                    <div className="space-y-3 border-t border-neutral-200 pt-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('export.season', { defaultValue: 'Season' })}</label>
                        <select
                          className="border rounded-lg px-3 py-2 bg-white text-sm"
                          value={pairingSeasonFilter}
                          onChange={e => setPairingSeasonFilter(e.target.value || 'all')}
                        >
                          <option value="all">{t('export.allSeasons', { defaultValue: 'All seasons' })}</option>
                          {pairingSeasonOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      {availablePairingStatuses.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t('export.statuses', { defaultValue: 'Statuses' })}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {availablePairingStatuses.map(status => {
                              const active = pairingStatusFilter.includes(status);
                              return (
                                <button
                                  key={status}
                                  type="button"
                                  className={cx('px-2 py-1 rounded-full border text-[11px] transition', active
                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                                    : 'border-neutral-300 text-neutral-700 bg-white hover:border-emerald-400')}
                                  onClick={() => handleTogglePairingStatusFilter(status)}
                                >
                                  {status}
                                </button>
                              );
                            })}
                          </div>
                          {pairingStatusFilter.length > 0 && (
                            <button type="button" className="text-[11px] underline" onClick={handleClearPairingStatusFilter}>{t('export.clearStatuses', { defaultValue: 'Clear statuses' })}</button>
                          )}
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-neutral-300"
                          checked={includeUnpairedMales}
                          onChange={e => setIncludeUnpairedMales(e.target.checked)}
                        />
                        <span>{t('export.includeUnpairedMales', { defaultValue: 'Include unpaired males' })}</span>
                      </label>
                      <div className="text-[11px] text-amber-600 flex items-center gap-1">
                        <span className="font-semibold uppercase tracking-wide">{t('export.note', { defaultValue: 'Note' })}</span>
                        <span>{t('export.missingSortOrderNote', { defaultValue: 'Rows missing sort order will show "order not set".' })}</span>
                      </div>
                      {!canExportPairings && (
                        <div className="text-[11px] text-neutral-500">
                          {t('export.noRowsMatchFilters', { defaultValue: 'No rows match the current filters.' })}
                        </div>
                      )}
                    </div>
                  )}
                  {pairingExportType === 'byPairing' && (
                    <div className="text-[11px] text-neutral-500">
                      {t('export.defaultFieldsOnly', { defaultValue: 'Field toggles below only apply to the default export layout.' })}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
                  <button type="button" className="underline" onClick={handleSelectAllPairingFields}>{t('export.selectAll', { defaultValue: 'Select all' })}</button>
                  <button type="button" className="underline" onClick={handleResetPairingFields}>{t('export.resetDefaults', { defaultValue: 'Reset defaults' })}</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pairingFieldSections.map(section => (
                    <div key={section.section} className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{translateExportSection(section.section)}</div>
                      <div className="space-y-1.5">
                        {section.fields.map(field => {
                          const checked = pairingFieldSet.has(field.key);
                          return (
                            <label key={field.key} className="flex items-center gap-2 text-sm text-neutral-700">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-neutral-300"
                                checked={checked}
                                onChange={() => handleTogglePairingField(field.key)}
                              />
                              <span>{t(`export.fields.${field.key}`, { defaultValue: field.label })}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {!hasPairingData && (
                  <div className="text-[11px] text-neutral-500">{t('export.addPairingsHint', { defaultValue: 'Build at least one pairing to enable exports.' })}</div>
                )}
                {pairingExportFeedback && (
                  <div className={cx('text-xs', pairingExportFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                    {pairingExportFeedback.message}
                    {pairingExportFeedback.timestamp ? ` — ${formatDateTimeForDisplay(pairingExportFeedback.timestamp)}` : ''}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {setupTab === 'appearance' && (
        <AppearanceSettingsPanel />
      )}

      {setupTab === 'backup' && (
        <div className="border-t pt-4 space-y-6">
          <div className="space-y-3">
            <div>
              <div className="font-semibold text-sm">Manual backup</div>
              <div className="text-xs text-neutral-500 mt-1">
                Download a Breeding Planner backup containing all animals, pairings, groups, breeder info, and settings.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={cx('px-3 py-2 rounded-lg text-sm text-white', primaryBtnClass(theme, true))}
                onClick={handleManualBackupDownload}
              >
                Download backup ({BACKUP_FILE_DOT_EXTENSION})
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border text-sm"
                onClick={handleSaveBackupToVault}
              >
                Save to vault
              </button>
            </div>
            {manualFeedback && (
              <span className={cx('text-xs', manualFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                {manualFeedback.message}
                {manualFeedback.timestamp ? ` — ${formatDateTimeForDisplay(manualFeedback.timestamp)}` : ''}
              </span>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <div className="font-semibold text-sm">Automatic backups</div>
              <div className="text-xs text-neutral-500 mt-1">
                Keep an automatic snapshot while the planner is open in your browser.
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Schedule</label>
              <select
                className="border rounded-lg px-3 py-2 bg-white text-sm"
                value={normalizedBackupSettings.frequency}
                onChange={handleBackupFrequencyChange}
              >
                <option value="off">Off</option>
                <option value="nightly">Every night</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>
            </div>
            <div className="text-xs text-neutral-500">
              Last automatic backup: {lastAutoBackupDisplay}.
              {autoBackupStats && (autoBackupStats.snakes || autoBackupStats.pairings || autoBackupStats.groups) ? (
                <span>
                  {' '}Includes {autoBackupStats.snakes} snakes, {autoBackupStats.pairings} pairings, {autoBackupStats.groups} groups.
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cx('px-3 py-2 rounded-lg text-sm text-white', primaryBtnClass(theme, true))}
                onClick={handleRunAutoBackupNow}
              >
                Run now
              </button>
              <button
                type="button"
                className={cx('px-3 py-2 rounded-lg text-sm border', autoBackupSnapshot ? '' : 'opacity-60 cursor-not-allowed')}
                onClick={handleAutoBackupDownload}
                disabled={!autoBackupSnapshot}
              >
                Download latest snapshot
              </button>
            </div>
            {autoFeedback && (
              <div className={cx('text-xs', autoFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                {autoFeedback.message}
                {autoFeedback.timestamp ? ` • ${formatDateTimeForDisplay(autoFeedback.timestamp)}` : ''}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <div className="font-semibold text-sm">Backup vault</div>
              <div className="text-xs text-neutral-500 mt-1">
                Stored backups with unique identifiers. Rename, download, restore, or remove them here.
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">Retention limit</label>
              <select
                className="border rounded-lg px-3 py-2 bg-white text-sm w-full sm:w-auto"
                value={vaultLimitValue}
                onChange={handleVaultLimitChange}
              >
                {VAULT_LIMIT_OPTIONS.map(option => {
                  const value = option === 'unlimited' ? 'unlimited' : String(option);
                  const label = option === 'unlimited'
                    ? 'Unlimited (no pruning)'
                    : `Keep last ${option}`;
                  return (
                    <option key={value} value={value}>{label}</option>
                  );
                })}
              </select>
            </div>
            <div className="text-[11px] text-neutral-500">{vaultLimitDescription}</div>
            <div className="text-xs text-neutral-500">
              {vaultEntries.length ? `${vaultEntries.length} backup${vaultEntries.length === 1 ? '' : 's'} saved.` : 'No backups saved yet.'}
            </div>
            {vaultFeedback && (
              <div className={cx('text-xs', vaultFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                {vaultFeedback.message}
                {vaultFeedback.timestamp ? ` — ${formatDateTimeForDisplay(vaultFeedback.timestamp)}` : ''}
              </div>
            )}
            <div className="space-y-2">
              {vaultEntries.length ? vaultEntries.map(entry => {
                const createdDisplay = formatDateTimeForDisplay(entry.createdAt);
                const updatedDisplay = entry.updatedAt && entry.updatedAt !== entry.createdAt
                  ? formatDateTimeForDisplay(entry.updatedAt)
                  : null;
                let approxSizeKb = null;
                try {
                  const serialized = JSON.stringify(entry.payload);
                  approxSizeKb = Math.max(1, Math.ceil(serialized.length / 1024));
                } catch (err) {
                  approxSizeKb = null;
                }
                return (
                  <div key={entry.id} className="border rounded-xl bg-white p-3 shadow-sm space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm text-neutral-800">{entry.name}</div>
                        <div className="text-[11px] text-neutral-500 space-x-2">
                          <span>{entry.source === 'auto' ? 'Auto backup' : 'Manual backup'}</span>
                          <span>Created {createdDisplay}</span>
                          {updatedDisplay && <span>Updated {updatedDisplay}</span>}
                          {approxSizeKb && <span>~{approxSizeKb} KB</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border text-xs"
                          onClick={() => handleDownloadVaultEntry(entry.id)}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className={cx('px-3 py-1.5 rounded-lg text-xs text-white', primaryBtnClass(theme, true))}
                          onClick={() => handleRestoreVaultEntry(entry.id)}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border text-xs"
                          onClick={() => handleRenameVaultEntry(entry.id)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border text-xs text-red-600"
                          onClick={() => handleDeleteVaultEntry(entry.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] text-neutral-400 break-words">
                      ID: {entry.id}
                    </div>
                  </div>
                );
              }) : (
                <div className="text-xs text-neutral-500">Create a manual or automatic backup to populate the vault.</div>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <div className="font-semibold text-sm">Restore from backup</div>
              <div className="text-xs text-neutral-500 mt-1">
                Upload a Breeding Planner backup file or import a legacy JSON export to replace the current data.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={restoreInputRef}
                type="file"
                accept={`${BACKUP_FILE_MIME},${BACKUP_FILE_DOT_EXTENSION}`}
                className="hidden"
                onChange={handleRestoreFileSelected}
              />
              <input
                ref={legacyRestoreInputRef}
                type="file"
                accept="application/json,.json"
                data-allow-legacy-json="true"
                className="hidden"
                onChange={handleRestoreFileSelected}
              />
              <button
                type="button"
                className="px-3 py-2 rounded-lg border text-sm"
                onClick={() => {
                  if (restoreInputRef.current) restoreInputRef.current.click();
                }}
              >
                Choose backup file
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border text-sm"
                onClick={() => {
                  if (legacyRestoreInputRef.current) legacyRestoreInputRef.current.click();
                }}
              >
                Import legacy JSON
              </button>
              <span className="text-xs text-neutral-500">{BACKUP_FILE_DOT_EXTENSION} or .json files</span>
            </div>
            {restoreFeedback && (
              <div className={cx('text-xs', restoreFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600')}>
                {restoreFeedback.message}
                {restoreFeedback.timestamp ? ` — ${formatDateTimeForDisplay(restoreFeedback.timestamp)}` : ''}
              </div>
            )}
            <div className="text-[11px] text-neutral-500">
              Restoring replaces everything in the app. Download a backup first to stay safe.
            </div>
          </div>
        </div>
      )}
      {setupTab === 'language' && (
        <div className="border-t pt-4 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-neutral-800">{t("setup.chooseLanguage")}</div>
            <div className="text-xs text-neutral-600">{t("setup.languageHelp")}</div>
            <LanguageSwitcher />
          </div>
        </div>
      )}

      {isDevEnvironment && setupTab === 'devTools' && (
        <div className="border-t pt-4 space-y-4">
          {/* TEMP DEV TOOL - REMOVE BEFORE PRODUCTION */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This section contains destructive developer-only actions.
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 space-y-2">
            <div className="font-semibold text-red-700">Return to Defaults</div>
            <div className="text-xs text-red-700/90">
              Permanently erases all local data and rebuilds the app to a factory-default state.
            </div>
            <button
              type="button"
              className="px-3 py-2 rounded-xl text-sm appearance-btn appearance-btn--danger"
              onClick={handleReturnToDefaults}
            >
              Return to Defaults
            </button>
          </div>
        </div>
      )}

    </Card>
  );
}

function AppearanceSettingsPanel() {
  const { t } = useTranslation();
  const {
    appearanceState,
    resolvedAppearance,
    appearancePresets,
    updateAppearance,
    resetAppearance,
    applyPreset,
    saveCustomPreset,
    effectiveThemeMode,
  } = useAppearance();

  const [customPresetName, setCustomPresetName] = useState('');
  const [presetFeedback, setPresetFeedback] = useState(null);

  const colorFields = [
    { key: 'primary', label: t('appearance.colors.primary', { defaultValue: 'Primary' }), helper: t('appearance.colors.primaryHelp', { defaultValue: 'Accent buttons & key highlights.' }) },
    { key: 'secondary', label: t('appearance.colors.secondary', { defaultValue: 'Secondary' }), helper: t('appearance.colors.secondaryHelp', { defaultValue: 'Borders and subtle accents.' }) },
    { key: 'accent', label: t('appearance.colors.accent', { defaultValue: 'Accent' }), helper: t('appearance.colors.accentHelp', { defaultValue: 'Warnings, success pills, quick highlights.' }) },
    { key: 'background', label: t('appearance.colors.background', { defaultValue: 'Background' }), helper: t('appearance.colors.backgroundHelp', { defaultValue: 'Canvas & page backdrop.' }) },
    { key: 'card', label: t('appearance.colors.card', { defaultValue: 'Cards' }), helper: t('appearance.colors.cardHelp', { defaultValue: 'Panels, cards, modals.' }) },
    { key: 'text', label: t('appearance.colors.text', { defaultValue: 'Text' }), helper: t('appearance.colors.textHelp', { defaultValue: 'Body text & headers.' }) },
  ];

  const themeModeOptions = [
    { value: 'system', label: t('appearance.modes.system', { defaultValue: 'Match system' }) },
    { value: 'light', label: t('appearance.modes.light', { defaultValue: 'Light' }) },
    { value: 'dark', label: t('appearance.modes.dark', { defaultValue: 'Dark' }) },
    { value: 'high-contrast', label: t('appearance.modes.highContrast', { defaultValue: 'High contrast' }) },
  ];

  const fontFamilyOptions = [
    { value: 'default', label: 'Space Grotesk' },
    { value: 'inter', label: 'Inter' },
    { value: 'roboto', label: 'Roboto' },
    { value: 'opensans', label: 'Open Sans' },
    { value: 'serif', label: 'Serif display' },
    { value: 'mono', label: 'Technical mono' },
  ];

  const fontSizeOptions = [
    { value: 'small', label: t('appearance.type.small', { defaultValue: 'Small' }) },
    { value: 'medium', label: t('appearance.type.medium', { defaultValue: 'Medium' }) },
    { value: 'large', label: t('appearance.type.large', { defaultValue: 'Large' }) },
    { value: 'xlarge', label: t('appearance.type.xlarge', { defaultValue: 'Extra large' }) },
  ];

  const lineSpacingOptions = [
    { value: 'compact', label: t('appearance.type.compact', { defaultValue: 'Compact' }) },
    { value: 'normal', label: t('appearance.type.normal', { defaultValue: 'Normal' }) },
    { value: 'relaxed', label: t('appearance.type.relaxed', { defaultValue: 'Relaxed' }) },
  ];

  const densityOptions = [
    { value: 'compact', label: t('appearance.density.compact', { defaultValue: 'Compact' }) },
    { value: 'comfortable', label: t('appearance.density.comfortable', { defaultValue: 'Comfortable' }) },
    { value: 'spacious', label: t('appearance.density.spacious', { defaultValue: 'Spacious' }) },
  ];

  const borderOptions = [
    { value: 'sharp', label: t('appearance.borders.sharp', { defaultValue: 'Sharp' }) },
    { value: 'soft', label: t('appearance.borders.soft', { defaultValue: 'Soft' }) },
    { value: 'rounded', label: t('appearance.borders.rounded', { defaultValue: 'Rounded' }) },
  ];

  const currentPresetKey = appearanceState?.preset || 'custom';
  const motion = appearanceState?.motion || { animations: true, reducedMotion: false };
  const visualImpairedEnabled = currentPresetKey === 'visualImpaired';

  const handleColorInput = useCallback((key, value) => {
    if (!key) return;
    const safeValue = typeof value === 'string' ? value : '#000000';
    updateAppearance({ colors: { [key]: safeValue } });
  }, [updateAppearance]);

  const handleHexInput = useCallback((key, event) => {
    const raw = event?.target?.value || '';
    handleColorInput(key, raw.startsWith('#') ? raw : `#${raw}`);
  }, [handleColorInput]);

  const handleThemeModeChange = useCallback((event) => {
    updateAppearance({ themeMode: event?.target?.value || 'system' });
  }, [updateAppearance]);

  const handleTypographyChange = useCallback((patch) => {
    updateAppearance({ typography: patch });
  }, [updateAppearance]);

  const handleDensityChange = useCallback((event) => {
    updateAppearance({ layoutDensity: event?.target?.value || 'comfortable' });
  }, [updateAppearance]);

  const handleBorderChange = useCallback((event) => {
    updateAppearance({ borderStyle: event?.target?.value || 'soft' });
  }, [updateAppearance]);

  const handleAnimationsToggle = useCallback((event) => {
    updateAppearance({ motion: { animations: event.target.checked } });
  }, [updateAppearance]);

  const handleReducedMotionToggle = useCallback((event) => {
    updateAppearance({ motion: { reducedMotion: event.target.checked, animations: event.target.checked ? false : motion.animations } });
  }, [updateAppearance, motion.animations]);

  const handleVisualImpairedToggle = useCallback((event) => {
    if (event.target.checked) {
      applyPreset('visualImpaired');
    } else {
      resetAppearance('default');
    }
  }, [applyPreset, resetAppearance]);

  const handleBackgroundModeChange = useCallback((event) => {
    const value = event?.target?.value === 'logo' ? 'logo' : 'solid';
    updateAppearance({ backgroundMode: value });
  }, [updateAppearance]);

  const handleSavePreset = useCallback(() => {
    const trimmed = customPresetName.trim();
    if (!trimmed) {
      setPresetFeedback({ type: 'error', message: t('appearance.presets.nameRequired', { defaultValue: 'Give your preset a name first.' }) });
      return;
    }
    const result = saveCustomPreset?.(trimmed);
    if (result?.ok) {
      setPresetFeedback({ type: 'success', message: t('appearance.presets.saved', { defaultValue: 'Preset saved.', name: trimmed }) });
      setCustomPresetName('');
    } else {
      setPresetFeedback({ type: 'error', message: t('appearance.presets.saveError', { defaultValue: 'Could not save that preset. Try another name.' }) });
    }
  }, [customPresetName, saveCustomPreset, t]);

  return (
    <div className="border-t pt-4 space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">{t('appearance.presets.title', { defaultValue: 'Presets' })}</div>
            <div className="text-xs text-neutral-500">{t('appearance.presets.subtitle', { defaultValue: 'Start with a curated palette then fine tune the details.' })}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="px-3 py-2 rounded-lg border text-xs" onClick={() => resetAppearance('default')}>
              {t('appearance.actions.reset', { defaultValue: 'Reset to default' })}
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {appearancePresets.map((preset) => {
            const active = currentPresetKey === preset.key;
            return (
              <div key={preset.key} className={cx('rounded-2xl border p-3 shadow-sm bg-white flex flex-col gap-3', active && 'ring-2 ring-offset-2 ring-sky-400')}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">{preset.label}</div>
                    <div className="text-xs text-neutral-500">{preset.description}</div>
                  </div>
                  {active && <span className="text-[11px] font-semibold text-emerald-600 uppercase">{t('appearance.presets.active', { defaultValue: 'Active' })}</span>}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                  {Object.entries(preset.state.colors).map(([colorKey, colorValue]) => (
                    <span key={colorKey} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border">
                      <span className="w-3 h-3 rounded-full border" style={{ background: colorValue }} />
                      {colorKey}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={cx('flex-1 px-3 py-2 rounded-xl text-sm', primaryBtnClass('appearance', !active))}
                    onClick={() => applyPreset(preset.key)}
                    disabled={active}
                  >
                    {active ? t('appearance.presets.selected', { defaultValue: 'Selected' }) : t('appearance.presets.apply', { defaultValue: 'Apply preset' })}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold text-neutral-800">{t('appearance.presets.saveTitle', { defaultValue: 'Save your own preset' })}</div>
            <div className="text-xs text-neutral-500">{t('appearance.presets.saveSubtitle', { defaultValue: 'Capture the current colors and typography for reuse later.' })}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="flex-1 min-w-[180px] border rounded-xl px-3 py-2 text-sm"
              value={customPresetName}
              onChange={e => setCustomPresetName(e.target.value)}
              placeholder={t('appearance.presets.namePlaceholder', { defaultValue: 'Preset name' })}
            />
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: resolvedAppearance.colors.primary }}
              disabled={!customPresetName.trim()}
              onClick={handleSavePreset}
            >
              {t('appearance.presets.saveButton', { defaultValue: 'Save preset' })}
            </button>
          </div>
          {presetFeedback && (
            <div className={cx('text-xs', presetFeedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600')}>
              {presetFeedback.message}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('appearance.section.mode', { defaultValue: 'Mode & palette' })}</div>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2 rounded-xl border bg-white p-3 text-sm">
                <input type="checkbox" checked={visualImpairedEnabled} onChange={handleVisualImpairedToggle} className="mt-0.5" />
                <span>
                  <span className="block font-semibold text-neutral-900">{t('appearance.accessibility.visualImpaired', { defaultValue: 'Visually impaired preset' })}</span>
                  <span className="block text-xs text-neutral-500">{t('appearance.accessibility.visualImpairedHelp', { defaultValue: 'Bigger fonts, stronger contrast, spacious controls, and reduced motion.' })}</span>
                </span>
              </label>
              <label className="text-xs font-medium">{t('appearance.modes.label', { defaultValue: 'Theme mode' })}</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm bg-white" value={appearanceState.themeMode} onChange={handleThemeModeChange}>
                {themeModeOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <label className="text-xs font-medium">{t('appearance.background.label', { defaultValue: 'Background style' })}</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm bg-white" value={appearanceState.backgroundMode || 'solid'} onChange={handleBackgroundModeChange}>
                <option value="solid">{t('appearance.background.solid', { defaultValue: 'Solid color' })}</option>
                <option value="logo">{t('appearance.background.logo', { defaultValue: 'Breeder logo pattern' })}</option>
              </select>
              <div className="text-[11px] text-neutral-500">
                {t('appearance.background.logoHelp', { defaultValue: 'The logo pattern uses the breeder logo uploaded in Breeder Info.' })}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {colorFields.map(field => (
              <div key={field.key} className="border rounded-xl p-3 space-y-2 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-800">{field.label}</div>
                    <div className="text-[11px] text-neutral-500">{field.helper}</div>
                  </div>
                  <span className="w-7 h-7 rounded-full border" style={{ background: appearanceState.colors[field.key] }} />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <input type="color" value={appearanceState.colors[field.key]} onChange={e => handleColorInput(field.key, e.target.value)} aria-label={field.label} className="h-9 w-14 cursor-pointer border rounded" />
                  <input type="text" value={appearanceState.colors[field.key]} onChange={e => handleHexInput(field.key, e)} className="flex-1 border rounded px-2 py-1 font-mono text-xs" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4">
            <div className="border rounded-xl p-3 bg-white space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('appearance.section.typography', { defaultValue: 'Typography' })}</div>
              <label className="text-xs font-medium">{t('appearance.type.font', { defaultValue: 'Font family' })}</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm bg-white" value={appearanceState.typography.fontFamily} onChange={e => handleTypographyChange({ fontFamily: e.target.value })}>
                {fontFamilyOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <label className="text-xs font-medium">{t('appearance.type.size', { defaultValue: 'Base size' })}</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm bg-white" value={appearanceState.typography.fontSize} onChange={e => handleTypographyChange({ fontSize: e.target.value })}>
                {fontSizeOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <label className="text-xs font-medium">{t('appearance.type.lineSpacing', { defaultValue: 'Line spacing' })}</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm bg-white" value={appearanceState.typography.lineSpacing} onChange={e => handleTypographyChange({ lineSpacing: e.target.value })}>
                {lineSpacingOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="border rounded-xl p-3 bg-white space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('appearance.section.layout', { defaultValue: 'Layout & density' })}</div>
              <label className="text-xs font-medium">{t('appearance.density.label', { defaultValue: 'Density' })}</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm bg-white" value={appearanceState.layoutDensity} onChange={handleDensityChange}>
                {densityOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <label className="text-xs font-medium">{t('appearance.borders.label', { defaultValue: 'Corner radius' })}</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm bg-white" value={appearanceState.borderStyle} onChange={handleBorderChange}>
                {borderOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="border rounded-xl p-3 bg-white space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('appearance.section.motion', { defaultValue: 'Motion' })}</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={motion.animations !== false} onChange={handleAnimationsToggle} />
                {t('appearance.motion.animations', { defaultValue: 'Allow subtle animations' })}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={motion.reducedMotion === true} onChange={handleReducedMotionToggle} />
                {t('appearance.motion.reduce', { defaultValue: 'Prefer reduced motion' })}
              </label>
            </div>
          </div>
        </div>
      </div>

      <AppearancePreview resolvedAppearance={resolvedAppearance} density={appearanceState.layoutDensity} mode={effectiveThemeMode} />
    </div>
  );
}

function AppearancePreview({ resolvedAppearance, density, mode }) {
  const { t } = useTranslation();
  const sampleCounts = [8, 6, 4];
  const badgeStyle = {
    background: resolvedAppearance.colors.secondary,
    color: resolvedAppearance.colors.text,
    borderRadius: '999px',
    padding: '0.1rem 0.5rem',
    fontSize: '0.75rem',
  };
  const buttonStyle = {
    background: resolvedAppearance.colors.primary,
    color: resolvedAppearance.colors.text,
  };
  const densityLabel = density === 'compact'
    ? t('appearance.preview.density.compact', { defaultValue: 'Tighter tables' })
    : density === 'spacious'
      ? t('appearance.preview.density.spacious', { defaultValue: 'Roomy cards' })
      : t('appearance.preview.density.comfortable', { defaultValue: 'Balanced spacing' });

  return (
    <div className="appearance-preview border rounded-2xl bg-white/80 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full border" style={{ background: resolvedAppearance.colors.accent }} />
        <div>
          <div className="font-semibold">{t('appearance.preview.title', { defaultValue: 'Live preview' })}</div>
          <div className="text-xs text-neutral-500">{t('appearance.preview.subtitle', { defaultValue: 'Key UI tokens update instantly.' })}</div>
        </div>
        <span style={badgeStyle}>{mode === 'high-contrast' ? 'Contrast +' : mode}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="border rounded-xl p-3 bg-white space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('appearance.preview.card', { defaultValue: 'Card surface' })}</div>
          <div className="font-semibold text-sm">Demo project</div>
          <p className="text-xs text-neutral-500">Task timeline, feed reminders, QR workflows.</p>
          <div className="flex gap-2">
            <button type="button" className="px-3 py-1.5 rounded-lg text-xs border appearance-btn appearance-btn--ghost">{t('appearance.preview.secondary', { defaultValue: 'Secondary' })}</button>
            <button type="button" className="px-3 py-1.5 rounded-lg text-xs appearance-btn appearance-btn--filled" style={buttonStyle}>{t('appearance.preview.primary', { defaultValue: 'Primary' })}</button>
          </div>
        </div>
        <div className="border rounded-xl p-3 bg-white space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('appearance.preview.list', { defaultValue: 'List sample' })}</div>
          {['Females', 'Males', 'Holdbacks'].map((label, index) => (
            <div key={label} className="flex items-center justify-between text-sm border rounded-lg px-2 py-1 bg-white/80">
              <span>{label}</span>
              <span className="text-xs text-neutral-500">{t('appearance.preview.count', { defaultValue: '{{count}} entries', count: sampleCounts[index] })}</span>
            </div>
          ))}
          <div className="text-[11px] text-neutral-500">{densityLabel}</div>
        </div>
      </div>
    </div>
  );
}

// pairings list
function BreedingDashboardSection({ items = [], theme = 'blue', onOpenPairing, clutchNumberByPairingId, clutchMetadataByPairingId }) {
  const { t } = useTranslation();
  const list = Array.isArray(items) ? items : [];
  const counts = list.reduce((acc, item) => {
    const key = item?.urgency || 'none';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const activeStageCounts = list.reduce((acc, item) => {
    const key = item?.stageKey || 'active';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const openPairing = useCallback((id) => {
    if (id && typeof onOpenPairing === 'function') onOpenPairing(id);
  }, [onOpenPairing]);

  const summaryCards = [
    {
      label: t('pairing.dashboard.overdue', { defaultValue: 'Overdue' }),
      value: counts.overdue || 0,
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    },
    {
      label: t('pairing.dashboard.dueSoon', { defaultValue: 'Due in 3 days' }),
      value: counts.due || 0,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    {
      label: t('pairing.dashboard.nextWeek', { defaultValue: 'Next 7 days' }),
      value: counts.soon || 0,
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    },
    {
      label: t('pairing.dashboard.tracking', { defaultValue: 'Tracking' }),
      value: list.length,
      className: 'border-neutral-200 bg-white text-neutral-700',
    },
  ];

  const stageCards = [
    { key: 'clutch', label: t('pairing.dashboard.stageClutch', { defaultValue: 'Clutch laid' }) },
    { key: 'preLay', label: t('pairing.dashboard.stagePreLay', { defaultValue: 'Pre-lay shed' }) },
    { key: 'ovulation', label: t('pairing.dashboard.stageOvulation', { defaultValue: 'In ovulation' }) },
    { key: 'locks', label: t('pairing.dashboard.stageLocks', { defaultValue: 'Locks observed' }) },
  ];

  return (
    <Card title={t('pairing.dashboardTitle', { count: list.length, defaultValue: 'Breeding Dashboard ({{count}})' })}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {summaryCards.map(card => (
            <div key={card.label} className={cx('border rounded-xl p-3', card.className)}>
              <div className="text-2xl font-semibold leading-none">{card.value}</div>
              <div className="mt-1 text-xs font-medium">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stageCards.map(card => (
            <div key={card.key} className="border rounded-xl p-3 bg-neutral-50">
              <div className="text-lg font-semibold text-neutral-900">{activeStageCounts[card.key] || 0}</div>
              <div className="text-xs text-neutral-500">{card.label}</div>
            </div>
          ))}
        </div>

        {list.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {list.map(item => {
              const urgencyClass = BREEDING_DASHBOARD_URGENCY_STYLES[item.urgency] || BREEDING_DASHBOARD_URGENCY_STYLES.none;
              const clutch = item?.pairing?.clutch || {};
              const clutchRecorded = item.stageKey === 'clutch' && !!clutch.recorded;
              const clutchNumber = clutchNumberByPairingId?.get?.(item.id);
              const clutchMetadata = clutchMetadataByPairingId?.get?.(item.id) || {};
              const boxNumber = clutchMetadata.eggBoxNumber;
              const eggsRaw = clutch.eggsTotal;
              const fertileRaw = clutch.fertileEggs;
              const slugsRaw = clutch.slugs;
              const eggsCount = Number.isFinite(Number(eggsRaw))
                ? Number(eggsRaw)
                : (Number.isFinite(Number(fertileRaw)) ? Number(fertileRaw) : null);
              const slugsCount = Number.isFinite(Number(slugsRaw)) ? Number(slugsRaw) : null;
              const splitBoxCounts = typeof eggsCount === 'number' ? splitEggBoxCounts(eggsCount) : [];
              const eggBoxLabel = splitBoxCounts.length > 1
                ? t('pairing.dashboard.eggBoxesForClutch', {
                  clutch: clutchNumber,
                  number: boxNumber,
                  defaultValue: 'Clutch #{{clutch}} egg boxes from #{{number}}',
                })
                : (boxNumber
                  ? t('pairing.dashboard.eggBoxNumber', { number: boxNumber, defaultValue: 'Egg box #{{number}}' })
                  : t('pairing.dashboard.eggBox', { defaultValue: 'Egg box' }));
              const eggCountLabel = splitBoxCounts.length > 1
                ? t('pairing.dashboard.splitEggBoxes', {
                  first: splitBoxCounts[0],
                  second: splitBoxCounts[1],
                  defaultValue: '{{first}} eggs + {{second}} eggs',
                })
                : (typeof eggsCount === 'number'
                  ? t('pairing.dashboard.eggsInBox', { count: eggsCount, defaultValue: '{{count}} eggs in box' })
                  : t('pairing.dashboard.eggsInBoxUnknown', { defaultValue: 'Egg count not set' }));
              return (
                <div key={item.id} className="border rounded-xl bg-white p-3 shadow-sm space-y-2.5">
                  <div className="flex flex-col gap-2">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-neutral-900 text-sm leading-snug break-words">{item.label}</div>
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border bg-neutral-50 text-neutral-600">{item.cycleYear}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
                        <span className="inline-flex items-center gap-1">
                          <SexBadge sex="M" label={t('snake.sex.male', { defaultValue: 'Male' })} showText={false} />
                          {item.maleName}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <SexBadge sex="F" label={t('snake.sex.female', { defaultValue: 'Female' })} showText={false} />
                          {item.femaleName}
                        </span>
                      </div>
                    </div>
                    <span className={cx('w-fit text-[11px] px-2 py-0.5 rounded-full border font-medium', urgencyClass)}>
                      {item.countdownLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <div className="rounded-lg bg-neutral-50 border px-2.5 py-2">
                      <div className="text-[10px] uppercase font-semibold tracking-wide text-neutral-500">
                        {t('pairing.dashboard.currentStage', { defaultValue: 'Current stage' })}
                      </div>
                      <div className="mt-1 font-medium text-neutral-900 leading-snug">{item.stage}</div>
                      {clutchRecorded && (
                        <div className="mt-1 text-[11px] leading-snug text-neutral-600">
                          {[
                            eggBoxLabel,
                            eggCountLabel,
                            typeof slugsCount === 'number' && slugsCount > 0
                              ? t('pairing.dashboard.slugsInBox', { count: slugsCount, defaultValue: '{{count}} slugs' })
                              : '',
                          ].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg bg-neutral-50 border px-2.5 py-2">
                      <div className="text-[10px] uppercase font-semibold tracking-wide text-neutral-500">
                        {t('pairing.dashboard.nextStage', { defaultValue: 'Next stage' })}
                      </div>
                      <div className="mt-1 font-medium text-neutral-900 leading-snug">{item.nextStage}</div>
                    </div>
                    <div className="rounded-lg bg-neutral-50 border px-2.5 py-2">
                      <div className="text-[10px] uppercase font-semibold tracking-wide text-neutral-500">
                        {t('pairing.dashboard.targetDate', { defaultValue: 'Target date' })}
                      </div>
                      <div className="mt-1 font-medium text-neutral-900">{item.targetLabel || '\u2014'}</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="text-[11px] text-neutral-500 leading-snug">
                      {item.latestLockLabel
                        ? t('pairing.dashboard.latestLock', { date: item.latestLockLabel, defaultValue: 'Latest lock: {{date}}' })
                        : t('pairing.dashboard.noLock', { defaultValue: 'No lock recorded yet' })}
                    </div>
                    <button
                      type="button"
                      className={cx('px-3 py-2 rounded-xl text-xs', primaryBtnClass(theme, true))}
                      onClick={() => openPairing(item.id)}
                    >
                      {item.actionLabel}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">
            {t('pairing.dashboardEmpty', { defaultValue: 'No active pairings to track yet. Create a pairing to start the dashboard.' })}
          </div>
        )}
      </div>
    </Card>
  );
}

function PairingsSection({
  snakes,
  pairings,
  breederMales = [],
  breederFemales = [],
  onDelete,
  onOpenSnake,
  onUpdatePairing,
  onExportPairingQr,
  clutchNumberByPairingId,
  clutchMetadataByPairingId,
  theme = 'blue',
  focusedPairingId = null,
  onFocusPairing,
  title,
  emptyMessage = '{t("snakeEdit.noPairingsYet")} yet. Use "New pairing".',
  variant = 'default',
  showAppAlert,
}) {
  const handleDelete = typeof onDelete === 'function' ? onDelete : null;
  const openSnake = typeof onOpenSnake === 'function' ? onOpenSnake : null;

  const list = Array.isArray(pairings) ? pairings : [];
  const heading = title || `Breeding Planner (${list.length})`;
  const isCollapsedVariant = variant === 'collapsed';
  const listContainerClass = isCollapsedVariant
    ? 'flex flex-col gap-3'
    : 'space-y-4';

  return (
    <Card title={heading}>
      <div className={listContainerClass}>
        {list.map((p, idx) => (
          <PairingInlineCard
            key={p.id}
            pairing={p}
            pairingNumber={clutchNumberByPairingId?.get(p.id) || idx + 1}
            clutchMetadata={clutchMetadataByPairingId?.get?.(p.id) || null}
            snakes={snakes}
            breederMales={breederMales}
            breederFemales={breederFemales}
            onDelete={handleDelete}
            onOpenSnake={openSnake}
            onUpdatePairing={onUpdatePairing}
            onExportPairingQr={onExportPairingQr}
            theme={theme}
            isFocused={focusedPairingId === p.id}
            onFocus={onFocusPairing ? () => onFocusPairing(p.id) : undefined}
            variant={variant}
            showAppAlert={showAppAlert}
          />
        ))}
        {!list.length && (
          <div className={cx('text-sm text-neutral-500', isCollapsedVariant && 'w-full')}>
            {emptyMessage}
          </div>
        )}
      </div>
    </Card>
  );
}

function PairingInlineCard({
  pairing,
  pairingNumber,
  clutchMetadata,
  snakes,
  breederMales = [],
  breederFemales = [],
  onDelete,
  onOpenSnake,
  onUpdatePairing,
  onExportPairingQr,
  theme = 'blue',
  isFocused = false,
  onFocus,
  variant = 'default',
  showAppAlert,
}) {
  const cardRef = useRef(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [isExpanded, setIsExpanded] = useState(variant !== 'collapsed');
  const [isEditingParticipants, setIsEditingParticipants] = useState(false);

  useEffect(() => {
    if (isFocused && cardRef.current) {
      try {
        cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        /* ignore scroll errors */
      }
    }
  }, [isFocused]);

  useEffect(() => {
    if (isFocused && typeof onFocus === 'function') {
      onFocus();
    }
  }, [isFocused, onFocus]);

  const collapsedVariant = variant === 'collapsed';

  useEffect(() => {
    if (!collapsedVariant) {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [collapsedVariant]);

  useEffect(() => {
    if (collapsedVariant && isFocused) {
      setIsExpanded(true);
    }
  }, [collapsedVariant, isFocused]);

  useEffect(() => {
    if (!isExpanded && isEditingParticipants) {
      setIsEditingParticipants(false);
    }
  }, [isExpanded, isEditingParticipants]);

  const { t } = useTranslation();
  const clutchTitleLabel = t('clutch.clutchTitle', { defaultValue: 'Clutch' });
  const deleteLabel = t('clutch.delete', { defaultValue: 'Delete' });
  const collapseLabel = t('clutch.collapse', { defaultValue: 'Collapse' });
  const labelLabel = t('clutch.label', { defaultValue: 'Label' });
  const startingDateLabel = t('clutch.startingDate', { defaultValue: 'Starting date' });
  const appointmentsLabel = t('clutch.appointments', { defaultValue: 'Appointments' });
  const appointmentsHelp = t('clutch.appointmentsHelp', { defaultValue: 'Manage pairing touchpoints' });
  const generateMonthsLabel = t('clutch.generate5Months', { defaultValue: 'Generate 5 months' });
  const addAppointmentLabel = t('clutch.addAppointment', { defaultValue: '+ Add appointment' });
  const appointmentStatusLabel = t('clutch.appointmentStatus', { defaultValue: 'Appointment' });
  const pairingDateLabel = t('clutch.pairingDate', { defaultValue: 'Date of Pairing' });
  const lockLabel = t('clutch.lock', { defaultValue: 'Lock' });
  const lockDateLabel = t('clutch.lockDate', { defaultValue: 'Date of Lock' });
  const notesLabel = t('clutch.notes', { defaultValue: 'Notes' });
  const removeLabel = t('clutch.remove', { defaultValue: 'Remove' });
  const notesFieldLabel = t('clutch.notesField', { defaultValue: 'Notes' });
  const geneticsCalculatorLabel = t('clutch.geneticsCalculator', { defaultValue: 'Genetics calculator' });
  const showLabel = t('clutch.show', { defaultValue: 'Show' });
  const hideLabel = t('common.hide', { defaultValue: 'Hide' });
  const maleLabel = t('snake.sex.male', { defaultValue: 'Male' });
  const femaleLabel = t('snake.sex.female', { defaultValue: 'Female' });
  const editParticipantsLabel = t('pairing.editParticipants', { defaultValue: 'Edit pairing' });
  const doneEditingParticipantsLabel = t('pairing.editParticipantsDone', { defaultValue: 'Done' });
  const maleSelectPlaceholder = t('pairing.selectMalePlaceholder', { defaultValue: 'Choose a male' });
  const femaleSelectPlaceholder = t('pairing.selectFemalePlaceholder', { defaultValue: 'Choose a female' });
  const femaleRuleHelper = t('pairing.femaleUniqueRule', { defaultValue: 'Each female can only be in one active pairing. Update or remove the other project first.' });
  const clutchCardTitleLabel = t('clutchCard.clutch', { defaultValue: clutchTitleLabel });
  const clutchCardMaleLabel = t('clutchCard.male', { defaultValue: maleLabel });
  const clutchCardFemaleLabel = t('clutchCard.female', { defaultValue: femaleLabel });
  const clutchCardStartLabel = t('clutchCard.start', { defaultValue: 'Start' });
  const clutchCardEndLabel = t('clutchCard.end', { defaultValue: 'End' });
  const clutchCardViewDetailsLabel = t('clutchCard.viewDetails', { defaultValue: 'View details' });
  const missingValueLabel = '\u2014';
  const edit = useMemo(() => withPairingLifecycleDefaults(pairing || {}), [pairing]);
  const femaleSnake = useMemo(() => snakeById(snakes, edit.femaleId), [snakes, edit.femaleId]);
  const maleSnake = useMemo(() => snakeById(snakes, edit.maleId), [snakes, edit.maleId]);

  const femaleName = femaleSnake?.name || edit.femaleId || 'Female';
  const maleName = maleSnake?.name || edit.maleId || 'Male';
  const defaultLabel = `${femaleName} \u00D7 ${maleName}`;
  const femaleGeneticsTokens = useMemo(() => {
    if (!femaleSnake) return [];
    return combineMorphsAndHetsForDisplay(femaleSnake.morphs, femaleSnake.hets, femaleSnake.possibleHets);
  }, [femaleSnake]);
  const maleGeneticsTokens = useMemo(() => {
    if (!maleSnake) return [];
    return combineMorphsAndHetsForDisplay(maleSnake.morphs, maleSnake.hets, maleSnake.possibleHets);
  }, [maleSnake]);
  const femaleGeneticsLine = femaleSnake ? (femaleGeneticsTokens.length ? femaleGeneticsTokens.join(', ') : 'Normal') : missingValueLabel;
  const maleGeneticsLine = maleSnake ? (maleGeneticsTokens.length ? maleGeneticsTokens.join(', ') : 'Normal') : missingValueLabel;
  const breederMaleOptions = useMemo(() => {
    if (Array.isArray(breederMales) && breederMales.length) return breederMales;
    return snakes.filter(isMaleSnake);
  }, [breederMales, snakes]);
  const breederFemaleOptions = useMemo(() => {
    if (Array.isArray(breederFemales) && breederFemales.length) return breederFemales;
    return snakes.filter(isFemaleSnake);
  }, [breederFemales, snakes]);
  const hasMaleOptions = breederMaleOptions.length > 0;
  const hasFemaleOptions = breederFemaleOptions.length > 0;
  const formatSnakeOptionLabel = useCallback((snake) => {
    if (!snake) return '';
    const name = typeof snake.name === 'string' ? snake.name.trim() : '';
    const id = snake.id || '';
    if (name && id) return `${name} (${id})`;
    return name || id;
  }, []);

  const setEdit = useCallback((updater) => {
    if (typeof onUpdatePairing !== 'function') return;
    onUpdatePairing(pairing.id, updater);
  }, [onUpdatePairing, pairing.id]);

  useEffect(() => {
    setEdit(prev => {
      if (!prev) return prev;
      const current = (prev.label || '').trim();
      const nextLabel = defaultLabel;
      if (!current && prev.label !== nextLabel) {
        return { ...prev, label: nextLabel };
      }
      return prev;
    });
  }, [defaultLabel, setEdit]);

  const cascadeAppointments = useCallback((appointments, anchorIndex = 0) => {
    if (!Array.isArray(appointments) || !appointments.length) return appointments;
    const index = Math.max(0, Math.min(anchorIndex, appointments.length - 1));
    const anchor = appointments[index];
    if (!anchor?.date) return appointments;
    const anchorDate = parseYmd(anchor.date);
    if (!anchorDate || Number.isNaN(anchorDate.getTime())) return appointments;
    const result = [...appointments];
    let cursor = new Date(anchorDate.getTime());
    for (let idx = index + 1; idx < result.length; idx++) {
      cursor = addMonthsClamped(cursor, 1);
      result[idx] = { ...result[idx], date: localYMD(cursor) };
    }
    return result;
  }, []);

  const labelValue = edit.label || defaultLabel;
  const geneticsOdds = useMemo(() => computePairingGenetics(maleSnake, femaleSnake), [maleSnake, femaleSnake]);
  const hasGeneticsOdds = useMemo(() => {
    if (!geneticsOdds) return false;
    const perGene = Array.isArray(geneticsOdds.perGene) ? geneticsOdds.perGene : [];
    const combined = Array.isArray(geneticsOdds.combined) ? geneticsOdds.combined : [];
    return perGene.length > 0 || combined.length > 0;
  }, [geneticsOdds]);

  useEffect(() => {
    if (!hasGeneticsOdds && showCalculator) {
      setShowCalculator(false);
    }
  }, [hasGeneticsOdds, showCalculator]);

  const hatchlings = useMemo(() => {
    return snakes.filter(s => {
      if (!s) return false;
      const tags = Array.isArray(s.tags) ? s.tags : [];
      const groups = Array.isArray(s.groups) ? s.groups : [];
      const taggedHatchling = tags.includes('hatchling') || groups.some(g => /^hatchlings\b/i.test(g));
      if (!taggedHatchling) return false;
      const pairingMatch = s.pairingId === pairing.id || s?.metadata?.pairingId === pairing.id;
      const parentMatch = (s.damId && s.damId === pairing.femaleId) && (s.sireId && s.sireId === pairing.maleId);
      const nameMatch = typeof s.name === 'string' && labelValue && s.name.includes(labelValue);
      return pairingMatch || parentMatch || nameMatch;
    });
  }, [snakes, pairing, labelValue]);

  const lifecycle = useMemo(() => getBreedingCycleDerived(edit), [edit]);
  const cycleYear = useMemo(() => computeBreedingCycleYear({
    clutchDate: lifecycle.clutchDate,
    preLayDate: lifecycle.preLayDate,
    ovulationDate: lifecycle.ovulationDate,
    hatchDate: lifecycle.hatchDate,
    startDate: edit.startDate || ''
  }), [lifecycle.clutchDate, lifecycle.preLayDate, lifecycle.ovulationDate, lifecycle.hatchDate, edit.startDate]);
  const startDisplay = edit.startDate ? formatDateForDisplay(edit.startDate) : missingValueLabel;
  const endSource = lifecycle.hatchDate || (edit?.hatch?.recorded ? edit?.hatch?.date : '') || lifecycle.clutchDate || '';
  const endDisplay = endSource ? formatDateForDisplay(endSource) : missingValueLabel;
  const eggBoxLabel = clutchMetadata?.eggBoxNumber
    ? (clutchMetadata.eggBoxCount > 1
      ? `Egg box #${clutchMetadata.eggBoxNumber} (${clutchMetadata.eggBoxCount} boxes)`
      : `Egg box #${clutchMetadata.eggBoxNumber}`)
    : '';

  const handleGenerateAppointments = useCallback(() => {
    setEdit(d => {
      const existing = Array.isArray(d.appointments) ? d.appointments : [];
      const firstWithPairingDate = existing.find(appt => normalizeDateInput(appt?.pairingDate || ''));
      const generationStart = normalizeDateInput(firstWithPairingDate?.pairingDate || '') || d.startDate || localYMD(new Date());
      const created = genMonthlyAppointments(generationStart, 5).map((appt, index) => {
        const pairingDate = normalizeDateInput(existing[index]?.pairingDate || '');
        return {
          ...appt,
          date: pairingDate || appt.date,
        };
      });
      const next = { ...d, appointments: cascadeAppointments(created, 0) };
      next.startDate = (next.appointments && next.appointments[0]) ? next.appointments[0].date : next.startDate;
      return next;
    });
  }, [cascadeAppointments, setEdit]);

  const handleAddAppointment = useCallback(() => {
    setEdit(d => {
      const existing = Array.isArray(d.appointments) ? d.appointments : [];
      let defaultDate = null;
      const latestCheckedPairing = [...existing]
        .reverse()
        .find(appt => !!appt?.appointmentDone && normalizeDateInput(appt?.pairingDate || ''));
      if (latestCheckedPairing?.pairingDate) {
        const pairingBase = parseYmd(latestCheckedPairing.pairingDate);
        if (pairingBase && !Number.isNaN(pairingBase.getTime())) {
          defaultDate = localYMD(addMonthsClamped(pairingBase, 1));
        }
      }
      if (!defaultDate) {
        defaultDate = d.startDate || localYMD(new Date());
      }
      const arr = [...existing, {
        id: uid(),
        date: defaultDate,
        notes: '',
        appointmentDone: false,
        pairingDate: null,
        lockObserved: false,
        lockDate: null,
        lockLoggedAt: null,
      }];
      return { ...d, appointments: arr, startDate: arr[0]?.date || d.startDate || null };
    });
  }, [setEdit]);

  const handleOpenMale = useCallback(() => {
    if (typeof onOpenSnake !== 'function' || !maleSnake) return;
    onOpenSnake(maleSnake);
  }, [onOpenSnake, maleSnake]);

  const handleOpenFemale = useCallback(() => {
    if (typeof onOpenSnake !== 'function' || !femaleSnake) return;
    onOpenSnake(femaleSnake);
  }, [onOpenSnake, femaleSnake]);

  const handleChangeMale = useCallback((event) => {
    const nextId = event?.target?.value;
    if (!nextId) return;
    setEdit(prev => {
      if (prev.maleId === nextId) return prev;
      return { ...prev, maleId: nextId };
    });
  }, [setEdit]);

  const handleChangeFemale = useCallback((event) => {
    const nextId = event?.target?.value;
    if (!nextId) return;
    setEdit(prev => {
      if (prev.femaleId === nextId) return prev;
      return { ...prev, femaleId: nextId };
    });
  }, [setEdit]);

  const handleCreateClutchCard = useCallback(async () => {
    const clutchDate = edit?.clutch?.date;
    if (!clutchDate) {
      if (typeof showAppAlert === 'function') {
        await showAppAlert('Please add a clutch date before generating the clutch card.');
      } else {
        console.warn('Please add a clutch date before generating the clutch card.');
      }
      return;
    }
    const eggsValue = resolveEggCountForClutch(edit?.clutch?.eggsTotal, edit?.clutch?.fertileEggs);
    try {
      const maleGenetics = maleSnake ? (maleGeneticsTokens.length ? maleGeneticsTokens.join(', ') : 'Normal') : missingValueLabel;
      const femaleGenetics = femaleSnake ? (femaleGeneticsTokens.length ? femaleGeneticsTokens.join(', ') : 'Normal') : missingValueLabel;
      await exportClutchCardToPdf({
        clutchNumber: pairingNumber,
        clutchDate,
        femaleName,
        femaleGenetics,
        maleName,
        maleGenetics,
        eggsTotal: eggsValue,
        fertileEggs: edit?.clutch?.fertileEggs,
        eggBoxNumber: clutchMetadata?.eggBoxNumber,
        eggBoxCount: clutchMetadata?.eggBoxCount,
        label: labelValue,
      });
    } catch (err) {
      console.error('Failed to generate clutch card', err);
      if (typeof showAppAlert === 'function') {
        await showAppAlert('Unable to generate clutch card PDF.');
      } else {
        console.warn('Unable to generate clutch card PDF.');
      }
    }
  }, [edit, pairingNumber, clutchMetadata, femaleName, maleName, femaleGeneticsTokens, maleGeneticsTokens, labelValue, femaleSnake, maleSnake, showAppAlert]);

  const cardClasses = cx(
    'border rounded-xl shadow-sm bg-white focus:outline-none w-full p-3',
    isFocused ? 'ring-2 ring-sky-400 ring-offset-1' : 'ring-0'
  );

  if (!isExpanded) {
    const handleExpand = () => {
      setIsExpanded(true);
      if (typeof onFocus === 'function') onFocus();
    };
    const handleCollapsedKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleExpand();
      }
    };
    return (
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        className={cx(cardClasses, 'text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-sky-400')}
        onClick={handleExpand}
        onKeyDown={handleCollapsedKey}
        aria-expanded={false}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 shrink-0">
              {clutchCardTitleLabel} #{pairingNumber}{eggBoxLabel ? ` - ${eggBoxLabel}` : ''} - {cycleYear || missingValueLabel}
            </div>
            <div className="text-[11px] text-neutral-500 flex items-center gap-1">
              <span className="font-semibold">{clutchCardViewDetailsLabel}</span>
              <span aria-hidden="true">{'\u203A'}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-800">
            <div className="flex items-center gap-2 min-w-[12rem]">
              <SexBadge sex="M" label={clutchCardMaleLabel} />
              {typeof onOpenSnake === 'function' && maleSnake ? (
                <button
                  type="button"
                  className="truncate font-medium text-sm text-left text-sky-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
                  onClick={handleOpenMale}
                >
                  {maleName}
                </button>
              ) : (
                <span className="font-medium truncate">{maleName}</span>
              )}
            </div>
            <div className="flex items-center gap-2 min-w-[12rem]">
              <SexBadge sex="F" label={clutchCardFemaleLabel} />
              {typeof onOpenSnake === 'function' && femaleSnake ? (
                <button
                  type="button"
                  className="truncate font-medium text-sm text-left text-sky-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
                  onClick={handleOpenFemale}
                >
                  {femaleName}
                </button>
              ) : (
                <span className="font-medium truncate">{femaleName}</span>
              )}
            </div>
            <div className="flex items-center gap-2 min-w-[10rem]">
              <span className="text-[11px] uppercase text-neutral-500 font-semibold">{clutchCardStartLabel}</span>
              <span className="font-medium">{startDisplay}</span>
            </div>
            <div className="flex items-center gap-2 min-w-[10rem]">
              <span className="text-[11px] uppercase text-neutral-500 font-semibold">{clutchCardEndLabel}</span>
              <span className="font-medium">{endDisplay}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={cardRef} className={cardClasses} tabIndex={-1}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold leading-tight text-sm sm:text-base">
            <div className="truncate">{clutchTitleLabel} #{pairingNumber}{eggBoxLabel ? ` - ${eggBoxLabel}` : ''} - {cycleYear || missingValueLabel}</div>
          </div>
          <div className="mt-1 text-[11px] text-neutral-600 space-y-1">
            <div>
              <div className="truncate text-[12px] text-neutral-800 flex items-center gap-1">
                <SexBadge sex="M" label={maleLabel} showText={false} />
                {typeof onOpenSnake === 'function' && maleSnake ? (
                  <button
                    type="button"
                    className="truncate font-medium text-left text-sky-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
                    onClick={handleOpenMale}
                  >
                    {maleName}
                  </button>
                ) : (
                  <span className="truncate font-medium">{maleName}</span>
                )}
              </div>
              <div className="truncate">{maleGeneticsLine}</div>
            </div>
            <div>
              <div className="truncate text-[12px] text-neutral-800 flex items-center gap-1">
                <SexBadge sex="F" label={femaleLabel} showText={false} />
                {typeof onOpenSnake === 'function' && femaleSnake ? (
                  <button
                    type="button"
                    className="truncate font-medium text-left text-sky-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
                    onClick={handleOpenFemale}
                  >
                    {femaleName}
                  </button>
                ) : (
                  <span className="truncate font-medium">{femaleName}</span>
                )}
              </div>
              <div className="truncate">{femaleGeneticsLine}</div>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap mt-1">
            {(pairing.goals || []).slice(0, 4).map(g => <Badge key={g}>{g}</Badge>)}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {typeof onExportPairingQr === 'function' && (
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded-lg"
              onClick={() => onExportPairingQr([pairing])}
            >
              {t('pairing.qrLabelButton', { defaultValue: 'QR label' })}
            </button>
          )}
          {typeof onDelete === 'function' && (
            <button className="text-xs px-2 py-1 border rounded-lg" onClick={() => onDelete(pairing.id)}>{deleteLabel}</button>
          )}
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded-lg"
            onClick={() => setIsEditingParticipants(prev => !prev)}
            disabled={!hasMaleOptions || !hasFemaleOptions}
          >
            {isEditingParticipants ? doneEditingParticipantsLabel : editParticipantsLabel}
          </button>
          {isExpanded && (
            <button
              type="button"
              className="text-xs px-2 py-1 border rounded-lg"
              onClick={() => setIsExpanded(false)}
            >
              {collapseLabel}
            </button>
          )}
        </div>
      </div>

      {isEditingParticipants && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">{maleLabel}</label>
            <select
              className="w-full border rounded-xl px-3 py-2 text-sm bg-white"
              value={edit.maleId || ''}
              onChange={handleChangeMale}
              disabled={!hasMaleOptions}
            >
              <option value="" disabled>{maleSelectPlaceholder}</option>
              {breederMaleOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {formatSnakeOptionLabel(option)}
                </option>
              ))}
            </select>
            {!hasMaleOptions && (
              <div className="text-[11px] text-neutral-500">
                {t('pairing.noMaleOptions', { defaultValue: 'Add breeder males to edit this pairing.' })}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">{femaleLabel}</label>
            <select
              className="w-full border rounded-xl px-3 py-2 text-sm bg-white"
              value={edit.femaleId || ''}
              onChange={handleChangeFemale}
              disabled={!hasFemaleOptions}
            >
              <option value="" disabled>{femaleSelectPlaceholder}</option>
              {breederFemaleOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {formatSnakeOptionLabel(option)}
                </option>
              ))}
            </select>
            {!hasFemaleOptions && (
              <div className="text-[11px] text-neutral-500">
                {t('pairing.noFemaleOptions', { defaultValue: 'Add breeder females to edit this pairing.' })}
              </div>
            )}
          </div>
          <div className="sm:col-span-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {femaleRuleHelper}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">{labelLabel}</label>
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm"
            value={labelValue}
            onChange={e => setEdit(d => ({ ...d, label: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">{startingDateLabel}</label>
          <input
            type="date"
            className="w-full border rounded-xl px-3 py-2 text-sm"
            value={edit.startDate || ''}
            onChange={e => {
              const nextStart = e.target.value || '';
              setEdit(d => {
                const normalizedStart = nextStart || null;
                let nextAppointments = d.appointments;
                if (normalizedStart && Array.isArray(d.appointments) && d.appointments.length) {
                  const arr = [...d.appointments];
                  arr[0] = { ...arr[0], date: normalizedStart };
                  nextAppointments = cascadeAppointments(arr, 0);
                }
                return { ...d, startDate: normalizedStart, appointments: nextAppointments };
              });
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3 min-w-0">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="border rounded-2xl bg-white shadow-sm p-3 flex flex-col gap-3 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{appointmentsLabel}</div>
              <div className="text-[13px] text-neutral-500">{appointmentsHelp}</div>
            </div>
            <div className="flex gap-2">
            <button className="text-xs px-2 py-1 border rounded-lg" onClick={handleGenerateAppointments}>{generateMonthsLabel}</button>
              <button className="text-xs px-2 py-1 border rounded-lg" onClick={handleAddAppointment}>{addAppointmentLabel}</button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {(edit.appointments || []).map((ap, i) => (
              <div key={ap.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-start min-w-0">
                <div className="grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-2">
                  <div className="flex flex-col gap-2">
                    <label className="inline-flex items-center gap-2 text-xs whitespace-nowrap">
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={!!ap.appointmentDone}
                        onChange={e => {
                          const v = e.target.checked;
                          setEdit(d => {
                            const arr = [...(d.appointments || [])];
                            const prevAppt = arr[i] || {};
                            const nextPairingDate = prevAppt.pairingDate || (v ? localYMD(new Date()) : null);
                            const normalizedPairingDate = normalizeDateInput(nextPairingDate);
                            const baseDate = normalizedPairingDate || prevAppt.date || null;
                            arr[i] = {
                              ...prevAppt,
                              appointmentDone: v,
                              pairingObserved: v,
                              pairingDate: nextPairingDate,
                              pairingLoggedAt: nextPairingDate,
                              date: baseDate,
                            };
                            const nextAppointments = baseDate ? cascadeAppointments(arr, i) : arr;
                            return { ...d, appointments: nextAppointments, startDate: nextAppointments[0]?.date || d.startDate || null };
                          });
                        }}
                      />
                      {appointmentStatusLabel}
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs whitespace-nowrap">
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        checked={!!ap.lockObserved}
                        onChange={e => {
                          const v = e.target.checked;
                          setEdit(d => {
                            const arr = [...(d.appointments || [])];
                            const prevAppt = arr[i] || {};
                            const nextLockDate = prevAppt.lockDate || (v ? localYMD(new Date()) : null);
                            arr[i] = {
                              ...prevAppt,
                              lockObserved: v,
                              lockDate: nextLockDate,
                              lockLoggedAt: nextLockDate,
                            };
                            return { ...d, appointments: arr };
                          });
                        }}
                      />
                      {lockLabel}
                    </label>
                  </div>
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs whitespace-nowrap">{pairingDateLabel}</span>
                      <input
                        type="date"
                        className="border rounded-lg px-2 py-1 text-xs min-w-[138px]"
                        value={ap.pairingDate || ''}
                        onChange={e => {
                          const value = e.target.value;
                          const normalized = normalizeDateInput(value);
                          setEdit(d => {
                            const arr = [...(d.appointments || [])];
                            const prevAppt = arr[i] || {};
                            const baseDate = normalized || prevAppt.date || null;
                            arr[i] = {
                              ...prevAppt,
                              pairingDate: normalized || null,
                              pairingLoggedAt: normalized || null,
                              appointmentDone: normalized ? true : !!prevAppt.appointmentDone,
                              pairingObserved: normalized ? true : !!prevAppt.pairingObserved,
                              date: baseDate,
                            };
                            const nextAppointments = baseDate ? cascadeAppointments(arr, i) : arr;
                            return { ...d, appointments: nextAppointments, startDate: nextAppointments[0]?.date || d.startDate || null };
                          });
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs whitespace-nowrap">{lockDateLabel}</span>
                      <input
                        type="date"
                        className="border rounded-lg px-2 py-1 text-xs min-w-[130px]"
                        value={ap.lockDate || ''}
                        onChange={e => {
                          const value = e.target.value;
                          const normalized = normalizeDateInput(value);
                          setEdit(d => {
                            const arr = [...(d.appointments || [])];
                            const prevAppt = arr[i] || {};
                            arr[i] = {
                              ...prevAppt,
                              lockDate: normalized || null,
                              lockLoggedAt: normalized || null,
                              lockObserved: normalized ? true : !!prevAppt.lockObserved,
                            };
                            return { ...d, appointments: arr };
                          });
                        }}
                      />
                    </div>
                  </div>
                  <input
                    placeholder={notesLabel}
                    className="border rounded-lg px-2 py-1 text-xs min-w-0 lg:col-span-2"
                    value={ap.notes || ''}
                    onChange={e => {
                      const v = e.target.value;
                      setEdit(d => {
                        const arr = [...(d.appointments || [])];
                        arr[i] = { ...arr[i], notes: v };
                        return { ...d, appointments: arr };
                      });
                    }}
                  />
                </div>
                <button
                  className="text-[11px] px-2 py-1 border rounded-lg"
                  onClick={() => {
                    setEdit(d => {
                      const arr = [...(d.appointments || [])];
                      arr.splice(i, 1);
                      return { ...d, appointments: arr, startDate: arr[0]?.date || d.startDate || null };
                    });
                  }}
                >
                  {removeLabel}
                </button>
              </div>
            ))}
            {!(edit.appointments || []).length && <div className="text-xs text-neutral-500">No appointments yet.</div>}
          </div>
          </div>
          <CycleTimersFrame lifecycle={lifecycle} theme={theme} />
        </div>

        <PairingLifecycleEditor edit={edit} setEdit={setEdit} theme={theme} onCreateClutchCard={handleCreateClutchCard} lifecycle={lifecycle} />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <label className="text-xs font-medium">{notesFieldLabel}</label>
        <textarea
          rows={2}
          className="w-full border rounded-xl px-3 py-2 text-sm"
          value={edit.notes || ''}
          onChange={e => setEdit(d => ({ ...d, notes: e.target.value }))}
        />
      </div>

      {hatchlings.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium mb-1">Hatchlings</div>
          <div className="flex flex-wrap gap-1">
            {hatchlings.map(h => (
              <button
                key={h.id}
                type="button"
                className={cx(
                  'px-2 py-0.5 text-xs rounded-full border bg-amber-50 text-amber-900',
                  onOpenSnake ? 'hover:bg-amber-100 transition-colors' : 'cursor-default opacity-80'
                )}
                onClick={onOpenSnake ? () => onOpenSnake(h) : undefined}
                title={h.name || h.id}
              >
                {h.name || h.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasGeneticsOdds && (
        <div className="mt-4">
          <div className="border rounded-xl bg-neutral-50">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-neutral-700"
              onClick={() => setShowCalculator(prev => !prev)}
              aria-expanded={showCalculator}
            >
              <span>{geneticsCalculatorLabel}</span>
              <span className="text-[11px] text-neutral-500">{showCalculator ? hideLabel : showLabel}</span>
            </button>
            {showCalculator && (
              <div className="border-t px-3 pb-3">
                <PairingGeneticsOdds male={maleSnake} female={femaleSnake} odds={geneticsOdds} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PairingGeneticsOdds({ male, female, odds: providedOdds }) {
  const odds = useMemo(() => {
    if (providedOdds) return providedOdds;
    return computePairingGenetics(male, female);
  }, [providedOdds, male, female]);
  const perGene = odds?.perGene || [];
  const combined = odds?.combined || [];
  if (!perGene.length && !combined.length) return null;
  return (
    <div className="mt-3">
      {perGene.length > 0 && (
        <>
          <div className="text-xs font-medium mb-1">Genetics odds</div>
          <div className="flex flex-col gap-2">
            {perGene.map(item => (
              <div key={item.gene} className="rounded-lg border bg-neutral-50 px-2 py-2">
                <div className="text-xs font-semibold text-neutral-700">{item.gene}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {item.outcomes.map(out => (
                    <span
                      key={`${item.gene}-${out.label}`}
                      className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px]"
                    >
                      <span className="font-semibold">{formatProbabilityPercent(out.probability)}</span>
                      <span>{out.label}</span>
                    </span>
                  ))}
                </div>
                {item.notes ? (
                  <div className="mt-1 text-[10px] text-neutral-500">
                    {item.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
      {combined.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium mb-1">Combined genetics odds</div>
          <div className="flex flex-col gap-1.5">
            {combined.map(item => {
              const breakdownItems = (item.breakdown || []).filter(detail => detail.label && detail.label !== 'Normal');
              return (
                <div key={item.key} className="rounded-lg border bg-white px-2 py-1.5 text-[11px] text-neutral-700">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-neutral-900">{formatProbabilityPercent(item.probability)}</span>
                    <span>{item.label}</span>
                  </div>
                  {breakdownItems.length ? (
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-neutral-500">
                      {breakdownItems.map(detail => (
                        <span key={`${item.key}-${detail.gene}`} className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 bg-neutral-50">
                          <span className="font-semibold text-neutral-700">{detail.gene}</span>
                          <span>{detail.label}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function computePairingGenetics(male, female) {
  if (!male || !female) return { perGene: [], combined: [] };
  const maleProfile = buildSnakeGeneProfile(male);
  const femaleProfile = buildSnakeGeneProfile(female);
  const keys = new Set([...maleProfile.keys(), ...femaleProfile.keys()]);
  const results = [];

  for (const key of keys) {
    const maleEntry = maleProfile.get(key) || null;
    const femaleEntry = femaleProfile.get(key) || null;
    const displayName = maleEntry?.displayName || femaleEntry?.displayName || '';
    if (!displayName || /^normal$/i.test(displayName)) continue;

    const inheritance = resolveGeneInheritanceType(displayName, maleEntry, femaleEntry);
    if (!inheritance) continue;

    let calculation = null;
    if (inheritance === 'Recessive') {
      calculation = calcRecessiveOutcome(displayName, maleEntry, femaleEntry);
    } else if (inheritance === 'Incomplete Dominant' || inheritance === 'Dominant') {
      calculation = calcDominantOutcome(displayName, maleEntry, femaleEntry, inheritance);
    } else {
      continue;
    }

    if (!calculation || !calculation.outcomes || !calculation.outcomes.length) continue;

    const hasMeaningfulOutcome = calculation.outcomes.some(out => out.label !== 'Normal' && out.probability > 0.0001);
    if (!hasMeaningfulOutcome) continue;

    const notesParts = [`Inheritance: ${inheritance}`];
    if (calculation.sireDescriptor) notesParts.push(`Sire: ${calculation.sireDescriptor}`);
    if (calculation.damDescriptor) notesParts.push(`Dam: ${calculation.damDescriptor}`);

    results.push({
      gene: displayName,
      inheritance,
      outcomes: calculation.outcomes,
      notes: notesParts.join(' — ')
    });
  }

  results.sort((a, b) => a.gene.localeCompare(b.gene));
  const combined = buildCombinedOutcomes(results);
  return { perGene: results, combined };
}

function buildCombinedOutcomes(perGeneResults, limit = 12, minProbability = 0.01) {
  if (!Array.isArray(perGeneResults) || !perGeneResults.length) return [];

  let combos = [{
    probability: 1,
    breakdown: [],
    labelParts: [],
    geneOutcomes: []
  }];

  perGeneResults.forEach(gene => {
    const outcomes = Array.isArray(gene.outcomes) && gene.outcomes.length
      ? gene.outcomes
      : [{ label: 'Normal', probability: 1 }];

    const nextMap = new Map();

    combos.forEach(base => {
      outcomes.forEach(outcome => {
        const prob = base.probability * (outcome.probability || 0);
        if (prob <= 0) return;
        const breakdown = [...base.breakdown, { gene: gene.gene, label: outcome.label }];
        const labelParts = outcome.label && outcome.label !== 'Normal'
          ? [...base.labelParts, outcome.label]
          : [...base.labelParts];
        const geneOutcomes = [...base.geneOutcomes, `${gene.gene}:${outcome.label}`];
        const key = geneOutcomes.join('|');
        const existing = nextMap.get(key);
        if (existing) {
          existing.probability += prob;
        } else {
          nextMap.set(key, { probability: prob, breakdown, labelParts, geneOutcomes });
        }
      });
    });

    combos = Array.from(nextMap.values());
    combos.sort((a, b) => b.probability - a.probability);
    if (combos.length > 1024) {
      combos = combos.slice(0, 1024);
    }
  });

  combos.sort((a, b) => b.probability - a.probability);

  const filtered = [];
  combos.forEach(item => {
    if (item.probability >= minProbability || filtered.length < limit) {
      filtered.push(item);
    }
  });

  return filtered.slice(0, limit).map(item => ({
    key: item.geneOutcomes.join('|'),
    label: item.labelParts.length ? item.labelParts.join(' + ') : 'Normal (all genes)',
    probability: item.probability,
    breakdown: item.breakdown
  }));
}

function buildSnakeGeneProfile(snake) {
  const profile = new Map();
  if (!snake) return profile;

  const ensureEntry = (key, displayName) => {
    if (!profile.has(key)) {
      profile.set(key, {
        key,
        displayName: displayName || '',
        group: null,
        visualCount: 0,
        superVisual: false,
        hetCount: 0,
        possibleHetProbabilities: [],
        morphTokens: [],
        hetTokens: []
      });
    }
    const entry = profile.get(key);
    if (displayName) {
      if (!entry.displayName || entry.displayName.length < displayName.length) {
        entry.displayName = displayName;
      }
      if (!entry.group || entry.group === 'Other') {
        const derivedGroup = getGeneDisplayGroup(displayName);
        if (derivedGroup) entry.group = derivedGroup;
      }
    }
    return entry;
  };

  (Array.isArray(snake.morphs) ? snake.morphs : []).forEach(token => {
    const parsed = parseVisualMorphToken(token);
    if (!parsed) return;
    const key = normalizeGeneCandidate(parsed.gene);
    if (!key) return;
    const entry = ensureEntry(key, parsed.displayName);
    entry.visualCount += 1;
    entry.superVisual = entry.superVisual || !!parsed.isSuper;
    entry.morphTokens.push(parsed.original);
  });

  (Array.isArray(snake.hets) ? snake.hets : []).forEach(token => {
    const parsed = parseHetDescriptor(token);
    if (!parsed) return;
    const key = normalizeGeneCandidate(parsed.gene);
    if (!key) return;
    const entry = ensureEntry(key, parsed.displayName);
    entry.hetTokens.push(parsed.original);
    if (parsed.isCertain) {
      entry.hetCount += 1;
    } else {
      entry.possibleHetProbabilities.push(Math.max(0, Math.min(1, parsed.probability)));
    }
    if (!entry.group || entry.group === 'Other') entry.group = 'Recessive';
  });

  return profile;
}

function parseVisualMorphToken(token) {
  if (!token) return null;
  const original = String(token).trim();
  if (!original) return null;
  let working = original;
  let isSuper = false;

  const superMatch = working.match(/^super[\s-]+(.+)$/i);
  if (superMatch && superMatch[1]) {
    isSuper = true;
    working = superMatch[1].trim();
  } else {
    const camelSuper = working.match(/^Super([A-Z].*)$/);
    if (camelSuper && camelSuper[1]) {
      isSuper = true;
      working = camelSuper[1].trim();
    }
  }

  const displayName = working.replace(/\s+/g, ' ').trim();
  if (!displayName) return null;

  return {
    gene: displayName,
    displayName,
    isSuper,
    original
  };
}

function parseHetDescriptor(token) {
  if (!token) return null;
  const original = String(token).trim();
  if (!original) return null;
  let working = original;
  let probability = 1;
  let explicitProbability = false;

  const percentMatch = working.match(/^(\d{1,3})%\s*(.+)$/i);
  if (percentMatch && percentMatch[2]) {
    explicitProbability = true;
    probability = Math.min(1, parseInt(percentMatch[1], 10) / 100);
    working = percentMatch[2].trim();
  }

  if (/^possible\s+/i.test(working)) {
    if (!explicitProbability) probability = Math.min(probability, 0.5);
    working = working.replace(/^possible\s+/i, '').trim();
  } else if (/^probable\s+/i.test(working)) {
    if (!explicitProbability) probability = Math.min(probability, 0.66);
    working = working.replace(/^probable\s+/i, '').trim();
  } else if (/^maybe\s+/i.test(working)) {
    if (!explicitProbability) probability = Math.min(probability, 0.33);
    working = working.replace(/^maybe\s+/i, '').trim();
  }

  working = working.replace(/^het\s+/i, '').trim();
  if (!working) return null;

  const displayName = working;
  const isCertain = probability >= 0.999;

  return {
    gene: working,
    displayName,
    probability,
    isCertain,
    original
  };
}

function resolveGeneInheritanceType(displayName, maleEntry, femaleEntry) {
  const candidates = [maleEntry?.group, femaleEntry?.group, getGeneDisplayGroup(displayName)].filter(Boolean);
  const prioritized = candidates.find(type => type && type !== 'Other');
  if (prioritized) return prioritized;
  const fallback = inferGeneTypeFromEntry(maleEntry) || inferGeneTypeFromEntry(femaleEntry);
  if (fallback) return fallback;
  return candidates[0] || null;
}

function inferGeneTypeFromEntry(entry) {
  if (!entry) return null;
  if ((entry.hetCount || 0) > 0 || (entry.possibleHetProbabilities || []).some(p => p > 0)) return 'Recessive';
  if (entry.superVisual) return 'Incomplete Dominant';
  if ((entry.visualCount || 0) > 0) return 'Incomplete Dominant';
  return null;
}

function getRecessiveParentStates(entry) {
  if (!entry) {
    return { descriptor: 'Normal', states: [{ genotype: 'NN', probability: 1 }] };
  }
  if ((entry.visualCount || 0) > 0) {
    return { descriptor: 'Visual', states: [{ genotype: 'rr', probability: 1 }] };
  }
  if ((entry.hetCount || 0) > 0) {
    return { descriptor: 'Het', states: [{ genotype: 'Nr', probability: 1 }] };
  }
  const possibles = (entry.possibleHetProbabilities || []).filter(p => p > 0);
  if (possibles.length) {
    const best = Math.max(...possibles);
    const clamped = Math.max(0, Math.min(1, best));
    if (clamped >= 0.999) {
      return { descriptor: 'Het (proven)', states: [{ genotype: 'Nr', probability: 1 }] };
    }
    return {
      descriptor: `${formatProbabilityPercent(clamped)} possible het`,
      states: [
        { genotype: 'Nr', probability: clamped },
        { genotype: 'NN', probability: 1 - clamped }
      ]
    };
  }
  return { descriptor: 'Normal', states: [{ genotype: 'NN', probability: 1 }] };
}

function recessiveGametes(genotype) {
  if (genotype === 'rr') return [{ allele: 'r', probability: 1 }];
  if (genotype === 'Nr' || genotype === 'rN') {
    return [
      { allele: 'r', probability: 0.5 },
      { allele: 'N', probability: 0.5 }
    ];
  }
  return [{ allele: 'N', probability: 1 }];
}

function calcRecessiveOutcome(geneName, maleEntry, femaleEntry) {
  const sire = getRecessiveParentStates(maleEntry);
  const dam = getRecessiveParentStates(femaleEntry);
  const outcomes = new Map();

  sire.states.forEach(sireState => {
    dam.states.forEach(damState => {
      const pairingWeight = sireState.probability * damState.probability;
      if (pairingWeight <= 0) return;
      const sireGametes = recessiveGametes(sireState.genotype);
      const damGametes = recessiveGametes(damState.genotype);
      sireGametes.forEach(sGamete => {
        damGametes.forEach(dGamete => {
          const prob = pairingWeight * sGamete.probability * dGamete.probability;
          if (prob <= 0) return;
          const mutatedCount = (sGamete.allele === 'r' ? 1 : 0) + (dGamete.allele === 'r' ? 1 : 0);
          const label = mutatedCount === 2 ? `Visual ${geneName}` : mutatedCount === 1 ? `Het ${geneName}` : 'Normal';
          outcomes.set(label, (outcomes.get(label) || 0) + prob);
        });
      });
    });
  });

  const outcomeList = Array.from(outcomes.entries())
    .map(([label, probability]) => ({ label, probability }))
    .filter(item => item.probability > 0.0001)
    .sort((a, b) => b.probability - a.probability);

  return {
    outcomes: outcomeList,
    sireDescriptor: sire.descriptor,
    damDescriptor: dam.descriptor
  };
}

function getDominantParentStates(entry, inheritance) {
  if (!entry) {
    return { descriptor: 'Normal', states: [{ copies: 0, probability: 1 }] };
  }
  if (entry.superVisual) {
    const descriptor = inheritance === 'Incomplete Dominant' ? 'Super visual' : 'Homozygous visual';
    return { descriptor, states: [{ copies: 2, probability: 1 }] };
  }
  if ((entry.visualCount || 0) > 0) {
    return { descriptor: 'Visual', states: [{ copies: 1, probability: 1 }] };
  }
  if ((entry.hetCount || 0) > 0) {
    return { descriptor: 'Carrier', states: [{ copies: 1, probability: 1 }] };
  }
  const possibles = (entry.possibleHetProbabilities || []).filter(p => p > 0);
  if (possibles.length) {
    const best = Math.max(...possibles);
    const clamped = Math.max(0, Math.min(1, best));
    if (clamped >= 0.999) {
      return { descriptor: 'Visual (likely homozygous)', states: [{ copies: 1, probability: 1 }] };
    }
    return {
      descriptor: `${formatProbabilityPercent(clamped)} possible carrier`,
      states: [
        { copies: 1, probability: clamped },
        { copies: 0, probability: 1 - clamped }
      ]
    };
  }
  return { descriptor: 'Normal', states: [{ copies: 0, probability: 1 }] };
}

function dominantGametes(copyCount) {
  if (copyCount >= 2) return [{ allele: 'A', probability: 1 }];
  if (copyCount >= 1) {
    return [
      { allele: 'A', probability: 0.5 },
      { allele: 'a', probability: 0.5 }
    ];
  }
  return [{ allele: 'a', probability: 1 }];
}

function calcDominantOutcome(geneName, maleEntry, femaleEntry, inheritance) {
  const sire = getDominantParentStates(maleEntry, inheritance);
  const dam = getDominantParentStates(femaleEntry, inheritance);
  const outcomes = new Map();

  sire.states.forEach(sireState => {
    dam.states.forEach(damState => {
      const pairingWeight = sireState.probability * damState.probability;
      if (pairingWeight <= 0) return;
      const sireGametes = dominantGametes(sireState.copies);
      const damGametes = dominantGametes(damState.copies);
      sireGametes.forEach(sGamete => {
        damGametes.forEach(dGamete => {
          const prob = pairingWeight * sGamete.probability * dGamete.probability;
          if (prob <= 0) return;
          const mutatedCount = (sGamete.allele === 'A' ? 1 : 0) + (dGamete.allele === 'A' ? 1 : 0);
          let label;
          if (mutatedCount === 0) {
            label = 'Normal';
          } else if (mutatedCount === 2 && inheritance === 'Incomplete Dominant') {
            label = `Super ${geneName}`;
          } else {
            label = geneName;
          }
          outcomes.set(label, (outcomes.get(label) || 0) + prob);
        });
      });
    });
  });

  const outcomeList = Array.from(outcomes.entries())
    .map(([label, probability]) => ({ label, probability }))
    .filter(item => item.probability > 0.0001)
    .sort((a, b) => b.probability - a.probability);

  return {
    outcomes: outcomeList,
    sireDescriptor: sire.descriptor,
    damDescriptor: dam.descriptor
  };
}

function formatProbabilityPercent(value) {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  if (value >= 0.9995) return '100%';
  const percent = value * 100;
  const rounded = Math.round(percent * 10) / 10;
  if (Number.isInteger(rounded)) {
    return `${rounded}%`;
  }
  return `${rounded.toFixed(1)}%`;
}

function getBreedingCycleDerived(edit = {}) {
  const ovulation = edit?.ovulation || {};
  const preLay = edit?.preLayShed || {};
  const clutch = edit?.clutch || {};
  const hatch = edit?.hatch || {};

  const ovulationObserved = !!ovulation.observed;
  const preLayObserved = !!preLay.observed;
  const clutchRecorded = !!clutch.recorded;
  const hatchedRecorded = !!hatch.recorded;

  const ovulationDate = ovulation.date || '';
  const preLayDate = preLay.date || '';
  const clutchDate = clutch.date || '';
  const hatchScheduledDate = hatch.scheduledDate || '';
  const hatchDate = hatch.date || '';

  const preLayWindowTarget = ovulationDate ? addDaysYmd(ovulationDate, 21) : null;
  const eggLayingTarget = preLayDate ? addDaysYmd(preLayDate, 30) : null;
  const hatchTarget = clutchDate ? addDaysYmd(clutchDate, 60) : null;
  const hatchCountdownTarget = hatchScheduledDate || hatchTarget;

  const eggsTotalRaw = clutch.eggsTotal;
  const fertileEggsRaw = clutch.fertileEggs;
  const clutchSlugsRaw = clutch.slugs;
  const eggsTotalNumber = typeof eggsTotalRaw === 'number' && Number.isFinite(eggsTotalRaw)
    ? Math.max(0, eggsTotalRaw)
    : null;
  const fertileEggsNumber = typeof fertileEggsRaw === 'number' && Number.isFinite(fertileEggsRaw)
    ? Math.max(0, fertileEggsRaw)
    : null;
  const clutchFertileValue = fertileEggsRaw === '' || typeof fertileEggsRaw === 'undefined'
    ? ''
    : String(fertileEggsRaw);
  const clutchSlugsValue = clutchSlugsRaw === '' || typeof clutchSlugsRaw === 'undefined'
    ? ''
    : String(clutchSlugsRaw);
  const clutchTotalValue = eggsTotalRaw === '' || typeof eggsTotalRaw === 'undefined'
    ? ''
    : String(eggsTotalRaw);

  const ovulationCountdownActive = ovulationObserved && !preLayObserved;
  const preLayCountdownActive = preLayObserved && !clutchRecorded;
  const clutchCountdownActive = clutchRecorded && !hatchedRecorded;
  const showPreLayCountdown = ovulationCountdownActive && preLayWindowTarget;
  const showEggCountdown = preLayCountdownActive && eggLayingTarget;
  const showHatchCountdown = clutchCountdownActive && hatchTarget;
  const showScheduledCountdown = !clutchCountdownActive && hatchCountdownTarget && !hatchedRecorded && eggsTotalNumber !== 0;

  const timerQueue = [
    showPreLayCountdown ? { key: 'preLay', label: 'Pre-Lay ETA', targetDate: preLayWindowTarget, totalDays: 21 } : null,
    showEggCountdown ? { key: 'eggLay', label: 'Egg Lay ETA', targetDate: eggLayingTarget, totalDays: 30 } : null,
    showHatchCountdown ? { key: 'hatch', label: 'Hatch ETA', targetDate: hatchTarget, totalDays: 60 } : null,
    showScheduledCountdown ? { key: 'scheduled', label: 'Scheduled Hatch', targetDate: hatchCountdownTarget, totalDays: null } : null,
  ].filter(Boolean);

  const activeTimer = timerQueue.length ? timerQueue[0] : null;

  return {
    ovulationObserved,
    preLayObserved,
    clutchRecorded,
    hatchedRecorded,
    ovulationDate,
    preLayDate,
    clutchDate,
    hatchScheduledDate,
    preLayWindowTarget,
    eggLayingTarget,
    hatchTarget,
    hatchCountdownTarget,
  hatchDate,
    eggsTotalNumber,
    fertileEggsNumber,
    clutchFertileValue,
    clutchTotalValue,
    clutchSlugsValue,
    timerQueue,
    activeTimer,
    hasActiveTimers: timerQueue.length > 0,
  };
}

function isPairingCompleted(pairing) {
  if (!pairing) return false;
  const normalized = withPairingLifecycleDefaults({ ...pairing });
  const derived = getBreedingCycleDerived(normalized);
  return !!derived.hatchedRecorded;
}

function computeBreedingCycleYear({ clutchDate, preLayDate, ovulationDate, hatchDate, startDate }) {
  const candidates = [clutchDate, preLayDate, ovulationDate, hatchDate, startDate];
  for (const value of candidates) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return String(new Date(timestamp).getFullYear());
    }
    const match = String(value).match(/^(\d{4})/);
    if (match) return match[1];
  }
  return 'Unknown';
}

function diffCalendarDays(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const from = parseYmd(localYMD(fromDate instanceof Date ? fromDate : new Date(fromDate)));
  const to = parseYmd(String(toDate).slice(0, 10));
  if (!from || !to) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / dayMs);
}

function describeDaysUntil(days) {
  if (typeof days !== 'number' || !Number.isFinite(days)) return '';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}

function getDashboardUrgency(days, hasTarget) {
  if (!hasTarget || typeof days !== 'number' || !Number.isFinite(days)) return 'none';
  if (days < 0) return 'overdue';
  if (days <= 3) return 'due';
  if (days <= 7) return 'soon';
  return 'upcoming';
}

function buildPairingDashboardItem(pairing, snakes = [], today = new Date()) {
  if (!pairing) return null;
  const normalized = withPairingLifecycleDefaults({ ...pairing });
  const derived = getBreedingCycleDerived(normalized);
  const female = snakeById(snakes, normalized.femaleId);
  const male = snakeById(snakes, normalized.maleId);
  const locks = (normalized.appointments || [])
    .filter(ap => ap && ap.lockObserved && (ap.lockDate || ap.lockLoggedAt || ap.date))
    .map(ap => getLockRecordedDate(ap) || ap.date || '')
    .filter(Boolean)
    .sort();
  const latestLockDate = locks.length ? locks[locks.length - 1] : '';

  let stage = 'Pairing active';
  let stageKey = 'active';
  let nextStage = 'Watch for lock or ovulation';
  let targetDate = '';
  let actionLabel = 'Open details';

  if (derived.hatchedRecorded) {
    stage = 'Hatched';
    stageKey = 'hatched';
    nextStage = 'Cycle complete';
    targetDate = derived.hatchDate || '';
  } else if (derived.clutchRecorded) {
    const eggsRaw = normalized?.clutch?.eggsTotal;
    const fertileRaw = normalized?.clutch?.fertileEggs;
    const eggsCount = Number.isFinite(Number(eggsRaw))
      ? Number(eggsRaw)
      : (Number.isFinite(Number(fertileRaw)) ? Number(fertileRaw) : null);
    stage = typeof eggsCount === 'number'
      ? `Clutch laid - ${eggsCount} ${eggsCount === 1 ? 'egg' : 'eggs'}`
      : 'Clutch laid';
    stageKey = 'clutch';
    nextStage = 'Expected hatch';
    targetDate = derived.hatchTarget || '';
    actionLabel = 'Log hatch';
  } else if (derived.preLayObserved) {
    stage = 'Pre-lay shed';
    stageKey = 'preLay';
    nextStage = 'Expected egg laying';
    targetDate = derived.eggLayingTarget || '';
    actionLabel = 'Log clutch';
  } else if (derived.ovulationObserved) {
    stage = 'Ovulation';
    stageKey = 'ovulation';
    nextStage = 'Expected pre-lay shed';
    targetDate = derived.preLayWindowTarget || '';
    actionLabel = 'Log pre-lay shed';
  } else if (latestLockDate) {
    stage = 'Locks observed';
    stageKey = 'locks';
    nextStage = 'Watch for ovulation';
    actionLabel = 'Log ovulation';
  }

  const daysUntil = targetDate ? diffCalendarDays(today, targetDate) : null;
  const urgency = getDashboardUrgency(daysUntil, !!targetDate);
  const cycleYear = computeBreedingCycleYear({
    clutchDate: derived.clutchDate,
    preLayDate: derived.preLayDate,
    ovulationDate: derived.ovulationDate,
    hatchDate: derived.hatchDate,
    startDate: normalized.startDate || '',
  });

  return {
    id: normalized.id,
    pairing: normalized,
    label: resolvePairingLabel(normalized, female, male),
    female,
    male,
    femaleName: female?.name || normalized.femaleId || 'Female',
    maleName: male?.name || normalized.maleId || 'Male',
    stage,
    stageKey,
    nextStage,
    targetDate,
    targetLabel: targetDate ? formatDateForDisplay(targetDate) : '',
    daysUntil,
    countdownLabel: targetDate ? describeDaysUntil(daysUntil) : 'No target date yet',
    urgency,
    actionLabel,
    latestLockLabel: latestLockDate ? formatDateForDisplay(latestLockDate) : '',
    cycleYear,
  };
}

function summarizePairingCycleForFemale(pairing) {
  if (!pairing) return null;
  const normalized = withPairingLifecycleDefaults({ ...pairing });
  const derived = getBreedingCycleDerived(normalized);

  const locks = (normalized.appointments || [])
    .filter(ap => ap && ap.lockObserved && (ap.lockDate || ap.lockLoggedAt || ap.date))
    .map(ap => {
      const recordedAt = getLockRecordedDate(ap) || '';
      const timestamp = Date.parse(recordedAt);
      const display = formatDateForDisplay(recordedAt) || formatDateTimeForDisplay(recordedAt) || formatDateForDisplay(ap.date) || '';
      return {
        iso: recordedAt,
        display,
        notes: ap.notes ? String(ap.notes).trim() : '',
        timestamp: Number.isNaN(timestamp) ? null : timestamp,
      };
    })
    .filter(entry => entry.iso)
    .sort((a, b) => {
      const aTs = typeof a.timestamp === 'number' ? a.timestamp : Infinity;
      const bTs = typeof b.timestamp === 'number' ? b.timestamp : Infinity;
      return aTs - bTs;
    })
    .map(({ timestamp, ...rest }) => rest);

  const ovulationDate = derived.ovulationDate || '';
  const preLayDate = derived.preLayDate || '';
  const clutchDate = derived.clutchDate || '';
  const hatchDate = derived.hatchDate || '';

  const hasEvents = locks.length || ovulationDate || preLayDate || clutchDate || hatchDate;
  if (!hasEvents) return null;

  const year = computeBreedingCycleYear({ clutchDate, preLayDate, ovulationDate, hatchDate, startDate: normalized.startDate || '' });
  const primaryDate = clutchDate || preLayDate || ovulationDate || hatchDate || normalized.startDate || '';
  const primaryTimestamp = primaryDate && !Number.isNaN(Date.parse(primaryDate)) ? Date.parse(primaryDate) : null;

  const label = normalized.label || `${normalized.femaleId || 'Female'} × ${normalized.maleId || 'Male'}`;

  return {
    id: normalized.id || `${normalized.femaleId || 'female'}-${normalized.maleId || 'male'}-${year}`,
    label,
    year,
    startDate: normalized.startDate || '',
    locks,
    ovulationDate,
    preLayDate,
    clutchDate,
    hatchDate,
    sortValue: primaryTimestamp,
  };
}

function getFemaleBreedingCyclesByYear(femaleId, pairings = []) {
  if (!femaleId || !Array.isArray(pairings) || !pairings.length) return [];

  const cycles = pairings
    .filter(p => p && p.femaleId === femaleId)
    .map(summarizePairingCycleForFemale)
    .filter(Boolean);

  if (!cycles.length) return [];

  const grouped = new Map();
  cycles.forEach(cycle => {
    const key = cycle.year || 'Unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(cycle);
  });

  const parseYear = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : -Infinity;
  };

  return Array.from(grouped.entries())
    .sort((a, b) => {
      const yearDiff = parseYear(b[0]) - parseYear(a[0]);
      if (yearDiff !== 0) return yearDiff;
      return String(b[0]).localeCompare(String(a[0]));
    })
    .map(([year, items]) => {
      const sortedCycles = items
        .slice()
        .sort((a, b) => {
          const aVal = typeof a.sortValue === 'number' ? a.sortValue : -Infinity;
          const bVal = typeof b.sortValue === 'number' ? b.sortValue : -Infinity;
          return bVal - aVal;
        })
        .map(({ sortValue, ...rest }) => rest);
      return { year, cycles: sortedCycles };
    });
}

function PairingLifecycleEditor({ edit, setEdit, theme = 'blue', onCreateClutchCard, lifecycle }) {
  const { t } = useTranslation();
  const [activeDialog, setActiveDialog] = useState(null);
  const [ovulationDraft, setOvulationDraft] = useState({ date: '', notes: '' });
  const [preLayDraft, setPreLayDraft] = useState({ date: '', notes: '' });
  const [clutchDraft, setClutchDraft] = useState({ fertileEggs: '', slugs: '' });
  const [hatchedDraft, setHatchedDraft] = useState({ date: '', hatchedCount: '', notes: '' });

  const breedingCycleLabel = t('clutch.breedingCycle', { defaultValue: 'BREEDING CYCLE' });
  const breedingCycleHelper = t('clutch.trackShedsClutchesHatch', { defaultValue: 'Track sheds, clutches, and hatch' });
  const ovulationLabel = t('clutch.ovulation', { defaultValue: 'OVULATION' });
  const logOvulationLabel = t('clutch.logOvulation', { defaultValue: 'Log ovulation' });
  const preLayLabel = t('clutch.preLayShed', { defaultValue: 'PRE-LAY SHED' });
  const logPreLayLabel = t('clutch.logPreLayShed', { defaultValue: 'Log pre-lay shed' });
  const clutchHatchLabel = t('clutch.clutchHatch', { defaultValue: 'CLUTCH & HATCH' });
  const noEggLaidRecordedLabel = t('clutch.noEggLaidRecorded', { defaultValue: 'No egg laid recorded' });
  const eggLayingDateLabel = t('clutch.eggLayingDate', { defaultValue: 'EGG LAYING DATE' });
  const eggLayingPlaceholder = t('clutch.eggLayingDatePlaceholder', { defaultValue: 'dd / mm / yyyy' });
  const fertileEggsLabel = t('clutch.fertileEggs', { defaultValue: 'NUMBER OF FERTILE EGGS' });
  const slugsLabel = t('clutch.slugs', { defaultValue: 'NUMBER OF SLUGS' });
  const noEggLaidYetLabel = t('clutch.noEggLaidYet', { defaultValue: 'No egg laid yet' });
  const expectedOnLabel = t('clutch.expectedOn', { defaultValue: 'Expected on' });
  const eggsLaidLabel = t('clutch.eggsLaid', { defaultValue: 'Eggs laid' });
  const hatchedLabel = t('clutch.hatched', { defaultValue: 'HATCHED' });
  const notYetLabel = t('clutch.notYet', { defaultValue: 'Not yet' });
  const notesFieldLabel = t('clutch.notesField', { defaultValue: 'Notes' });
  const missingValueLabel = '\u2014';

  const derived = lifecycle || getBreedingCycleDerived(edit);
  const {
    ovulationObserved,
    preLayObserved,
    clutchRecorded,
    hatchedRecorded,
    ovulationDate,
    preLayDate,
    clutchDate,
    preLayWindowTarget,
    eggLayingTarget,
    hatchTarget,
    eggsTotalNumber,
    fertileEggsNumber,
    clutchFertileValue,
    clutchSlugsValue,
  } = derived;

  const totalEggsDisplay = useMemo(() => {
    if (typeof eggsTotalNumber === 'number') return eggsTotalNumber;
    const fertileCount = typeof fertileEggsNumber === 'number'
      ? fertileEggsNumber
      : (() => {
          if (clutchFertileValue === '' || typeof clutchFertileValue === 'undefined') return null;
          const parsed = Number(clutchFertileValue);
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
        })();
    const slugCount = (() => {
      if (clutchSlugsValue === '' || typeof clutchSlugsValue === 'undefined') return null;
      const parsed = Number(clutchSlugsValue);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    })();
    if (fertileCount === null && slugCount === null) return null;
    return Math.max(0, (fertileCount ?? 0)) + Math.max(0, (slugCount ?? 0));
  }, [eggsTotalNumber, fertileEggsNumber, clutchFertileValue, clutchSlugsValue]);

  const totalEggsText = useMemo(() => {
    return t('clutch.totalEggs', {
      defaultValue: 'Total eggs laid: {{count}} (fertile + slugs)',
      count: typeof totalEggsDisplay === 'number' ? String(totalEggsDisplay) : missingValueLabel,
    });
  }, [missingValueLabel, t, totalEggsDisplay]);

  const hatchLimitForUi = typeof fertileEggsNumber === 'number'
    ? fertileEggsNumber
    : (typeof eggsTotalNumber === 'number' ? eggsTotalNumber : null);

  const hatchLimitLabel = typeof fertileEggsNumber === 'number' ? fertileEggsLabel : eggsLaidLabel;

  const canGenerateClutchCard = typeof onCreateClutchCard === 'function' && clutchRecorded && !!clutchDate;

  useEffect(() => {
    if (activeDialog === 'ovulation') {
      setOvulationDraft({
        date: edit?.ovulation?.date || localYMD(new Date()),
        notes: edit?.ovulation?.notes || '',
      });
    }
  }, [activeDialog, edit?.ovulation?.date, edit?.ovulation?.notes]);

  useEffect(() => {
    if (activeDialog === 'preLay') {
      setPreLayDraft({
        date: edit?.preLayShed?.date || localYMD(new Date()),
        notes: edit?.preLayShed?.notes || '',
      });
    }
  }, [activeDialog, edit?.preLayShed?.date, edit?.preLayShed?.notes]);

  useEffect(() => {
    if (activeDialog === 'clutch') {
      setClutchDraft({
        fertileEggs: clutchFertileValue === '' ? '' : clutchFertileValue,
        slugs: clutchSlugsValue === '' ? '0' : clutchSlugsValue,
      });
    }
  }, [activeDialog, clutchFertileValue, clutchSlugsValue]);

  useEffect(() => {
    if (activeDialog === 'hatched') {
      setHatchedDraft({
        date: edit?.hatch?.date || localYMD(new Date()),
        hatchedCount: edit?.hatch?.hatchedCount ? String(edit.hatch.hatchedCount) : '',
        notes: edit?.hatch?.notes || '',
      });
    }
  }, [activeDialog, edit?.hatch]);


  const toggleClutch = useCallback((checked) => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      if (checked) {
        next.clutch.recorded = true;
        next.clutch.date = next.clutch.date || localYMD(new Date());
        if (!next.hatch.scheduledDate && next.clutch.date) {
          next.hatch.scheduledDate = addDaysYmd(next.clutch.date, 60);
        }
      } else {
        const defaults = pairingLifecycleDefaults();
        next.clutch = { ...defaults.clutch };
        next.hatch = { ...defaults.hatch };
      }
      return next;
    });
  }, [setEdit]);

  const updateClutchField = useCallback((field, rawValue) => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      next.clutch.recorded = true;
      if (field === 'date') {
        const dateValue = rawValue || '';
        next.clutch.date = dateValue;
        if (!next.hatch.scheduledDate && dateValue) {
          next.hatch.scheduledDate = addDaysYmd(dateValue, 60);
        }
      } else if (field === 'fertileEggs' || field === 'slugs') {
        const inputValue = rawValue ?? '';
        if (inputValue === '') {
          next.clutch[field] = '';
        } else {
          const parsed = Number(inputValue);
          next.clutch[field] = Number.isFinite(parsed) ? Math.max(0, parsed) : next.clutch[field];
        }
        const fertileValue = typeof next.clutch.fertileEggs === 'number' && Number.isFinite(next.clutch.fertileEggs)
          ? Math.max(0, next.clutch.fertileEggs)
          : null;
        const slugValue = typeof next.clutch.slugs === 'number' && Number.isFinite(next.clutch.slugs)
          ? Math.max(0, next.clutch.slugs)
          : null;
        if (fertileValue === null && slugValue === null) {
          next.clutch.eggsTotal = '';
        } else {
          const total = Math.max(0, fertileValue ?? 0) + Math.max(0, slugValue ?? 0);
          next.clutch.eggsTotal = total;
        }
      } else if (field === 'notes') {
        next.clutch.notes = rawValue || '';
      }
      return next;
    });
  }, [setEdit]);

  const clearHatched = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      next.hatch = { ...pairingLifecycleDefaults().hatch };
      return next;
    });
  }, [setEdit]);

  const openHatchedDialog = useCallback(() => {
    setActiveDialog('hatched');
  }, [setActiveDialog]);

  const saveClutchDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      let fertileValue = Number(clutchDraft.fertileEggs);
      if (!Number.isFinite(fertileValue) || fertileValue < 0) fertileValue = 0;
      let slugsValue = clutchDraft.slugs === '' ? 0 : Number(clutchDraft.slugs);
      if (!Number.isFinite(slugsValue) || slugsValue < 0) slugsValue = 0;
      next.clutch.recorded = true;
      next.clutch.date = next.clutch.date || localYMD(new Date());
      next.clutch.fertileEggs = fertileValue;
      next.clutch.slugs = slugsValue;
      next.clutch.eggsTotal = fertileValue + slugsValue;
      if (!next.hatch.scheduledDate && next.clutch.date) {
        next.hatch.scheduledDate = addDaysYmd(next.clutch.date, 60);
      }
      return next;
    });
    setActiveDialog(null);
  }, [clutchDraft, setEdit, setActiveDialog]);


  const saveOvulationDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      next.ovulation.observed = true;
      next.ovulation.date = ovulationDraft.date || '';
      next.ovulation.notes = ovulationDraft.notes || '';
      if (next.ovulation.date) {
        next.appointments = trimAppointmentsAfterOvulation(next.appointments || [], next.ovulation.date);
      }
      if (next.preLayShed.observed && next.preLayShed.date) {
        const delta = diffInDays(next.ovulation.date, next.preLayShed.date);
        next.preLayShed.intervalFromOvulation = Number.isFinite(delta) ? delta : null;
      }
      return next;
    });
    setActiveDialog(null);
  }, [ovulationDraft, setEdit, setActiveDialog]);

  const savePreLayDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      next.preLayShed.observed = true;
      next.preLayShed.date = preLayDraft.date || '';
      next.preLayShed.notes = preLayDraft.notes || '';
      const delta = next.ovulation.observed && next.ovulation.date && preLayDraft.date
        ? diffInDays(next.ovulation.date, preLayDraft.date)
        : null;
      next.preLayShed.intervalFromOvulation = Number.isFinite(delta) ? delta : null;
      return next;
    });
    setActiveDialog(null);
  }, [preLayDraft, setEdit, setActiveDialog]);

  const clutchModalConfirmDisabled = useMemo(() => {
    const eggsRaw = clutchDraft.fertileEggs;
    if (eggsRaw === '') return true;
    const eggsValue = Number(eggsRaw);
    if (!Number.isFinite(eggsValue) || eggsValue < 0) return true;
    if (clutchDraft.slugs === '') return false;
    const slugsValue = Number(clutchDraft.slugs);
    if (!Number.isFinite(slugsValue) || slugsValue < 0) return true;
    return false;
  }, [clutchDraft]);

  const clutchDraftTotal = useMemo(() => {
    const fertileRaw = clutchDraft.fertileEggs;
    const slugRaw = clutchDraft.slugs;
    const hasFertile = fertileRaw !== '' && Number.isFinite(Number(fertileRaw));
    const hasSlugs = slugRaw !== '' && Number.isFinite(Number(slugRaw));
    if (!hasFertile && !hasSlugs) return null;
    const fertileCount = hasFertile ? Math.max(0, Number(fertileRaw)) : 0;
    const slugCount = hasSlugs ? Math.max(0, Number(slugRaw)) : 0;
    return fertileCount + slugCount;
  }, [clutchDraft]);

  const saveHatchedDraft = useCallback(() => {
    setEdit(prev => {
      const next = withPairingLifecycleDefaults({ ...prev });
      let safeCount = hatchedDraft.hatchedCount === '' ? 0 : Number(hatchedDraft.hatchedCount);
      if (!Number.isFinite(safeCount) || safeCount < 0) safeCount = 0;
      const hatchLimit = typeof next.clutch.fertileEggs === 'number' && Number.isFinite(next.clutch.fertileEggs)
        ? Math.max(0, next.clutch.fertileEggs)
        : (typeof next.clutch.eggsTotal === 'number' && Number.isFinite(next.clutch.eggsTotal)
          ? Math.max(0, next.clutch.eggsTotal)
          : null);
      if (typeof hatchLimit === 'number') {
        safeCount = Math.min(safeCount, hatchLimit);
      }
      next.hatch = {
        ...next.hatch,
        recorded: true,
        date: hatchedDraft.date,
        hatchedCount: safeCount,
        notes: hatchedDraft.notes || '',
      };
      return next;
    });
    setActiveDialog(null);
  }, [hatchedDraft, setEdit]);

  const tileClass = "rounded-xl border border-neutral-200 bg-white p-2 flex flex-col gap-2 text-[11px] min-w-0 overflow-hidden";

  return (
    <>
      <div className="border rounded-2xl bg-white shadow-sm p-3 flex flex-col gap-3 h-full max-h-[60vh] min-h-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{breedingCycleLabel}</div>
          <div className="text-[12px] text-neutral-500">{breedingCycleHelper}</div>
        </div>
        <div className="flex flex-col gap-2.5 min-w-0 overflow-auto pr-1">
          <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-2.5 lg:items-stretch">
            <div className={cx(tileClass, 'flex-1 lg:h-full')}>
              <div className="flex-1 text-center space-y-1">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">{ovulationLabel}</div>
                <div className="text-neutral-700 text-[13px]">
                  {ovulationDate ? formatDateForDisplay(ovulationDate) : missingValueLabel}
                </div>
                {ovulationObserved && edit?.ovulation?.notes ? (
                  <div className="text-[11px] text-neutral-500 leading-snug max-h-12 overflow-hidden mx-auto">
                    {edit.ovulation.notes}
                  </div>
                ) : null}
                {ovulationObserved && preLayWindowTarget && (
                  <div className="text-[11px] text-neutral-500">Pre-lay window {formatDateForDisplay(preLayWindowTarget)}</div>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>setActiveDialog('ovulation')}>
                  {ovulationObserved ? 'Edit details' : logOvulationLabel}
                </button>
                {ovulationObserved && (
                  <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>{
                    setEdit(prev => {
                      const next = withPairingLifecycleDefaults({ ...prev });
                      next.ovulation = { observed: false, date: '', notes: '' };
                      next.preLayShed = { ...pairingLifecycleDefaults().preLayShed };
                      return next;
                    });
                  }}>Clear</button>
                )}
              </div>
            </div>
            <div className={cx(tileClass, 'flex-1 lg:h-full')}>
              <div className="flex-1 text-center space-y-1">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">{preLayLabel}</div>
                <div className="text-neutral-700 text-[13px]">
                  {preLayDate ? formatDateForDisplay(preLayDate) : missingValueLabel}
                </div>
                {preLayObserved && Number.isFinite(edit?.preLayShed?.intervalFromOvulation) && (
                  <div className="text-[11px] text-neutral-500">
                    {edit.preLayShed.intervalFromOvulation} days after ovulation
                  </div>
                )}
                {preLayObserved && edit?.preLayShed?.notes ? (
                  <div className="text-[11px] text-neutral-500 leading-snug max-h-12 overflow-hidden mx-auto">
                    {edit.preLayShed.notes}
                  </div>
                ) : null}
                {preLayObserved && eggLayingTarget && (
                  <div className="text-[11px] text-neutral-500">Egg window {formatDateForDisplay(eggLayingTarget)}</div>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>setActiveDialog('preLay')} disabled={!ovulationObserved}>
                  {preLayObserved ? 'Edit details' : logPreLayLabel}
                </button>
                {preLayObserved && (
                  <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>{
                    setEdit(prev => {
                      const next = withPairingLifecycleDefaults({ ...prev });
                      next.preLayShed = { ...pairingLifecycleDefaults().preLayShed };
                      return next;
                    });
                  }}>Clear</button>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-center">
            <div className={cx(tileClass, 'w-full lg:max-w-xl')}>
              <div className="space-y-0.5">
                <div className="font-semibold uppercase tracking-wide text-neutral-500">{clutchHatchLabel}</div>
                <div className="text-neutral-700 text-[13px]">
                  {clutchRecorded && clutchDate ? `${eggsLaidLabel} ${formatDateForDisplay(clutchDate)}` : noEggLaidRecordedLabel}
                </div>
              </div>

              <div className="mt-3 w-full text-left space-y-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{eggLayingDateLabel}</label>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-xl px-3 py-2 text-xs"
                    value={clutchDate}
                    onChange={e=>updateClutchField('date', e.target.value)}
                    disabled={!clutchRecorded}
                    placeholder={eggLayingPlaceholder}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{fertileEggsLabel}</label>
                    <input
                      type="number"
                      min="0"
                      className="mt-1 w-full border rounded-xl px-3 py-2 text-xs"
                      value={clutchFertileValue}
                      onChange={e=>updateClutchField('fertileEggs', e.target.value)}
                      disabled={!clutchRecorded}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{slugsLabel}</label>
                    <input
                      type="number"
                      min="0"
                      className="mt-1 w-full border rounded-xl px-3 py-2 text-xs"
                      value={clutchSlugsValue}
                      onChange={e=>updateClutchField('slugs', e.target.value)}
                      disabled={!clutchRecorded}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 items-center text-xs text-neutral-600">
                <div className="text-[11px] text-neutral-500">
                  {clutchRecorded ? eggsLaidLabel : noEggLaidYetLabel}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                  <span>{expectedOnLabel}</span>
                  <span className="text-neutral-700 font-medium">
                    {hatchTarget ? formatDateForDisplay(hatchTarget) : missingValueLabel}
                  </span>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {!clutchRecorded && (
                    <button className="text-[11px] px-2.5 py-1 border rounded-lg" onClick={()=>setActiveDialog('clutch')}>
                      {eggsLaidLabel}
                    </button>
                  )}
                  {clutchRecorded && (
                    <>
                      <button
                        className="text-[11px] px-2.5 py-1 border rounded-lg"
                        onClick={() => onCreateClutchCard?.()}
                        disabled={!canGenerateClutchCard}
                      >
                        Create clutch card
                      </button>
                      {!hatchedRecorded && (
                        <button
                          className="text-[11px] px-2.5 py-1 border rounded-lg"
                          onClick={openHatchedDialog}
                        >
                          Eggs hatched
                        </button>
                      )}
                      <button
                        className="text-[11px] px-2.5 py-1 border rounded-lg text-rose-600 border-rose-300"
                        onClick={() => toggleClutch(false)}
                      >
                        Clear egg record
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 mt-2 flex items-start justify-between gap-3 w-full">
                <div className="space-y-1 text-left">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{hatchedLabel}</div>
                  <div className="text-[13px] text-neutral-700">
                    {hatchedRecorded && edit?.hatch?.date ? `${hatchedLabel} ${formatDateForDisplay(edit.hatch.date)}` : notYetLabel}
                  </div>
                  {hatchedRecorded && (
                    <div className="text-[11px] text-neutral-500 space-y-1">
                      <div>Hatched count: {edit?.hatch?.hatchedCount || 0}</div>
                      {edit?.hatch?.notes ? <div>{notesFieldLabel}: {edit.hatch.notes}</div> : null}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {hatchedRecorded && (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        className="text-[11px] px-2.5 py-1 border rounded-lg"
                        onClick={openHatchedDialog}
                      >
                        View / edit hatch
                      </button>
                      <button
                        className="text-[11px] px-2.5 py-1 border rounded-lg text-rose-600 border-rose-300"
                        onClick={clearHatched}
                      >
                        Clear hatch record
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-neutral-500">
                {totalEggsText}
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeDialog === 'ovulation' && (
        <FloatingDialog
          title="Ovulation details"
          theme={theme}
          onClose={() => setActiveDialog(null)}
          onConfirm={saveOvulationDraft}
          disableConfirm={!ovulationDraft.date}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Ovulation date</label>
              <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2" value={ovulationDraft.date} onChange={e=>setOvulationDraft(d=>({...d, date:e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium">{notesFieldLabel}</label>
              <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2" value={ovulationDraft.notes} onChange={e=>setOvulationDraft(d=>({...d, notes:e.target.value}))} />
            </div>
          </div>
        </FloatingDialog>
      )}

      {activeDialog === 'preLay' && (
        <FloatingDialog
          title="Pre-Lay shed details"
          theme={theme}
          onClose={() => setActiveDialog(null)}
          onConfirm={savePreLayDraft}
          disableConfirm={!preLayDraft.date}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Pre-Lay shed date</label>
              <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2" value={preLayDraft.date} onChange={e=>setPreLayDraft(d=>({...d, date:e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium">{notesFieldLabel}</label>
              <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2" value={preLayDraft.notes} onChange={e=>setPreLayDraft(d=>({...d, notes:e.target.value}))} />
            </div>
          </div>
        </FloatingDialog>
      )}

      {activeDialog === 'clutch' && (
        <FloatingDialog
          title="Log eggs laid"
          theme={theme}
          onClose={() => setActiveDialog(null)}
          onConfirm={saveClutchDraft}
          disableConfirm={clutchModalConfirmDisabled}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">{fertileEggsLabel}</label>
              <input
                type="number"
                min="0"
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={clutchDraft.fertileEggs}
                onChange={e=>{
                  const raw = e.target.value;
                  if (raw === '') {
                    setClutchDraft(d=>({ ...d, fertileEggs: '' }));
                    return;
                  }
                  let parsed = Number(raw);
                  if (!Number.isFinite(parsed)) return;
                  if (parsed < 0) parsed = 0;
                  setClutchDraft(d=>({ ...d, fertileEggs: String(parsed) }));
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{slugsLabel}</label>
              <input
                type="number"
                min="0"
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={clutchDraft.slugs}
                onChange={e=>{
                  const raw = e.target.value;
                  if (raw === '') {
                    setClutchDraft(d=>({ ...d, slugs: '' }));
                    return;
                  }
                  let parsed = Number(raw);
                  if (!Number.isFinite(parsed)) return;
                  if (parsed < 0) parsed = 0;
                  setClutchDraft(d=>({ ...d, slugs: String(parsed) }));
                }}
              />
              <div className="mt-1 text-[11px] text-neutral-500">
                Total eggs laid will be saved as fertile eggs + slugs{typeof clutchDraftTotal === 'number' ? ` = ${clutchDraftTotal}` : ''}.
              </div>
            </div>
          </div>
        </FloatingDialog>
      )}

      {activeDialog === 'hatched' && (
        <FloatingDialog
          title="Hatch details"
          theme={theme}
          onClose={() => setActiveDialog(null)}
          onConfirm={saveHatchedDraft}
          disableConfirm={!hatchedDraft.date}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Hatch date</label>
              <input type="date" className="mt-1 w-full border rounded-xl px-3 py-2" value={hatchedDraft.date} onChange={e=>setHatchedDraft(d=>({...d, date:e.target.value}))} />
            </div>
            <div>
              <label className="text-xs font-medium">Number hatched</label>
              <input
                type="number"
                min="0"
                max={hatchLimitForUi ?? undefined}
                className="mt-1 w-full border rounded-xl px-3 py-2"
                value={hatchedDraft.hatchedCount}
                onChange={e=>{
                  const raw = e.target.value;
                  if (raw === '') {
                    setHatchedDraft(d=>({ ...d, hatchedCount: '' }));
                    return;
                  }
                  let parsed = Number(raw);
                  if (!Number.isFinite(parsed) || parsed < 0) parsed = 0;
                  if (hatchLimitForUi !== null && parsed > hatchLimitForUi) parsed = hatchLimitForUi;
                  setHatchedDraft(d=>({ ...d, hatchedCount: String(parsed) }));
                }}
              />
              {hatchLimitForUi !== null && (
                <div className="mt-1 text-[11px] text-neutral-500">Maximum allowed: {hatchLimitForUi} ({hatchLimitLabel})</div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium">{notesFieldLabel}</label>
              <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2" value={hatchedDraft.notes} onChange={e=>setHatchedDraft(d=>({...d, notes:e.target.value}))} />
            </div>
          </div>
        </FloatingDialog>
      )}
    </>
  );
}

function CycleTimersFrame({ lifecycle, theme = 'blue', className }) {
  const timerQueue = lifecycle?.timerQueue || [];
  const hasTimers = timerQueue.length > 0;
  const [now, setNow] = useState(new Date());
  const isCycleComplete = !!lifecycle?.hatchedRecorded;
  const hatchDate = lifecycle?.hatchDate || '';
  const hasLifecycleData = Boolean(
    lifecycle && (
      lifecycle.ovulationObserved ||
      lifecycle.preLayObserved ||
      lifecycle.clutchRecorded ||
      lifecycle.hatchedRecorded ||
      lifecycle.ovulationDate ||
      lifecycle.preLayDate ||
      lifecycle.clutchDate
    )
  );

  useEffect(() => {
    if (hasTimers || isCycleComplete) return undefined;
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, [hasTimers, isCycleComplete]);

  if (!hasTimers && !hasLifecycleData) {
    return null;
  }

  if (isCycleComplete) {
    return (
      <div className={cx("border rounded-2xl bg-white shadow-sm p-4 sm:p-5 flex flex-col gap-4", className)}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cycle timers</div>
            <div className="text-sm text-neutral-600">Breeding cycle status</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm text-neutral-600">
          <div className="font-medium text-neutral-700">This breeding cycle is over.</div>
          {hatchDate ? (
            <div className="text-xs text-neutral-500">Hatched on {formatDateForDisplay(hatchDate)}</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cx("border rounded-2xl bg-white shadow-sm p-4 sm:p-5 flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cycle timers</div>
          <div className="text-sm text-neutral-600">Upcoming breeding milestones</div>
        </div>
        {hasTimers && (
          <div className="text-xs text-neutral-500">{timerQueue.length} active</div>
        )}
      </div>
      {hasTimers ? (
        <div className="flex flex-col gap-3">
          {timerQueue.map(timer => (
            <CountdownBadge
              key={timer.key}
              label={timer.label}
              targetDate={timer.targetDate}
              totalDays={typeof timer.totalDays === 'number' ? timer.totalDays : null}
              theme={theme}
              size="lg"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm text-neutral-600">
          <div>No active timers yet. Log ovulation, pre-lay, or clutch events to start tracking milestones.</div>
          <div className="text-xs font-medium text-neutral-500">Current time: {formatDateTimeForDisplay(now)}</div>
        </div>
      )}
    </div>
  );
}

function FloatingDialog({ title, onClose, onConfirm, children, theme = 'blue', confirmLabel = 'Save', disableConfirm = false }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border p-5" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{title}</div>
          <button className="text-sm px-2 py-1" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
          {children}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-2 rounded-xl text-sm border" onClick={onClose}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme, true))} onClick={onConfirm} disabled={disableConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function CountdownBadge({ label, targetDate, totalDays = null, theme = 'blue', size = 'sm' }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!targetDate) return undefined;
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) return null;

  const target = parseYmd(targetDate);
  if (!target) return null;

  const diffMs = target.getTime() - now;
  const overdue = diffMs < 0;
  const remainingLabel = overdue ? `Overdue by ${formatDurationFromMs(-diffMs)}` : `Due in ${formatDurationFromMs(diffMs)}`;

  let progressPercent = null;
  if (totalDays && totalDays > 0) {
    const totalMs = totalDays * 86400000;
    const elapsed = totalMs - diffMs;
    progressPercent = overdue ? 100 : Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
  }

  const containerSizing = size === 'lg'
    ? 'px-4 py-3 rounded-2xl gap-3 text-sm sm:text-base'
    : 'px-3 py-1.5 rounded-full gap-2 text-xs';

  return (
    <div className={cx('countdown-badge flex flex-wrap items-center font-semibold w-full', containerSizing, overdue ? 'overdue' : 'upcoming')}>
      {progressPercent !== null && <span className="countdown-progress" style={{ width: `${progressPercent}%` }} />}
      <span className="break-words leading-tight">{label}</span>
      <span className="break-words leading-tight">{remainingLabel}</span>
      <span className="break-words leading-tight">{formatDateForDisplay(targetDate)}</span>
    </div>
  );
}

function formatDurationFromMs(ms) {
  const absMs = Math.max(0, Math.floor(ms));
  const totalMinutes = Math.round(absMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes - days * 60 * 24 - hours * 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 0)}m`;
}

function trimAppointmentsAfterOvulation(appointments = [], ovulationDate) {
  if (!ovulationDate || !Array.isArray(appointments) || !appointments.length) return appointments;
  const priorCount = appointments.filter(ap => (ap.date || '') <= ovulationDate).length;
  if (priorCount < 3) return appointments;
  return appointments.filter(ap => (ap.date || '') <= ovulationDate);
}

function diffInDays(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / 86400000);
}

function parseYmd(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return null;
  const d = new Date(year, month - 1, day, 12);
  if (isNaN(d.getTime())) return null;
  return d;
}

// import tab
function ImportSection({ importText, setImportText, importPreview, setImportPreview, runImportPreview, applyImport, onResolveLeucisticLists, theme='blue', onCancel, showAppAlert }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const sheetInputRef = useRef();
  const resolvingPreviewRef = useRef(false);
  const { t } = useTranslation();
  const importCount = Array.isArray(importPreview) ? importPreview.length : 0;
  const parsingLabel = t("ui.animals.import.parsing", { defaultValue: "Parsing..." });
  const importButtonLabel = importCount
    ? t("ui.animals.import.importButtonWithCount", { count: importCount, defaultValue: "Import ({{count}})" })
    : t("ui.animals.import.importButton", { defaultValue: "Import" });
  const geneticsLabel = t("ui.animals.import.geneticsLabel", { defaultValue: "Genetics" });
  const resolveLeucisticEntry = useCallback(async (entry, sourceLabel = 'Import genetics') => {
    if (!entry) return entry;
    const morphs = Array.isArray(entry.morphs) ? entry.morphs : [];
    const hets = Array.isArray(entry.hets) ? entry.hets : [];
    if (typeof onResolveLeucisticLists !== 'function') {
      const normalized = normalizeMorphHetLists([...morphs, ...hets]);
      return { ...entry, morphs: normalized.morphs, hets: normalized.hets };
    }
    const resolved = await onResolveLeucisticLists(morphs, hets, sourceLabel);
    return {
      ...entry,
      morphs: resolved?.morphs || morphs,
      hets: resolved?.hets || hets,
    };
  }, [onResolveLeucisticLists]);

  useEffect(() => {
    if (resolvingPreviewRef.current) return;
    const list = Array.isArray(importPreview) ? importPreview : [];
    if (!list.length) return;
    const hasTrigger = list.some(entry => {
      const raw = formatMorphHetForInput(entry?.morphs || [], entry?.hets || []);
      return hasLeucisticTriggerText(raw);
    });
    if (!hasTrigger) return;

    let cancelled = false;
    const run = async () => {
      resolvingPreviewRef.current = true;
      try {
        const next = [];
        for (const row of list) {
          if (cancelled) return;
          const resolvedRow = await resolveLeucisticEntry(row, 'Import preview genetics');
          next.push({ ...resolvedRow, previewText: formatParsedPreview(resolvedRow) });
        }
        if (!cancelled) {
          setImportPreview(next);
        }
      } finally {
        resolvingPreviewRef.current = false;
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [importPreview, resolveLeucisticEntry, setImportPreview]);

  return (
    <Card title={t("ui.animals.import.title", { defaultValue: "Import snakes from text" })}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium">{t("ui.animals.import.pasteLabel", { defaultValue: "Paste text exported from the PDF" })}</label>
          <textarea className="mt-1 w-full h-64 border rounded-xl px-3 py-2"
            value={importText} onChange={e=>setImportText(e.target.value.replace(/Ball Python\s*\(Python regius\)/ig, ''))} placeholder={t("ui.animals.import.pastePlaceholder", { defaultValue: "Paste content here..." })}/>

          <div className="mt-2">
            <label className="text-xs font-medium">{t("ui.animals.import.uploadSectionLabel", { defaultValue: "Upload PDF" })}</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                id="import-pdf-input"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={async e => {
                  const f = e.target.files && e.target.files[0];
                  setSelectedFile(f || null);
                  if (!f) return;
                  setParsing(true);
                  try {
                    const txt = await extractPdfText(f);
                    // set textarea immediately
                    setImportText(txt);

                    // try strict 4-line parser first
                    let items = parseFourLineBlocks(txt);
                    if (items && items.length) {
                      const converted = items.map(p => {
                        const normalized = normalizeMorphHetLists([...(p.morphs || []), ...(p.hets || [])]);
                        const sex = ensureSex(p.sex, 'F');
                        return { name: p.name, sex, morphs: normalized.morphs, hets: normalized.hets, previewText: formatParsedPreview({ ...p, sex, morphs: normalized.morphs, hets: normalized.hets }) };
                      });
                      const resolvedRows = [];
                      for (const row of converted) {
                        const resolvedRow = await resolveLeucisticEntry(row, 'Import PDF genetics');
                        resolvedRows.push({ ...resolvedRow, previewText: formatParsedPreview(resolvedRow) });
                      }
                      setImportPreview(resolvedRows);
                      return;
                    }

                    // try single-line parsing (one snake per line)
                    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    const singleLineResults = lines.map(l => parseOneLineSnake(l)).filter(Boolean);
                    if (singleLineResults && singleLineResults.length) {
                      const convertedSingle = singleLineResults.map(p => {
                        const morphs = [];
                        const hets = [];
                        (p.genetics || []).forEach(g => {
                          const low = String(g).toLowerCase();
                          if (/^het\b|\bhet\b|^66%|^50%|possible/i.test(low)) hets.push(g);
                          else morphs.push(g);
                        });
                        const normalized = normalizeMorphHetLists([...morphs, ...hets]);
                        const sex = ensureSex(p.gender && p.gender[0], 'F');
                        return {
                          name: p.name,
                          sex,
                          morphs: normalized.morphs,
                          hets: normalized.hets,
                          previewText: formatParsedPreview({ name: p.name, id: p.id || '', sex, morphs: normalized.morphs, hets: normalized.hets })
                        };
                      });
                      const resolvedRows = [];
                      for (const row of convertedSingle) {
                        const resolvedRow = await resolveLeucisticEntry(row, 'Import line genetics');
                        resolvedRows.push({ ...resolvedRow, previewText: formatParsedPreview(resolvedRow) });
                      }
                      setImportPreview(resolvedRows);
                      return;
                    }

                    // try pipe-separated single-line records
                    const pipeParsed = parsePipeSeparatedLines(txt);
                    if (pipeParsed && pipeParsed.length) {
                      const convertedPipe = pipeParsed.map(p => {
                        const normalized = normalizeMorphHetLists([...(p.morphs || []), ...(p.hets || [])]);
                        const sex = ensureSex(p.sex, 'F');
                        return { name: p.name, sex, morphs: normalized.morphs, hets: normalized.hets, previewText: formatParsedPreview({ name: p.name, id: '', sex, morphs: normalized.morphs, hets: normalized.hets }) };
                      });
                      const resolvedRows = [];
                      for (const row of convertedPipe) {
                        const resolvedRow = await resolveLeucisticEntry(row, 'Import pipe genetics');
                        resolvedRows.push({ ...resolvedRow, previewText: formatParsedPreview(resolvedRow) });
                      }
                      setImportPreview(resolvedRows);
                      return;
                    }

                    // fallback to older heuristic parser
                    const fallback = parseReptileBuddyText(txt);
                    const normalizedFallback = fallback.map(p => {
                      const normalized = normalizeMorphHetLists([...(p.morphs || []), ...(p.hets || [])]);
                      const sex = ensureSex(p.sex, 'F');
                      return { ...p, sex, morphs: normalized.morphs, hets: normalized.hets, previewText: formatParsedPreview({ ...p, sex, morphs: normalized.morphs, hets: normalized.hets }) };
                    });
                    const resolvedRows = [];
                    for (const row of normalizedFallback) {
                      const resolvedRow = await resolveLeucisticEntry(row, 'Import fallback genetics');
                      resolvedRows.push({ ...resolvedRow, previewText: formatParsedPreview(resolvedRow) });
                    }
                    setImportPreview(resolvedRows);
                  } catch (err) {
                    console.error('pdf parse failed', err);
                    if (typeof showAppAlert === 'function') {
                      await showAppAlert(t("ui.animals.import.parsePdfError", { defaultValue: "Failed to parse PDF" }));
                    } else {
                      console.warn(t("ui.animals.import.parsePdfError", { defaultValue: "Failed to parse PDF" }));
                    }
                  } finally {
                    setParsing(false);
                  }
                }}
              />
              <input id="import-sheet-input" ref={sheetInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={async e => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                setParsing(true);
                try {
                  const name = (f.name || '').toLowerCase();
                  let text = '';
                  if (name.endsWith('.csv') || name.endsWith('.txt')) {
                    text = await f.text();
                  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                    let XLSX;
                    try {
                      XLSX = await import('xlsx');
                    } catch (err) {
                      console.error('xlsx import failed', err);
                      if (typeof showAppAlert === 'function') {
                        await showAppAlert(t("ui.animals.import.installXlsxPrompt", { defaultValue: "To import Excel files please install the \"xlsx\" package: npm install xlsx" }));
                      } else {
                        console.warn(t("ui.animals.import.installXlsxPrompt", { defaultValue: "To import Excel files please install the \"xlsx\" package: npm install xlsx" }));
                      }
                      return;
                    }
                    const data = await f.arrayBuffer();
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    text = XLSX.utils.sheet_to_csv(worksheet);
                  } else {
                    if (typeof showAppAlert === 'function') {
                      await showAppAlert(t("ui.animals.import.unsupportedFileType", { defaultValue: "Unsupported file type. Please upload CSV or XLSX." }));
                    } else {
                      console.warn(t("ui.animals.import.unsupportedFileType", { defaultValue: "Unsupported file type. Please upload CSV or XLSX." }));
                    }
                    return;
                  }

                  const rows = parseCsvToRows(text || '');
                  if (!rows || !rows.length) { setImportPreview([]); return; }

                  const { index: headerIndex, hasHeader } = buildHeaderIndex(rows[0] || []);

                  const parseWithHeaders = (row) => {
                    if (!row || !row.length) return null;
                    const cells = row.map(c => (c || '').toString());
                    if (cells.every(cell => !cell.trim())) return null;

                    const single = (key) => {
                      const values = getHeaderValues(cells, headerIndex, key);
                      return values.length ? values[0].trim() : '';
                    };
                    const allTokens = (key) => getHeaderValues(cells, headerIndex, key).flatMap(splitMultiValueCell);

                    const name = single('name');
                    const id = single('id');
                    const sexRaw = single('sex');
                    const statusRaw = single('status');
                    const yearRaw = single('year');
                    const weightRaw = single('weight');
                    const birthRaw = single('birthDate');
                    const notesRaw = single('notes');

                    const geneticTokens = [
                      ...allTokens('genetics'),
                      ...allTokens('morphs')
                    ];
                    const hetTokens = allTokens('hets').map(token => {
                      const trimmed = token.trim();
                      if (!trimmed) return '';
                      const lower = trimmed.toLowerCase();
                      if (lower.includes('het') || /\d+%/.test(lower) || lower.includes('possible')) return trimmed;
                      return `het ${trimmed}`;
                    }).filter(Boolean);

                    const { morphs, hets } = normalizeMorphHetLists([...geneticTokens, ...hetTokens]);

                    const groups = Array.from(new Set(allTokens('groups')));
                    const tags = Array.from(new Set(allTokens('tags')));

                    const sex = ensureSex(sexRaw, 'F');
                    const year = Number(yearRaw);
                    const weight = weightRaw && weightRaw.trim() ? weightRaw : '';
                    const birthDate = normalizeDateInput(birthRaw) || birthRaw || null;
                    const status = statusRaw ? statusRaw.trim() : '';

                    if (!name && !id && !morphs.length && !hets.length && !groups.length && !tags.length) return null;

                    return {
                      name,
                      id,
                      sex,
                      morphs,
                      hets,
                      groups,
                      tags,
                      weight,
                      year: Number.isFinite(year) ? year : undefined,
                      birthDate,
                      status,
                      notes: notesRaw || undefined
                    };
                  };

                  const dataRows = hasHeader ? rows.slice(1) : rows;
                  let parsed = hasHeader ? dataRows.map(parseWithHeaders).filter(Boolean) : [];

                  if (!parsed.length) {
                    // fallback to positional columns (legacy behaviour)
                    let fallbackRows = rows;
                    const first = rows[0].map(c => (c || '').toString().toLowerCase());
                    const looksLikeHeader = first.some(c => c.includes('name') || c.includes('gender') || c.includes('gen'));
                    if (looksLikeHeader) fallbackRows = rows.slice(1);

                    parsed = fallbackRows.map(r => {
                      const cells = r.map(c => (c || '').trim());
                      if (!cells.length || cells.every(cell => !cell)) return null;
                      const name = cells[0] || '';
                      const genderRaw = (cells[1] || '').trim();
                      const geneticsRaw = (cells[2] || '').trim();
                      const groupsRaw = (cells[3] || '').trim();
                      const tagsRaw = (cells[4] || '').trim();
                      const g = genderRaw.toLowerCase();
                      let sex = 'F';
                      if (/^f$/.test(g) || /\bfemale\b/.test(g)) sex = 'F';
                      else if (/^m$/.test(g) || /\bmale\b/.test(g)) sex = 'M';
                      const tokens = geneticsRaw ? geneticsRaw.split(GENE_TOKEN_SPLIT_REGEX).map(x => x.trim()).filter(Boolean) : [];
                      const normalized = normalizeMorphHetLists(tokens);
                      const groups = groupsRaw ? groupsRaw.split(/[;,|]/).map(x=>x.trim()).filter(Boolean) : [];
                      const tags = tagsRaw ? tagsRaw.split(/[;,|]/).map(x=>x.trim()).filter(Boolean) : [];
                      return (name || normalized.morphs.length || normalized.hets.length || groups.length || tags.length)
                        ? { name, id: '', sex, morphs: normalized.morphs, hets: normalized.hets, groups, tags }
                        : null;
                    }).filter(Boolean);
                  }

                  if (!parsed.length) { setImportPreview([]); return; }

                  const converted = parsed.map(p => {
                    const sex = ensureSex(p.sex, 'F');
                    const previewPayload = { name: p.name, id: p.id || '', sex, morphs: p.morphs || [], hets: p.hets || [] };
                    return {
                      ...p,
                      sex,
                      previewText: formatParsedPreview(previewPayload)
                    };
                  });

                  const resolvedRows = [];
                  for (const row of converted) {
                    const resolvedRow = await resolveLeucisticEntry(row, 'Import sheet genetics');
                    resolvedRows.push({ ...resolvedRow, previewText: formatParsedPreview(resolvedRow) });
                  }

                  setImportPreview(resolvedRows);
                  setImportText(text);
                } catch (err) {
                  console.error('sheet import error', err);
                  setImportPreview([]);
                } finally {
                  setParsing(false);
                  try { e.target.value = null; } catch (e2) {}
                }
              }} />
              <button
                className={cx('text-xs px-2 py-1 rounded-lg', primaryBtnClass(theme,true))}
                onClick={()=>{ const el = document.getElementById('import-pdf-input'); if (el) el.click(); }}
                disabled={parsing}
              >
                {parsing ? parsingLabel : t("ui.animals.import.uploadPdfButton", { defaultValue: "Upload PDF" })}
              </button>
              <button
                className={cx('text-xs px-2 py-1 rounded-lg', 'ml-2', primaryBtnClass(theme,true))}
                onClick={()=>{ const el = document.getElementById('import-sheet-input'); if (el) el.click(); }}
                disabled={parsing}
              >
                {parsing ? parsingLabel : t("ui.animals.import.uploadSheetButton", { defaultValue: "Upload sheet" })}
              </button>
              <div className="text-xs text-neutral-500">{selectedFile ? selectedFile.name : t("ui.animals.import.noFileSelected", { defaultValue: "No file selected" })}</div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button className="px-3 py-2 rounded-xl text-sm border" onClick={runImportPreview}>
              {t("ui.animals.import.previewButton", { defaultValue: "Preview" })}
            </button>
            <button
              className={cx("px-3 py-2 rounded-xl text-sm border", "bg-white")}
              onClick={() => { setImportText(''); setSelectedFile(null); setImportPreview([]); if (onCancel) onCancel(); }}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              className={cx("px-3 py-2 rounded-xl text-sm text-white", importCount ? primaryBtnClass(theme,true) : primaryBtnClass(theme,false))}
              disabled={!importCount}
              onClick={applyImport}
            >
              {importButtonLabel}
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium">{t("ui.animals.import.previewTitle", { defaultValue: "Preview" })}</div>
          <div className="mt-1 border rounded-xl p-2 h-64 overflow-auto bg-neutral-50">
            {!importCount && (
              <div className="text-sm text-neutral-500">{t("ui.animals.import.previewHint", { defaultValue: "Click Preview to see parsed snakes." })}</div>
            )}
            {importPreview.map((s,i)=> (
              <div key={i} className="text-sm py-1 border-b last:border-b-0">
                {s.previewText ? (
                  <pre className="text-xs whitespace-pre-wrap">{s.previewText}</pre>
                ) : (
                  <>
                    <div className="font-medium">{s.name} <span className="text-xs text-neutral-500">({s.sex})</span></div>
                    {(() => {
                      const geneticsTokens = combineMorphsAndHetsForDisplay(s.morphs, s.hets, s.possibleHets);
                      return (
                        <div className="space-y-1 mt-1 text-[10px]">
                          {geneticsTokens.length ? (
                            <GeneLine label={geneticsLabel} genes={geneticsTokens} size="xs" />
                          ) : (
                            <div className="text-neutral-500 uppercase tracking-wide">{t("ui.animals.import.geneticsEmpty", { defaultValue: "Genetics: -" })}</div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
  <div className="text-xs text-neutral-500 mt-3">{t("ui.animals.import.mappingHint", { defaultValue: "Row 1 column titles (Name, ID, Gender, Morphs, etc.) are mapped automatically--double-check the preview before importing." })}</div>
    </Card>
  );
}

  async function extractPdfText(file) {
    const arrayBuffer = await file.arrayBuffer();
    // Pass Uint8Array to pdfjs for better compatibility
    const uint8 = new Uint8Array(arrayBuffer);
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
    } catch (err) {
      console.error('pdfjs failed to load document', err);
      throw err;
    }
    let full = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Group items by their vertical position so we preserve line breaks
      const items = content.items || [];
      let lines = [];
      let currentY = null;
      let currentLine = '';
      for (const it of items) {
        const txt = it.str || '';
        // transform is [a,b,c,d,e,f] where f is y coordinate in many builds
        const y = (it.transform && typeof it.transform[5] !== 'undefined') ? Math.round(it.transform[5]) : 0;
        if (currentY === null) {
          currentY = y;
          currentLine = txt;
          continue;
        }
        // if vertical position changes by more than threshold, start a new line
        if (Math.abs(y - currentY) > 5) {
          lines.push(currentLine.trim());
          currentLine = txt;
          currentY = y;
        } else {
          // same line — append with a space separator
          currentLine = (currentLine ? currentLine + ' ' : '') + txt;
        }
      }
      if (currentLine) lines.push(currentLine.trim());
      const pageText = lines.join('\n');
      full += pageText + '\n\n';
    }
    return full;
  }

// groups tab
function GroupsSection({ groups, setGroups, snakes, onDeleteGroup, onOpenSnake, theme='blue' }) {
  const [newGroupName, setNewGroupName] = useState("");
  const { t } = useTranslation();
  return (
    <Card title={t("groups.title", { defaultValue: "Groups" })}>
      <div className="flex gap-2">
        <input className="flex-1 border rounded-xl px-3 py-2" placeholder={t("groups.newName", { defaultValue: "New group name" })}
          value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} />
        <button className="px-3 py-2 rounded-xl text-sm border"
          onClick={()=>{
            const g = newGroupName.trim();
            if (!g) return;
            setGroups(prev => prev.includes(g) ? prev : [...prev, g]);
            setNewGroupName("");
          }}>{t("actions.add", { defaultValue: "Add" })}</button>
      </div>

      <div className="mt-4 space-y-4">
        {groups.map(g=>{
          const snakesInGroup = snakes.filter(s => (s.groups||[]).includes(g));
          return (
            <div key={g} className="p-3 border rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{g} <span className="text-xs text-neutral-500">({snakesInGroup.length})</span></div>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>onDeleteGroup(g)}>{t("actions.delete", { defaultValue: "Delete" })}</button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {snakesInGroup.length ? snakesInGroup.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpenSnake && onOpenSnake(s)}
                    className="text-sm px-2 py-1 rounded-full border bg-neutral-50 flex items-center gap-2 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-200"
                  >
                    <span className="font-medium">{s.name}</span>
                    <SexBadge sex={s.sex} />
                  </button>
                )) : <div className="text-xs text-neutral-500">{t("groups.noSnakes", { defaultValue: "No snakes in this group." })}</div>}
              </div>
            </div>
          );
        })}
        {!groups.length && <div className="py-2 text-xs text-neutral-500">{t("groups.none", { defaultValue: "No groups yet." })}</div>}
      </div>

      <div className="mt-4 text-xs text-neutral-500">
        {t("groups.tip", { defaultValue: "Tip: Edit a snake to assign or change its group." })}
      </div>
    </Card>
  );
}

// logs editor
function LogsEditor({ editSnakeDraft, setEditSnakeDraft, lastFeedDefaults, setLastFeedDefaults }) {
  const { t } = useTranslation();
  const feedsRef = useRef(null);
  const weightsRef = useRef(null);
  const shedsRef = useRef(null);
  const cleaningsRef = useRef(null);
  const medsRef = useRef(null);

  const removeLog = (key, idx) => {
    setEditSnakeDraft(d=>{
      const arr = [...(d.logs[key]||[])];
      arr.splice(idx,1);
      return { ...d, logs: { ...d.logs, [key]: arr } };
    });
  };

  // auto-scroll to bottom when a section grows so latest entries are visible
  useEffect(()=>{ if (feedsRef.current) feedsRef.current.scrollTop = feedsRef.current.scrollHeight; }, [editSnakeDraft.logs.feeds.length]);
  useEffect(()=>{ if (weightsRef.current) weightsRef.current.scrollTop = weightsRef.current.scrollHeight; }, [editSnakeDraft.logs.weights.length]);
  useEffect(()=>{ if (shedsRef.current) shedsRef.current.scrollTop = shedsRef.current.scrollHeight; }, [editSnakeDraft.logs.sheds.length]);
  useEffect(()=>{ if (cleaningsRef.current) cleaningsRef.current.scrollTop = cleaningsRef.current.scrollHeight; }, [editSnakeDraft.logs.cleanings.length]);
  useEffect(()=>{ if (medsRef.current) medsRef.current.scrollTop = medsRef.current.scrollHeight; }, [editSnakeDraft.logs.meds.length]);
  return (
    <>
      {/* Feeds */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">{t("logs.feeds")}</div>
          <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={()=>{
              const today=localYMD(new Date());
              // use persisted lastFeedDefaults (but never carry forward weight)
              const def = lastFeedDefaults || { feed: 'Mouse', size: '', sizeDetail: '', form: 'Frozen/thawed', formDetail: '', notes: '' };
              const method = def.form || 'Frozen/thawed';
              const methodDetail = def.formDetail || '';
              setEditSnakeDraft(d=>({...d,logs:{...d.logs,feeds:[...d.logs.feeds,{date:today,feed: def.feed || 'Mouse',size: def.size || '',weightGrams:0,method: method,methodDetail: methodDetail,notes: def.notes || '',refused: false}]}}));
            }}>{t("logs.addEntry", { defaultValue: "+ Add" })}</button>
        </div>
        <div ref={feedsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.feeds.map((x,i)=>{
            const isRefused = !!x.refused;
            if (isRefused) {
              return (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-center text-xs">
                  <input
                    type="date"
                    className="border rounded-lg px-2 py-1 text-xs text-neutral-900 sm:col-span-2 min-w-[8rem] w-full"
                    value={x.date}
                    onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{date:e.target.value})}
                  />
                  <div className="sm:col-span-3 font-semibold text-rose-600">{t("logs.refused", { defaultValue: "Refused feed" })}</div>
                  <div className="sm:col-span-2 flex justify-end gap-2 flex-wrap">
                    <button
                      className="text-xs px-2 py-1 border rounded-lg"
                      onClick={()=>updateLog(setEditSnakeDraft,'feeds',i,{refused:false})}
                    >
                      Undo refused
                    </button>
                    <button className="text-xs px-2 py-1 border rounded-lg text-rose-600" onClick={()=>removeLog('feeds', i)}>Delete</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-center text-xs">
                <input type="date" className="border rounded-lg px-2 py-1 text-xs text-neutral-900 sm:col-span-2 min-w-[8rem] w-full" value={x.date}
                  onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{date:e.target.value})}/>

                {/* feed type */}
                <select className="border rounded-lg px-2 py-1 text-xs sm:col-span-1 w-full" value={x.feed||''}
                  onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{feed:e.target.value, size: (e.target.value === 'Mouse' || e.target.value === 'Rat') ? (x.size||'pinky') : ''})}>
                  <option value="Mouse">Mouse</option>
                  <option value="Rat">Rat</option>
                  <option value="Chick">Chick</option>
                  <option value="Other">Other</option>
                </select>

                {/* size - only relevant for Mouse/Rat */}
                {(x.feed === 'Mouse' || x.feed === 'Rat') ? (
                  <select className="border rounded-lg px-2 py-1 text-xs sm:col-span-1 w-full" value={x.size||''}
                    onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{size:e.target.value})}>
                    <option value="pinky">pinky</option>
                    <option value="fuzzy">fuzzy</option>
                    <option value="medium">medium</option>
                    <option value="adult">adult</option>
                  </select>
                ) : (
                  <input className="border rounded-lg px-2 py-1 text-xs sm:col-span-1 w-full" placeholder="Size" value={x.size||''} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{size:e.target.value})} />
                )}

                {/* weight in grams */}
                <input type="number" className="border rounded-lg px-2 py-1 text-xs w-full sm:col-span-1" placeholder="g"
                  value={typeof x.weightGrams === 'number' ? x.weightGrams : (x.weightGrams || 0)} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{weightGrams: Number(e.target.value) || 0})}/>

                {/* method of feed */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:col-span-2">
                  <select className="border rounded-lg px-2 py-1 text-xs w-full sm:w-auto" value={x.method||''} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{method: e.target.value})}>
                      <option value="Live">Live</option>
                      <option value="Freshly killed">Freshly killed</option>
                      <option value="Frozen/thawed">Frozen/thawed</option>
                      <option value="Other">Other</option>
                  </select>
                  {x.method === 'Other' && (
                    <input className="border rounded-lg px-2 py-1 text-xs w-full sm:w-auto" placeholder="Method details" value={x.methodDetail||''} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{methodDetail: e.target.value})} />
                  )}
                </div>

                <div className="sm:col-span-7">
                  <input className="border rounded-lg px-2 py-1 text-xs w-full" placeholder="Notes" value={x.notes||""} onChange={e=>updateLog(setEditSnakeDraft,'feeds',i,{notes:e.target.value})}/>
                </div>

                <div className="sm:col-span-7 flex justify-end items-center gap-2 flex-wrap">
                  <button
                    className="text-xs px-2 py-1 border rounded-lg"
                    onClick={()=>updateLog(setEditSnakeDraft,'feeds',i,{refused:true})}
                  >
                    Mark refused
                  </button>
                  <button className="text-xs px-2 py-1 border rounded-lg text-rose-600" onClick={()=>removeLog('feeds', i)}>Delete</button>
                </div>
              </div>
            );
          })}
          {!editSnakeDraft.logs.feeds.length && <div className="text-xs text-neutral-500">{t("logs.none", { defaultValue: "No records." })}</div>}
        </div>
      </section>

      {/* Weights */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">{t("logs.weights")}</div>
          <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={()=>{
              const today=localYMD(new Date());
              setEditSnakeDraft(d=>({...d,logs:{...d.logs,weights:[...d.logs.weights,{date:today,grams:0,notes:""}]}}));
            }}>{t("logs.addEntry", { defaultValue: "+ Add" })}</button>
        </div>
        <div ref={weightsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.weights.map((x,i)=>(
            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
              <input type="date" className="border rounded-lg px-2 py-1" value={x.date}
                onChange={e=>updateLog(setEditSnakeDraft,"weights",i,{date:e.target.value})}/>
              <input type="number" className="border rounded-lg px-2 py-1" placeholder="grams"
                value={x.grams} onChange={e=>updateLog(setEditSnakeDraft,"weights",i,{grams:Number(e.target.value)||0})}/>
              <input className="border rounded-lg px-2 py-1 md:col-span-2" placeholder="Notes"
                value={x.notes||""} onChange={e=>updateLog(setEditSnakeDraft,"weights",i,{notes:e.target.value})}/>
              <button className="text-xs px-2 py-1 border rounded-lg text-rose-600 md:col-start-5" onClick={()=>removeLog('weights', i)}>Delete</button>
            </div>
          ))}
          {!editSnakeDraft.logs.weights.length && <div className="text-xs text-neutral-500">{t("logs.none", { defaultValue: "No records." })}</div>}
        </div>
      </section>

      {/* Sheds */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">{t("logs.sheds")}</div>
          <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={() => {
              const today = localYMD(new Date());
              setEditSnakeDraft(d => ({ ...d, logs: { ...d.logs, sheds: [...d.logs.sheds, { date: today, complete: true, notes: '' }] } }));
            }}>{t("logs.addEntry", { defaultValue: "+ Add" })}</button>
        </div>
        <div ref={shedsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.sheds.map((x,i)=>(
            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
              <input type="date" className="border rounded-lg px-2 py-1" value={x.date}
                onChange={e=>updateLog(setEditSnakeDraft,'sheds',i,{date:e.target.value})}/>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="w-4 h-4" checked={!!x.complete}
                  onChange={e=>updateLog(setEditSnakeDraft,'sheds',i,{complete:e.target.checked})}/>
                {t("logs.complete", { defaultValue: "Complete" })}
              </label>
              <input className="border rounded-lg px-2 py-1 md:col-span-2" placeholder="Notes" value={x.notes||''} onChange={e=>updateLog(setEditSnakeDraft,'sheds',i,{notes:e.target.value})} />
              <button className="text-xs px-2 py-1 border rounded-lg text-rose-600 md:col-start-5" onClick={()=>removeLog('sheds', i)}>Delete</button>
            </div>
          ))}
          {!editSnakeDraft.logs.sheds.length && <div className="text-xs text-neutral-500">{t("logs.none", { defaultValue: "No records." })}</div>}
        </div>
      </section>

      {/* Cleanings */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">{t("logs.cleanings")}</div>
        <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={()=>{
              const today = localYMD(new Date());
              setEditSnakeDraft(d=>({...d,logs:{...d.logs,cleanings:[...d.logs.cleanings,{date:today,deep:false,notes:''}]}}));
            }}>{t("logs.addEntry", { defaultValue: "+ Add" })}</button>
        </div>
        <div ref={cleaningsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.cleanings.map((x,i)=>(
            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
              <input type="date" className="border rounded-lg px-2 py-1" value={x.date}
                onChange={e=>updateLog(setEditSnakeDraft,'cleanings',i,{date:e.target.value})}/>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" className="w-4 h-4" checked={!!x.deep}
                  onChange={e=>updateLog(setEditSnakeDraft,'cleanings',i,{deep:e.target.checked})}/>
                {t("logs.deepClean", { defaultValue: "Deep clean" })}
              </label>
              <input className="border rounded-lg px-2 py-1 md:col-span-2" placeholder="Notes" value={x.notes||''} onChange={e=>updateLog(setEditSnakeDraft,'cleanings',i,{notes:e.target.value})} />
              <button className="text-xs px-2 py-1 border rounded-lg text-rose-600 md:col-start-5" onClick={()=>removeLog('cleanings', i)}>Delete</button>
            </div>
          ))}
          {!editSnakeDraft.logs.cleanings.length && <div className="text-xs text-neutral-500">{t("logs.none", { defaultValue: "No records." })}</div>}
        </div>
      </section>

      {/* Meds */}
      <section>
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">{t("logs.meds")}</div>
          <button className="text-xs px-2 py-1 border rounded-lg"
            onClick={()=>{
              const today=localYMD(new Date());
              setEditSnakeDraft(d=>({...d,logs:{...d.logs,meds:[...d.logs.meds,{date:today,drug:"",dose:"",notes:""}]}}));
            }}>{t("logs.addEntry", { defaultValue: "+ Add" })}</button>
        </div>
        <div ref={medsRef} className="mt-2 space-y-2 max-h-40 overflow-auto">
          {editSnakeDraft.logs.meds.map((x,i)=>(
            <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
              <input type="date" className="border rounded-lg px-2 py-1" value={x.date}
                onChange={e=>updateLog(setEditSnakeDraft,"meds",i,{date:e.target.value})}/>
              <input className="border rounded-lg px-2 py-1" placeholder={t("logs.drug")}
                value={x.drug||""} onChange={e=>updateLog(setEditSnakeDraft,"meds",i,{drug:e.target.value})}/>
              <input className="border rounded-lg px-2 py-1" placeholder={t("logs.dose")}
                value={x.dose||""} onChange={e=>updateLog(setEditSnakeDraft,"meds",i,{dose:e.target.value})}/>
              <input className="border rounded-lg px-2 py-1 md:col-span-2" placeholder={t("logs.notes", { defaultValue: "Notes" })}
                value={x.notes||""} onChange={e=>updateLog(setEditSnakeDraft,"meds",i,{notes:e.target.value})}/>
              <button className="text-xs px-2 py-1 border rounded-lg text-rose-600 md:col-start-6" onClick={()=>removeLog('meds', i)}>Delete</button>
            </div>
          ))}
          {!editSnakeDraft.logs.meds.length && <div className="text-xs text-neutral-500">{t("logs.none", { defaultValue: "No records." })}</div>}
        </div>
      </section>
    </>
  );
}

// calendar
function CalendarSection({ snakes, pairings, theme='blue', onOpenPairing, showAppAlert }) {
  const { t } = useTranslation();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0..11
  const [events, setEvents] = useState([]); // {date, maleId, femaleId, pairingId, apptId}
  const [filters, setFilters] = useState({
    feeds: true,
    weights: true,
    cleanings: true,
    sheds: true,
    meds: true,
    breeding: true,
    clutch: true,
  });
  const [activeMaleId, setActiveMaleId] = useState(null);
  const [googleSyncFeedback, setGoogleSyncFeedback] = useState(null);
  const [todayYmd, setTodayYmd] = useState(() => localYMD(new Date()));

  const snakesById = useMemo(() => Object.fromEntries(snakes.map(s => [s.id, s])), [snakes]);
  const malesById = useMemo(() => Object.fromEntries(snakes.filter(s=>s.sex==='M').map(m=>[m.id,m])), [snakes]);
  const femalesById = useMemo(() => Object.fromEntries(snakes.filter(s=>s.sex==='F').map(f=>[f.id,f])), [snakes]);
  const pairingsById = useMemo(() => Object.fromEntries(pairings.map(p => [p.id, p])), [pairings]);
  const {
    isSupported: googleSupported,
    isReady: googleReady,
    isSignedIn: googleSignedIn,
    user: googleUser,
    calendars: googleCalendars,
    selectedCalendarId: googleCalendarId,
    setSelectedCalendarId: setGoogleCalendarId,
    isLoadingCalendars: googleLoadingCalendars,
    isSyncing: googleIsSyncing,
    lastError: googleError,
    signIn: googleSignIn,
    signOut: googleSignOut,
    syncEvents: syncGoogleEvents,
  } = useGoogleCalendarIntegration();

  const grid = buildMonthGrid(year, month);

  useEffect(() => {
    const updateToday = () => setTodayYmd(localYMD(new Date()));
    updateToday();
    const intervalId = window.setInterval(updateToday, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleToggleFilter = useCallback((key) => {
    setFilters(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleMaleFilterToggle = useCallback((maleId) => {
    setActiveMaleId(prev => (prev === maleId ? null : maleId));
  }, []);

  const filterDefinitions = useMemo(() => ([
    { key: 'feeds', label: t('calendar.filters.feeds', { defaultValue: 'Feeds' }) },
    { key: 'weights', label: t('calendar.filters.weights', { defaultValue: 'Weights' }) },
    { key: 'cleanings', label: t('calendar.filters.cleanings', { defaultValue: 'Cleaning' }) },
    { key: 'sheds', label: t('calendar.filters.sheds', { defaultValue: 'Sheds' }) },
    { key: 'meds', label: t('calendar.filters.meds', { defaultValue: 'Meds' }) },
    { key: 'breeding', label: t('calendar.filters.breeding', { defaultValue: 'Breeding appointments' }) },
    { key: 'clutch', label: t('calendar.filters.clutch', { defaultValue: 'Clutch actions' }) },
  ]), [t]);

  const adjustMonth = useCallback((delta) => {
    let nextMonth = month + delta;
    let nextYear = year;
    while (nextMonth < 0) {
      nextMonth += 12;
      nextYear -= 1;
    }
    while (nextMonth > 11) {
      nextMonth -= 12;
      nextYear += 1;
    }
    setYear(nextYear);
    setMonth(nextMonth);
  }, [month, year]);

  const adjustYear = useCallback((delta) => {
    setYear(prev => prev + delta);
  }, []);

  const MONTH_RANGE_TO_SYNC = 5;
  const PAIRING_REMINDER_LOOKAHEAD_DAYS = 7;

  const buildEventsForMonth = useCallback((targetYear, targetMonth) => {
    const dim = daysInMonth(targetYear, targetMonth);
    const newEvents = [];

    /** collect per male, per base-day */
    const perMale = {};
    pairings.forEach(p => {
      (p.appointments || []).forEach(ap => {
        const d = new Date(ap.date);
        if (d.getFullYear() !== targetYear || d.getMonth() !== targetMonth) return;
        if (!perMale[p.maleId]) perMale[p.maleId] = {};
        const baseDay = d.getDate();
        if (!perMale[p.maleId][baseDay]) perMale[p.maleId][baseDay] = [];
        perMale[p.maleId][baseDay].push({
          pairing: p,
          appt: ap,
          femaleName: femalesById[p.femaleId]?.name || p.femaleId,
        });
      });
    });

    Object.keys(perMale).forEach(maleId => {
      const buckets = perMale[maleId];
      Object.keys(buckets).map(n => Number(n)).sort((a, b) => a - b).forEach(base => {
        const items = buckets[base].sort((a, b) => (a.femaleName || "").localeCompare(b.femaleName || ""));
        const occupied = new Set();

        const okSpacing = (cand) => {
          for (const o of occupied) if (Math.abs(o - cand) < 3) return false;
          return true;
        };

        const findDay = () => {
          return () => {
            const maxTries = 50;
            for (let k = 0; k < maxTries; k++) {
              let offset;
              if (k === 0) offset = 0;
              else if (k % 2 === 1) offset = ((k + 1) / 2) * 3;
              else offset = - (k / 2) * 3;
              const cand = base + offset;
              if (cand < 1 || cand > dim) continue;
              if (!occupied.has(cand) && okSpacing(cand)) return cand;
            }
            return null;
          };
        };

        const choose = findDay();
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          let chosen = choose();
          if (chosen === null) {
            let found = null;
            for (let dist = 0; dist <= dim; dist++) {
              const candidates = [base - dist, base + dist].filter(d => d >= 1 && d <= dim);
              for (const d of candidates) {
                if (!occupied.has(d) && okSpacing(d)) { found = d; break; }
              }
              if (found !== null) break;
            }
            chosen = found;
          }
          if (chosen === null) {
            for (let d = 1; d <= dim; d++) {
              if (!occupied.has(d)) { chosen = d; break; }
            }
          }
          if (chosen === null) chosen = Math.min(Math.max(base, 1), dim);
          occupied.add(chosen);
          if (chosen + 1 <= dim) occupied.add(chosen + 1);
          if (chosen + 2 <= dim) occupied.add(chosen + 2);
          const baseDate = new Date(targetYear, targetMonth, chosen);
          for (let off = 0; off < 3; off++) {
            const dt = new Date(baseDate);
            dt.setDate(dt.getDate() + off);
            if (dt.getFullYear() === targetYear && dt.getMonth() === targetMonth) {
              newEvents.push({
                date: localYMD(dt),
                maleId,
                femaleId: item.pairing.femaleId,
                pairingId: item.pairing.id,
                apptId: item.appt.id,
                type: 'pairing',
                spanOffset: off,
                notes: item.appt.notes || '',
                lockObserved: !!item.appt.lockObserved,
                lockDate: item.appt.lockDate || getLockRecordedDate(item.appt) || null,
                lockLoggedAt: item.appt.lockLoggedAt || null,
              });
            }
          }
        }
      });
    });

    pairings.forEach(p => {
      const pushLifecycleEvent = (rawDate, stage) => {
        if (!rawDate) return;
        const dt = new Date(rawDate);
        if (Number.isNaN(dt.getTime())) return;
        if (dt.getFullYear() !== targetYear || dt.getMonth() !== targetMonth) return;
        newEvents.push({
          date: localYMD(dt),
          type: 'clutch',
          stage,
          pairingId: p.id,
          maleId: p.maleId,
          femaleId: p.femaleId,
        });
      };

      if (p?.ovulation?.observed && p?.ovulation?.date) pushLifecycleEvent(p.ovulation.date, 'ovulation');
      if (p?.preLayShed?.observed && p?.preLayShed?.date) pushLifecycleEvent(p.preLayShed.date, 'preLay');
      if (p?.clutch?.recorded && p?.clutch?.date) pushLifecycleEvent(p.clutch.date, 'clutch');
      if (p?.hatch?.recorded && p?.hatch?.date) pushLifecycleEvent(p.hatch.date, 'hatch');
    });

    snakes.forEach(s => {
      const logs = s.logs || {};
      const addLogs = (key) => {
        (logs[key] || []).forEach(entry => {
          try {
            const dt = new Date(entry.date);
            if (dt.getFullYear() === targetYear && dt.getMonth() === targetMonth) {
              newEvents.push({ date: localYMD(dt), type: 'activity', activityKey: key, snakeId: s.id, entry: entry });
            }
          } catch (e) {
            /* ignore invalid dates */
          }
        });
      };
      ['feeds', 'weights', 'sheds', 'cleanings', 'meds'].forEach(addLogs);
    });

    return newEvents;
  }, [pairings, femalesById, snakes]);

  const loadAppointmentsIntoCalendar = useCallback(() => {
    setEvents(buildEventsForMonth(year, month));
  }, [buildEventsForMonth, year, month]);

  useEffect(() => { loadAppointmentsIntoCalendar(); }, [loadAppointmentsIntoCalendar]);

  const passesFilters = useCallback((ev) => {
    if (ev.type === 'activity') {
      const key = ev.activityKey;
      if (!key) return true;
      return filters[key] !== false;
    }
    if (ev.type === 'pairing') {
      if (filters.breeding === false) return false;
      if (activeMaleId && ev.maleId && ev.maleId !== activeMaleId) return false;
      return true;
    }
    if (ev.type === 'clutch') {
      if (filters.clutch === false) return false;
      if (activeMaleId && ev.maleId && ev.maleId !== activeMaleId) return false;
      return true;
    }
    if (activeMaleId && ev.maleId && ev.maleId !== activeMaleId) return false;
    return true;
  }, [filters, activeMaleId]);

  const filteredEvents = useMemo(() => {
    return events.filter(passesFilters);
  }, [events, passesFilters]);

  const calendarEventBounds = useMemo(() => computeCalendarEventBounds({ pairings, snakes }), [pairings, snakes]);

  const fullExportRangeLabel = useMemo(() => {
    const { start, end } = calendarEventBounds;
    if (!start || !end) return null;
    const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return startLabel === endLabel ? startLabel : `${startLabel} — ${endLabel}`;
  }, [calendarEventBounds]);

  const pairingReminders = useMemo(() => {
    if (!events.length) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + PAIRING_REMINDER_LOOKAHEAD_DAYS);

    const reminders = [];

    events.forEach(event => {
      if (event.type !== 'pairing') return;
      if (typeof event.spanOffset === 'number' && event.spanOffset > 0) return;
      if (!event.date) return;

      const eventDate = new Date(`${event.date}T00:00:00`);
      if (Number.isNaN(eventDate.getTime())) return;
      eventDate.setHours(0, 0, 0, 0);
      if (eventDate < today || eventDate > cutoff) return;

      const diffDays = Math.round((eventDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      const maleName = malesById[event.maleId]?.name || event.maleId || 'Male';
      const femaleName = femalesById[event.femaleId]?.name || event.femaleId || 'Female';
      const pairingLabel = pairingsById[event.pairingId]?.label || '';
      let whenLabel = eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      if (diffDays === 0) whenLabel = t('calendar.today', { defaultValue: 'Today' });
      else if (diffDays === 1) whenLabel = t('calendar.tomorrow', { defaultValue: 'Tomorrow' });

      reminders.push({
        id: `${event.pairingId || event.maleId || 'pairing'}-${event.date}`,
        maleName,
        femaleName,
        pairingLabel,
        whenLabel,
        diffDays,
      });
    });

    return reminders.sort((a, b) => {
      if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays;
      return a.maleName.localeCompare(b.maleName);
    });
  }, [events, malesById, femalesById, pairingsById, PAIRING_REMINDER_LOOKAHEAD_DAYS, t]);

  const gatherEventsForMonths = useCallback((startYear, startMonth, monthsCount) => {
    const aggregated = [];
    let currentYear = startYear;
    let currentMonth = startMonth;
    for (let i = 0; i < monthsCount; i++) {
      aggregated.push(...buildEventsForMonth(currentYear, currentMonth));
      currentMonth += 1;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear += 1;
      }
    }
    return aggregated;
  }, [buildEventsForMonth]);

  const googleSyncCandidates = useMemo(() => {
    if (!googleSupported) return [];
    if (!filteredEvents.length) return [];
    const seen = new Set();
    return filteredEvents
      .map(event =>
        convertCalendarEventToGooglePayload(event, {
          pairingsById,
          snakesById,
          malesById,
          femalesById,
        })
      )
      .filter(payload => {
        if (!payload) return false;
        if (payload.uid && seen.has(payload.uid)) return false;
        if (payload.uid) seen.add(payload.uid);
        return true;
      });
  }, [googleSupported, filteredEvents, pairingsById, snakesById, malesById, femalesById]);

  const googleRangeSyncCandidates = useMemo(() => {
    if (!googleSupported) return [];
    const rangeEvents = gatherEventsForMonths(year, month, MONTH_RANGE_TO_SYNC)
      .filter(ev => ev.type === 'pairing')
      .filter(passesFilters);
    if (!rangeEvents.length) return [];
    const seen = new Set();
    return rangeEvents
      .map(event =>
        convertCalendarEventToGooglePayload(event, {
          pairingsById,
          snakesById,
          malesById,
          femalesById,
        })
      )
      .filter(payload => {
        if (!payload) return false;
        if (payload.uid && seen.has(payload.uid)) return false;
        if (payload.uid) seen.add(payload.uid);
        return true;
      });
  }, [googleSupported, gatherEventsForMonths, year, month, MONTH_RANGE_TO_SYNC, passesFilters, pairingsById, snakesById, malesById, femalesById]);

  const googleCalendarOptions = useMemo(() => {
    if (!Array.isArray(googleCalendars)) return [];
    const seen = new Set();
    return googleCalendars.reduce((acc, calendar) => {
      if (!calendar?.id || seen.has(calendar.id)) return acc;
      seen.add(calendar.id);
      acc.push({
        id: calendar.id,
        summary: calendar.summary || calendar.id,
      });
      return acc;
    }, []);
  }, [googleCalendars]);

  const googleSelectedCalendarName = useMemo(() => {
    if (!googleCalendarId) return t('calendar.googleCalendar', { defaultValue: 'Google Calendar' });
    const match = googleCalendarOptions.find(calendar => calendar.id === googleCalendarId);
    if (match) return match.summary;
    if (googleCalendarId === 'primary') return t('calendar.primary', { defaultValue: 'Primary calendar' });
    return t('calendar.googleCalendar', { defaultValue: 'Google Calendar' });
  }, [googleCalendarId, googleCalendarOptions, t]);

  const googleSyncButtonLabel = useMemo(() => {
    if (googleIsSyncing) return t('calendar.syncing', { defaultValue: 'Syncing...' });
    const count = googleSyncCandidates.length;
    if (!count) return t('calendar.syncToGoogle', { defaultValue: 'Sync to Google' });
    return t('calendar.syncEvents', { count, defaultValue: 'Sync {{count}} event(s)' });
  }, [googleIsSyncing, googleSyncCandidates, t]);

  const googleSyncButtonDisabled = !googleSignedIn || googleIsSyncing || !googleSyncCandidates.length;
  const googleConnectDisabled = !googleReady || googleLoadingCalendars || googleIsSyncing;

  const googleRangeSyncButtonLabel = useMemo(() => {
    if (googleIsSyncing) return t('calendar.syncing', { defaultValue: 'Syncing...' });
    const count = googleRangeSyncCandidates.length;
    if (!count) return t('calendar.syncMonths', { count: MONTH_RANGE_TO_SYNC, defaultValue: 'Sync {{count}} months' });
    return t('calendar.syncEventsMonths', { count, months: MONTH_RANGE_TO_SYNC, defaultValue: 'Sync {{count}} events ({{months}} mo)' });
  }, [googleIsSyncing, googleRangeSyncCandidates, MONTH_RANGE_TO_SYNC, t]);

  const googleRangeSyncButtonDisabled = !googleSignedIn || googleIsSyncing || !googleRangeSyncCandidates.length;

  const rangeStartLabel = useMemo(() => {
    const dt = new Date(year, month, 1);
    return dt.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }, [year, month]);

  const rangeEndLabel = useMemo(() => {
    const dt = new Date(year, month + MONTH_RANGE_TO_SYNC - 1, 1);
    return dt.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }, [year, month, MONTH_RANGE_TO_SYNC]);

  useEffect(() => {
    if (googleError) {
      setGoogleSyncFeedback({
        kind: 'error',
        text: googleError.message || String(googleError),
      });
    }
  }, [googleError]);

  useEffect(() => {
    if (!googleSignedIn) {
      setGoogleSyncFeedback(null);
    }
  }, [googleSignedIn]);

  const handleExportGoogleCalendar = useCallback(async () => {
    if (!filteredEvents.length) {
      if (typeof showAppAlert === 'function') {
        await showAppAlert(t('calendar.noCurrentEntriesExport', { defaultValue: 'No calendar entries to export for the current view. Try adjusting your filters or refreshing first.' }));
      } else {
        console.warn(t('calendar.noCurrentEntriesExport', { defaultValue: 'No calendar entries to export for the current view. Try adjusting your filters or refreshing first.' }));
      }
      return;
    }
    const icsText = buildGoogleCalendarICS({
      events: filteredEvents,
      pairingsById,
      snakesById,
      malesById,
      femalesById,
    });
    if (!icsText) {
      if (typeof showAppAlert === 'function') {
        await showAppAlert(t('calendar.buildExportFailed', { defaultValue: 'Unable to build the calendar export. Please try again.' }));
      } else {
        console.warn(t('calendar.buildExportFailed', { defaultValue: 'Unable to build the calendar export. Please try again.' }));
      }
      return;
    }
    const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
    const fileMonth = String(month + 1).padStart(2, "0");
    const filename = `breeding-planner-${year}-${fileMonth}.ics`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [filteredEvents, pairingsById, snakesById, malesById, femalesById, month, year, showAppAlert, t]);

  const handleExportFullCalendar = useCallback(async () => {
    const { start, end } = calendarEventBounds;
    if (!start || !end) {
      if (typeof showAppAlert === 'function') {
        await showAppAlert(t("calendar.noEntriesExport", { defaultValue: "No calendar entries found to export. Add appointments or logs first." }));
      } else {
        console.warn(t("calendar.noEntriesExport", { defaultValue: "No calendar entries found to export. Add appointments or logs first." }));
      }
      return;
    }

    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    const endYear = end.getFullYear();
    const endMonth = end.getMonth();
    const monthsCount = calculateInclusiveMonthSpan(startYear, startMonth, endYear, endMonth);

    const rangeEvents = gatherEventsForMonths(startYear, startMonth, monthsCount).filter(passesFilters);
    if (!rangeEvents.length) {
      if (typeof showAppAlert === 'function') {
        await showAppAlert(t('calendar.noFullRangeEntries', { defaultValue: 'No calendar entries matched your current filters for the full range. Adjust filters and try again.' }));
      } else {
        console.warn(t('calendar.noFullRangeEntries', { defaultValue: 'No calendar entries matched your current filters for the full range. Adjust filters and try again.' }));
      }
      return;
    }

    const dedupedEvents = [];
    const seen = new Set();
    rangeEvents.forEach(event => {
      const key = [
        event.type || '',
        event.date || '',
        event.pairingId || '',
        event.apptId || '',
        event.snakeId || '',
        event.activityKey || '',
        event.stage || ''
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      dedupedEvents.push(event);
    });

    const icsText = buildGoogleCalendarICS({
      events: dedupedEvents,
      pairingsById,
      snakesById,
      malesById,
      femalesById,
    });
    if (!icsText) {
      if (typeof showAppAlert === 'function') {
        await showAppAlert(t('calendar.buildExportFailed', { defaultValue: 'Unable to build the calendar export. Please try again.' }));
      } else {
        console.warn(t('calendar.buildExportFailed', { defaultValue: 'Unable to build the calendar export. Please try again.' }));
      }
      return;
    }

    const startCode = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    const endCode = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
    const filename = `breeding-planner-${startCode}-to-${endCode}.ics`;

    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [calendarEventBounds, gatherEventsForMonths, passesFilters, pairingsById, snakesById, malesById, femalesById, showAppAlert, t]);

  const handleExportAppointmentSheet = useCallback(async () => {
    const appointmentEvents = filteredEvents.filter(ev => ev.type === 'pairing' && (typeof ev.spanOffset !== 'number' || ev.spanOffset === 0));
    if (!appointmentEvents.length) {
      if (typeof showAppAlert === 'function') {
        await showAppAlert(t('calendar.noAppointmentsExport', { defaultValue: 'No breeding appointments to export for the current view.' }));
      } else {
        console.warn(t('calendar.noAppointmentsExport', { defaultValue: 'No breeding appointments to export for the current view.' }));
      }
      return;
    }

    const sorted = [...appointmentEvents].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const maleCompare = (malesById[a.maleId]?.name || '').localeCompare(malesById[b.maleId]?.name || '');
      if (maleCompare !== 0) return maleCompare;
      return (femalesById[a.femaleId]?.name || '').localeCompare(femalesById[b.femaleId]?.name || '');
    });

    const rows = sorted.map(ev => {
      const pairing = pairingsById[ev.pairingId];
      const appt = pairing?.appointments?.find(ap => ap.id === ev.apptId);
      const maleName = malesById[ev.maleId]?.name || ev.maleId || '-';
      const femaleName = femalesById[ev.femaleId]?.name || ev.femaleId || '-';
      const startDisplay = formatDateForDisplay(ev.date) || ev.date;
      const startDateObj = parseYmd(ev.date);
      const endDateObj = startDateObj ? cloneAndShiftDays(startDateObj, 2) : null;
      const endDateYmd = endDateObj ? localYMD(endDateObj) : '';
      const endDisplay = endDateYmd ? formatDateForDisplay(endDateYmd) : '';
      const detailParts = [];
      if (pairing?.label) detailParts.push(pairing.label);
      if (appt?.notes) detailParts.push(appt.notes);
      if (ev.notes && ev.notes !== appt?.notes) detailParts.push(ev.notes);
      let lockNotes = '';
      if (ev.lockObserved) {
        const lockDateValue = ev.lockDate || ev.lockLoggedAt || appt?.lockDate || appt?.lockLoggedAt || appt?.date || null;
        lockNotes = lockDateValue ? buildLockLogLine(lockDateValue) : t('calendar.lockObserved', { defaultValue: 'Lock observed' });
        detailParts.push(lockNotes);
      }
      return {
        startDate: startDisplay,
        endDate: endDisplay,
        male: maleName,
        female: femaleName,
        pairingLabel: pairing?.label || '',
        notes: detailParts.join(' • '),
        lockObserved: lockNotes,
      };
    });

    const dataset = {
      columns: [
        { key: 'startDate', label: t('calendar.sheet.startDate', { defaultValue: 'Start date' }) },
        { key: 'endDate', label: t('calendar.sheet.endDate', { defaultValue: 'End date' }) },
        { key: 'male', label: t('pairing.male', { defaultValue: 'Male' }) },
        { key: 'female', label: t('pairing.female', { defaultValue: 'Female' }) },
        { key: 'pairingLabel', label: t('snakeEdit.pairingLabel', { defaultValue: 'Pairing' }) },
        { key: 'notes', label: t('pairing.notes', { defaultValue: 'Notes' }) },
        { key: 'lockObserved', label: t('calendar.lockObserved', { defaultValue: 'Lock observed' }) },
      ],
      rows,
    };

    const monthCode = `${year}-${String(month + 1).padStart(2, '0')}`;
    try {
      await exportDatasetToXlsx(dataset, {
        fileName: `breeding-appointments-${monthCode}.xlsx`,
        sheetName: t('calendar.sheet.appointments', { defaultValue: 'Appointments' }),
      });
    } catch (error) {
      console.error('Failed to export appointment sheet', error);
      if (typeof showAppAlert === 'function') {
        await showAppAlert(t('calendar.appointmentSheetExportFailed', { defaultValue: 'Unable to export the appointments sheet. Please try again.' }));
      } else {
        console.warn(t('calendar.appointmentSheetExportFailed', { defaultValue: 'Unable to export the appointments sheet. Please try again.' }));
      }
    }
  }, [filteredEvents, malesById, femalesById, pairingsById, month, year, showAppAlert, t]);

  const handleSyncGoogleCalendar = useCallback(async () => {
    if (!googleSupported) {
      setGoogleSyncFeedback({
        kind: 'error',
        text: t("calendar.syncNotConfigured", { defaultValue: "Google Calendar sync is not configured. Add VITE_GOOGLE_CLIENT_ID and reload." }),
      });
      return;
    }
    if (!googleSignedIn) {
      if (googleReady) {
        googleSignIn();
      }
      setGoogleSyncFeedback({
        kind: 'info',
        text: t('calendar.connectGoogleRetry', { defaultValue: 'Connect Google Calendar and try syncing again.' }),
      });
      return;
    }
    if (!googleSyncCandidates.length) {
      setGoogleSyncFeedback({
        kind: 'info',
        text: t('calendar.noEventsToSync', { defaultValue: 'No events in the current view to sync.' }),
      });
      return;
    }

    try {
      setGoogleSyncFeedback({
        kind: 'info',
        text: t('calendar.syncingEvents', { defaultValue: 'Syncing events to Google Calendar...' }),
      });
      const { synced = 0 } = await syncGoogleEvents(googleSyncCandidates);
      setGoogleSyncFeedback({
        kind: 'success',
        text: t('calendar.syncedEventsTo', { count: synced, calendar: googleSelectedCalendarName, defaultValue: 'Synced {{count}} event(s) to {{calendar}}.' }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGoogleSyncFeedback({
        kind: 'error',
        text: message,
      });
    }
  }, [googleSupported, googleSignedIn, googleReady, googleSignIn, googleSyncCandidates, syncGoogleEvents, googleSelectedCalendarName, t]);

  const handleConnectGoogleCalendar = useCallback(() => {
    if (!googleSupported) {
      setGoogleSyncFeedback({
        kind: 'error',
        text: t('calendar.syncNotConfigured', { defaultValue: 'Google Calendar sync is not available. Add VITE_GOOGLE_CLIENT_ID and reload.' }),
      });
      return;
    }
    if (!googleReady) {
      setGoogleSyncFeedback({
        kind: 'info',
        text: t('calendar.preparingGoogleRetry', { defaultValue: 'Preparing Google services. Please try again in a moment.' }),
      });
      return;
    }
    if (googleConnectDisabled) return;
    setGoogleSyncFeedback({
      kind: 'info',
      text: t('calendar.openingGoogleSignIn', { defaultValue: 'Opening Google sign-in...' }),
    });
    googleSignIn();
  }, [googleSupported, googleReady, googleConnectDisabled, googleSignIn, t]);

  const handleSyncGoogleCalendarRange = useCallback(async () => {
    if (!googleSupported) {
      setGoogleSyncFeedback({
        kind: 'error',
        text: t("calendar.syncNotConfigured", { defaultValue: "Google Calendar sync is not configured. Add VITE_GOOGLE_CLIENT_ID and reload." }),
      });
      return;
    }
    if (!googleSignedIn) {
      if (googleReady) {
        googleSignIn();
      }
      setGoogleSyncFeedback({
        kind: 'info',
        text: t('calendar.connectGoogleRetry', { defaultValue: 'Connect Google Calendar and try syncing again.' }),
      });
      return;
    }
    if (!googleRangeSyncCandidates.length) {
      setGoogleSyncFeedback({
        kind: 'info',
        text: t('calendar.syncRangeEmpty', { start: rangeStartLabel, end: rangeEndLabel, defaultValue: 'No breeding appointments found between {{start}} and {{end}}.' }),
      });
      return;
    }

    try {
      setGoogleSyncFeedback({
        kind: 'info',
        text: t('calendar.syncingRange', { count: googleRangeSyncCandidates.length, start: rangeStartLabel, end: rangeEndLabel, defaultValue: 'Syncing {{count}} breeding appointments from {{start}} to {{end}}...' }),
      });
      const { synced = 0 } = await syncGoogleEvents(googleRangeSyncCandidates);
      setGoogleSyncFeedback({
        kind: 'success',
        text: t('calendar.syncedRangeTo', { count: synced, start: rangeStartLabel, end: rangeEndLabel, calendar: googleSelectedCalendarName, defaultValue: 'Synced {{count}} event(s) from {{start}} to {{end}} into {{calendar}}.' }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGoogleSyncFeedback({
        kind: 'error',
        text: message,
      });
    }
  }, [googleSupported, googleSignedIn, googleReady, googleSignIn, googleRangeSyncCandidates, rangeStartLabel, rangeEndLabel, syncGoogleEvents, googleSelectedCalendarName, t]);

  const legend = useMemo(()=>{
    const maleIds = Array.from(new Set(events.filter(e=>e.type==='pairing').map(e=>e.maleId).filter(Boolean)));
    return maleIds.map(id=>({
      id,
      name: malesById[id]?.name || id,
      colors: id ? maleColorTokens(id, theme) : null,
      isActive: activeMaleId === id,
    }));
  }, [events, malesById, theme, activeMaleId]);

  return (
    <div className="bg-white border rounded-2xl shadow-sm">
      <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
        <div className="font-semibold mr-2">{t('calendar.title', { defaultValue: 'Monthly calendar' })}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="px-2 py-1 border rounded-lg text-xs"
            onClick={() => adjustMonth(-1)}
            aria-label={t('calendar.previousMonth', { defaultValue: 'Previous month' })}
          >
            ‹
          </button>
          <select className="border rounded-lg px-2 py-1 text-sm" value={month} onChange={e=>setMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i).map(m=>(
              <option key={m} value={m}>{t(`calendar.months.${m}`, { defaultValue: new Date(2000,m,1).toLocaleString('en',{month:'long'}) })}</option>
            ))}
          </select>
          <button
            type="button"
            className="px-2 py-1 border rounded-lg text-xs"
            onClick={() => adjustMonth(1)}
            aria-label={t('calendar.nextMonth', { defaultValue: 'Next month' })}
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="px-2 py-1 border rounded-lg text-xs"
            onClick={() => adjustYear(-1)}
            aria-label={t('calendar.previousYear', { defaultValue: 'Previous year' })}
          >
            ‹
          </button>
          <input className="border rounded-lg px-2 py-1 w-24" type="number" value={year} onChange={e=>setYear(Number(e.target.value)||year)} />
          <button
            type="button"
            className="px-2 py-1 border rounded-lg text-xs"
            onClick={() => adjustYear(1)}
            aria-label={t('calendar.nextYear', { defaultValue: 'Next year' })}
          >
            ›
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {googleSupported ? (
            googleSignedIn ? (
              <>
                <div className="flex items-center gap-2 border rounded-lg px-2 py-1 bg-white text-xs">
                  <div className="leading-tight">
                    <div className="font-semibold text-[11px]">{googleUser?.name || googleUser?.email || t('calendar.googleAccount', { defaultValue: 'Google account' })}</div>
                    {googleUser?.email ? <div className="text-[10px] text-neutral-600">{googleUser.email}</div> : null}
                  </div>
                  <button
                    type="button"
                    className="text-[11px] text-rose-600 disabled:opacity-60"
                    onClick={googleSignOut}
                    disabled={googleIsSyncing}
                  >
                    {t('calendar.signOut', { defaultValue: 'Sign out' })}
                  </button>
                </div>
                <select
                  className="border rounded-lg px-2 py-1 text-sm min-w-[160px]"
                  value={googleCalendarId || 'primary'}
                  onChange={(e) => setGoogleCalendarId(e.target.value)}
                  disabled={googleLoadingCalendars || googleIsSyncing}
                  title={t('calendar.syncTarget', { name: googleSelectedCalendarName, defaultValue: 'Sync target: {{name}}' })}
                >
                  <option value="primary">{t('calendar.primary', { defaultValue: 'Primary calendar' })}</option>
                  {googleCalendarOptions
                    .filter(calendar => calendar.id !== 'primary')
                    .map(calendar => (
                      <option key={calendar.id} value={calendar.id}>
                        {calendar.summary}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true), googleSyncButtonDisabled ? 'opacity-60 cursor-not-allowed' : '')}
                  onClick={handleSyncGoogleCalendar}
                  disabled={googleSyncButtonDisabled}
                  title={googleSyncCandidates.length ? t('calendar.syncReady', { count: googleSyncCandidates.length, defaultValue: 'Ready to sync {{count}} event(s)' }) : undefined}
                >
                  {googleSyncButtonLabel}
                </button>
                <button
                  type="button"
                  className={cx('px-3 py-2 rounded-xl text-sm border bg-white', googleRangeSyncButtonDisabled ? 'opacity-60 cursor-not-allowed' : '')}
                  onClick={handleSyncGoogleCalendarRange}
                  disabled={googleRangeSyncButtonDisabled}
                  title={googleRangeSyncCandidates.length
                    ? t('calendar.syncRangeReady', { count: googleRangeSyncCandidates.length, start: rangeStartLabel, end: rangeEndLabel, defaultValue: 'Sync {{count}} breeding event(s) spanning {{start}} to {{end}}' })
                    : t('calendar.syncRangeEmpty', { start: rangeStartLabel, end: rangeEndLabel, defaultValue: 'No breeding appointments found between {{start}} and {{end}}' })}
                >
                  {googleRangeSyncButtonLabel}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true), googleConnectDisabled ? 'opacity-60 cursor-not-allowed' : '')}
                onClick={handleConnectGoogleCalendar}
                disabled={googleConnectDisabled}
              >
                {googleReady ? t('calendar.connectGoogle', { defaultValue: 'Connect Google Calendar' }) : t('calendar.preparingGoogle', { defaultValue: 'Preparing Google...' })}
              </button>
            )
          ) : (
            <div className="text-[11px] text-neutral-500 max-w-xs">
              {t('calendar.setClientIdPrefix', { defaultValue: 'Set' })} <code>VITE_GOOGLE_CLIENT_ID</code> {t('calendar.setClientIdSuffix', { defaultValue: 'to enable Google Calendar sync.' })}
            </div>
          )}
          <button className={cx('px-3 py-2 rounded-xl text-sm', primaryBtnClass(theme,true))} onClick={loadAppointmentsIntoCalendar}>
            {t('calendar.refresh', { defaultValue: 'Refresh' })}
          </button>
          <button
            className="px-3 py-2 rounded-xl text-sm border"
            onClick={handleExportAppointmentSheet}
          >
            {t('calendar.exportAppointmentSheet', { defaultValue: 'Export appointment sheet' })}
          </button>
          <button
            className="px-3 py-2 rounded-xl text-sm border"
            onClick={handleExportGoogleCalendar}
          >
            {t('calendar.exportGoogle', { defaultValue: 'Export Google Calendar' })}
          </button>
          <button
            className="px-3 py-2 rounded-xl text-sm border"
            onClick={handleExportFullCalendar}
            title={fullExportRangeLabel ? t('calendar.downloadAppointmentsFrom', { range: fullExportRangeLabel, defaultValue: 'Download appointments from {{range}}' }) : t('calendar.downloadAllAppointments', { defaultValue: 'Download all appointments' })}
          >
            {t('calendar.exportFull', { defaultValue: 'Export Full Calendar' })}
          </button>
        </div>
      </div>

      {googleSyncFeedback ? (
        <div
          className={cx(
            'px-4 py-2 text-xs border-b',
            googleSyncFeedback.kind === 'error'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : googleSyncFeedback.kind === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-sky-50 text-sky-700 border-sky-200'
          )}
        >
          {googleSyncFeedback.text}
        </div>
      ) : null}

      {pairingReminders.length ? (
        <div className="px-4 py-2 border-b bg-amber-50 text-amber-800 text-xs">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-amber-700">{t('calendar.upcomingPairings', { defaultValue: 'Upcoming pairings' })}</div>
          <ul className="mt-1 space-y-1">
            {pairingReminders.map(reminder => (
              <li key={reminder.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5">
                <span className="font-medium">{t('calendar.pairWith', { male: reminder.maleName, female: reminder.femaleName, defaultValue: 'Pair {{male}} with {{female}}' })}</span>
                <span className="text-[11px] text-amber-600">
                  {reminder.whenLabel}
                  {reminder.pairingLabel ? ` — ${reminder.pairingLabel}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="px-4 py-3 border-b bg-neutral-50">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-700">
          {filterDefinitions.map(filter => (
            <label key={filter.key} className={cx('flex items-center gap-2 rounded-lg border px-2 py-1 bg-white', filters[filter.key] ? 'border-sky-200 shadow-sm' : 'border-neutral-200 opacity-80')}>
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={!!filters[filter.key]}
                onChange={() => handleToggleFilter(filter.key)}
              />
              <span>{filter.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 text-xs font-medium text-neutral-500">
          {['sun','mon','tue','wed','thu','fri','sat'].map(d=> <div key={d} className="p-2">{t(`calendar.weekdays.${d}`, { defaultValue: d.slice(0, 1).toUpperCase() + d.slice(1) })}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-neutral-200 rounded-lg overflow-hidden">
          {grid.map((cell, i) => {
            const cellDate = ymd(cell.year, cell.month, cell.day);
            const isToday = cellDate === todayYmd;
            return (
              <div
                key={i}
                className={cx(
                  "min-h-[110px] bg-white p-2",
                  cell.current ? "" : "bg-neutral-50",
                  isToday && "relative z-10 bg-sky-50 ring-2 ring-sky-400 ring-inset"
                )}
                aria-current={isToday ? "date" : undefined}
                title={isToday ? t('calendar.today', { defaultValue: 'Today' }) : undefined}
              >
                <div className="flex items-center justify-between gap-1">
                  <div
                    className={cx(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium",
                      isToday ? "bg-sky-500 text-white shadow-sm" : "text-neutral-500"
                    )}
                  >
                    {cell.day}
                  </div>
                  {isToday ? <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">{t('calendar.today', { defaultValue: 'Today' })}</div> : null}
                </div>
                {filteredEvents.filter(e => e.date === cellDate).map((e, idx) => {
                  if (e.type === 'activity') {
                    const pal = activityPalettes[e.activityKey] || { bg: '#efefef', border: '#ddd' };
                    const s = snakes.find(x => x.id === e.snakeId);
                    if (e.activityKey === 'feeds' && e.entry) {
                      const en = e.entry;
                      const normalizedKind = (en.feed || en.item || '').trim();
                      const sizeText = (en.size || '').trim();
                      const gramsText = (typeof en.weightGrams === 'number' && en.weightGrams > 0)
                        ? `${en.weightGrams} g`
                        : (typeof en.grams === 'number' && en.grams > 0 ? `${en.grams} g` : '');
                      const methodText = en.method
                        ? (en.methodDetail ? `${en.method} (${en.methodDetail})` : en.method)
                        : '';
                      let detailText = '';
                      if (!en.refused) {
                        const detailParts = [];
                        if (normalizedKind) detailParts.push(normalizedKind);
                        if (sizeText) detailParts.push(sizeText);
                        if (gramsText) detailParts.push(gramsText);
                        if (methodText) detailParts.push(methodText);
                        detailText = detailParts.join(' — ');
                      }
                      const feedLabel = en.refused ? t("logs.refused", { defaultValue: "Refused feed" }) : (detailText || t("logs.feed", { defaultValue: "Feed" }));
                      return (
                        <div
                          key={idx}
                          className={cx('text-[11px] px-2 py-1 rounded-full border flex items-start gap-2')}
                          style={{ backgroundColor: pal.bg, borderColor: pal.border }}
                        >
                          <div className="truncate">
                            <div className="font-medium truncate">{s?.name || e.snakeId} — {feedLabel}</div>
                            {en.refused && detailText ? (
                              <div className="text-[11px] text-neutral-500 truncate">{detailText}</div>
                            ) : null}
                            {en.notes ? <div className="text-[11px] text-neutral-500 truncate">{en.notes}</div> : null}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={idx}
                        className={cx('text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-2')}
                        style={{ backgroundColor: pal.bg, borderColor: pal.border }}
                      >
                        <span className="font-medium">{s?.name || e.snakeId}</span>
                        <span className="text-xs text-neutral-700">{e.activityKey.replace(/s$/,'')}</span>
                      </div>
                    );
                  }
                  if (e.type === 'clutch') {
                    const p = pairings.find(pp=>pp.id===e.pairingId);
                    const maleName = malesById[e.maleId]?.name || e.maleId;
                    const femaleName = femalesById[e.femaleId]?.name || e.femaleId;
                    const stageLabels = {
                      ovulation: t('calendar.stages.ovulation', { defaultValue: 'Ovulation observed' }),
                      preLay: t('calendar.stages.preLay', { defaultValue: 'Pre-lay shed' }),
                      clutch: t('calendar.stages.clutch', { defaultValue: 'Clutch laid' }),
                      hatch: t('calendar.stages.hatch', { defaultValue: 'Hatch recorded' }),
                    };
                    const stageStyles = {
                      ovulation: 'border-sky-200 bg-sky-50',
                      preLay: 'border-amber-200 bg-amber-50',
                      clutch: 'border-rose-200 bg-rose-50',
                      hatch: 'border-emerald-200 bg-emerald-50',
                    };
                    let detail = '';
                    if (e.stage === 'clutch') {
                      const eggs = p?.clutch?.eggsTotal;
                      const slugs = p?.clutch?.slugs;
                      const parts = [];
                      if (typeof eggs === 'number' && Number.isFinite(eggs)) parts.push(t('calendar.eggsCount', { count: eggs, defaultValue: 'Eggs: {{count}}' }));
                      if (typeof slugs === 'number' && Number.isFinite(slugs)) parts.push(t('calendar.slugsCount', { count: slugs, defaultValue: 'Slugs: {{count}}' }));
                      if (parts.length) detail = parts.join(' — ');
                      else if (p?.clutch?.notes) detail = p.clutch.notes;
                    } else if (e.stage === 'hatch') {
                      const hatchCount = p?.hatch?.hatchedCount;
                      if (typeof hatchCount === 'number' && Number.isFinite(hatchCount)) detail = t('calendar.hatchedCount', { count: hatchCount, defaultValue: 'Hatched: {{count}}' });
                      else if (p?.hatch?.notes) detail = p.hatch.notes;
                    } else if (e.stage === 'preLay') {
                      if (p?.preLayShed?.intervalFromOvulation && Number.isFinite(p.preLayShed.intervalFromOvulation)) {
                        detail = t('calendar.daysAfterOvulation', { count: p.preLayShed.intervalFromOvulation, defaultValue: '{{count}} days after ovulation' });
                      } else if (p?.preLayShed?.notes) {
                        detail = p.preLayShed.notes;
                      }
                    } else if (e.stage === 'ovulation') {
                      detail = p?.ovulation?.notes || '';
                    }
                    return (
                      <button
                        key={idx}
                        onClick={()=>{ if (onOpenPairing) onOpenPairing(e.pairingId); }}
                        className={cx('text-xs px-2 py-1 rounded-lg border flex flex-col text-left w-full', stageStyles[e.stage] || 'border-neutral-200 bg-neutral-50')}
                      >
                        <div className="font-medium truncate">{stageLabels[e.stage] || t('calendar.filters.clutch', { defaultValue: 'Clutch action' })}</div>
                        <div className="text-[11px] text-neutral-500 truncate">{maleName} × {femaleName}</div>
                        {detail ? <div className="text-[11px] text-neutral-500 truncate">{detail}</div> : null}
                      </button>
                    );
                  }
                  // pairing span event — show Male × Female and make clickable
                  const p = pairings.find(pp=>pp.id===e.pairingId);
                  const maleName = malesById[e.maleId]?.name || e.maleId;
                  const femaleName = femalesById[e.femaleId]?.name || e.femaleId;
                  const maleColors = maleColorTokens(e.maleId, theme);
                  const lockRecordedAt = e.lockDate || e.lockLoggedAt || null;
                  const lockLine = (e.spanOffset === 0 && e.lockObserved && lockRecordedAt) ? buildLockLogLine(lockRecordedAt) : null;
                  let additionalNote = null;
                  if (e.spanOffset === 0 && e.notes) {
                    const lines = e.notes.split('\n').map(l => l.trim()).filter(Boolean);
                    additionalNote = lines.find(line => !lockLine || line !== lockLine) || null;
                  }
                  return (
                    <button
                      key={idx}
                      onClick={()=>{ if (onOpenPairing) onOpenPairing(e.pairingId); }}
                      className="text-xs px-2 py-1 rounded-lg border flex items-center gap-2 text-left w-full"
                      style={{ borderColor: maleColors.border, background: maleColors.fill }}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                        style={{ backgroundColor: maleColors.dot }}
                      ></span>
                      <div className="truncate">
                        <div className="font-medium truncate">{maleName} × {femaleName}</div>
                        {p?.label ? <div className="text-[11px] text-neutral-500 truncate">{p.label}</div> : null}
                        {lockLine ? <div className="text-[11px] text-emerald-600 truncate">{lockLine}</div> : null}
                        {additionalNote ? <div className="text-[11px] text-neutral-500 truncate">{additionalNote}</div> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {legend.map(l => {
            const style = l.colors
              ? {
                  borderColor: l.colors.border,
                  background: l.isActive ? l.colors.fill : undefined,
                  opacity: activeMaleId && !l.isActive ? 0.5 : 1,
                }
              : undefined;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => handleMaleFilterToggle(l.id)}
                className="text-xs px-2 py-1 border rounded-lg flex items-center gap-1 transition-opacity"
                style={style}
                aria-pressed={l.isActive}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                  style={l.colors ? { backgroundColor: l.colors.dot } : undefined}
                ></span>
                {l.name}
              </button>
            );
          })}
          {!legend.length && <div className="text-xs text-neutral-500">{t('calendar.noAppointmentsView', { defaultValue: 'No appointments in this view.' })}</div>}
        </div>
      </div>
    </div>
  );
}

function buildGoogleCalendarICS({ events, pairingsById, snakesById, malesById, femalesById }) {
  if (!Array.isArray(events) || events.length === 0) return '';
  const dtStamp = formatDateTimeUTC(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Breeding Planner//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Breeding Planner'
  ];

  events.forEach(event => {
    const veventLines = convertCalendarEventToIcsLines(event, {
      dtStamp,
      pairingsById,
      snakesById,
      malesById,
      femalesById,
    });
    if (Array.isArray(veventLines) && veventLines.length) {
      lines.push(...veventLines);
    }
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function prepareCalendarEventExport(event, context) {
  if (!event || !event.date) return null;
  const startDate = new Date(`${event.date}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return null;

  const descriptionParts = [];
  let summary = '';
  let durationDays = 1;

  const pairing = event.pairingId ? context.pairingsById?.[event.pairingId] : null;
  const maleName = event.maleId
    ? (context.malesById?.[event.maleId]?.name || pairing?.maleId || event.maleId)
    : '';
  const femaleName = event.femaleId
    ? (context.femalesById?.[event.femaleId]?.name || pairing?.femaleId || event.femaleId)
    : '';

  if (event.type === 'pairing') {
    if (typeof event.spanOffset === 'number' && event.spanOffset > 0) return null;
    durationDays = 3;
    summary = `Breeding: ${maleName || 'Male'} × ${femaleName || 'Female'}`;
    if (pairing?.label) descriptionParts.push(`Project: ${pairing.label}`);
    const lockRecordedAt = event.lockDate || event.lockLoggedAt || null;
    if (event.lockObserved && lockRecordedAt) descriptionParts.push(buildLockLogLine(lockRecordedAt));
    if (event.notes) descriptionParts.push(event.notes);
  } else if (event.type === 'clutch') {
    const stageLabels = {
      ovulation: 'Ovulation observed',
      preLay: 'Pre-lay shed',
      clutch: 'Clutch laid',
      hatch: 'Hatch recorded',
    };
    summary = `${stageLabels[event.stage] || 'Clutch event'}: ${maleName || 'Male'} × ${femaleName || 'Female'}`;
    const clutchDetail = describeClutchStageDetail(event.stage, pairing);
    if (clutchDetail) descriptionParts.push(clutchDetail);
  } else if (event.type === 'activity') {
    const snake = context.snakesById?.[event.snakeId];
    const baseLabel = event.activityKey ? event.activityKey.replace(/s$/,'') : 'Activity';
    const snakeName = snake?.name || event.snakeId || '';
    summary = `${cap(baseLabel)}${snakeName ? `: ${snakeName}` : ''}`;
    const detail = describeActivityEntry(event.activityKey, event.entry);
    if (detail) descriptionParts.push(detail);
  } else {
    return null;
  }

  if (!summary) return null;

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durationDays);

  const uidParts = [
    event.type || 'event',
    event.date || '',
    event.pairingId || '',
    event.apptId || '',
    event.snakeId || '',
    event.activityKey || '',
    event.stage || ''
  ].filter(Boolean);
  const baseUid = uidParts.join('-') || `event-${formatDateToIcs(startDate)}`;

  return {
    summary,
    descriptionParts,
    description: descriptionParts.join('\n'),
    startDate,
    endDate,
    durationDays,
    uid: baseUid,
  };
}

function convertCalendarEventToIcsLines(event, context) {
  const info = prepareCalendarEventExport(event, context);
  if (!info) return null;

  const dtStart = formatDateToIcs(info.startDate);
  const dtEnd = formatDateToIcs(info.endDate);
  if (!dtStart || !dtEnd) return null;

  const uid = `${info.uid}@breeding-planner`;

  const vevent = [
    'BEGIN:VEVENT',
    `UID:${icsEscape(uid)}`,
    `DTSTAMP:${context.dtStamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${icsEscape(info.summary)}`,
  ];
  if (info.description) {
    vevent.push(`DESCRIPTION:${icsEscape(info.description)}`);
  }
  vevent.push('STATUS:CONFIRMED');
  vevent.push('END:VEVENT');
  return vevent;
}

function convertCalendarEventToGooglePayload(event, context) {
  const info = prepareCalendarEventExport(event, context);
  if (!info) return null;
  const startDate = formatDateForGoogle(info.startDate);
  const endDate = formatDateForGoogle(info.endDate);
  if (!startDate || !endDate) return null;

  const source = (() => {
    if (typeof window === 'undefined') return { title: 'Breeding Planner' };
    try {
      return { title: 'Breeding Planner', url: window.location.origin };
    } catch (err) {
      return { title: 'Breeding Planner' };
    }
  })();

  return {
    uid: info.uid,
    summary: info.summary,
    description: info.description,
    startDate,
    endDate,
    source,
    extendedProperties: {
      private: {
        breedingPlannerId: info.uid,
        breedingPlannerVersion: '1',
      },
    },
  };
}

function describeClutchStageDetail(stage, pairing) {
  if (!pairing) return '';
  if (stage === 'clutch') {
    const parts = [];
    const eggs = pairing?.clutch?.eggsTotal;
    if (typeof eggs === 'number' && Number.isFinite(eggs)) parts.push(`Eggs: ${eggs}`);
    const slugs = pairing?.clutch?.slugs;
    if (typeof slugs === 'number' && Number.isFinite(slugs)) parts.push(`Slugs: ${slugs}`);
    if (parts.length) return parts.join('\n');
    return pairing?.clutch?.notes || '';
  }
  if (stage === 'hatch') {
    const count = pairing?.hatch?.hatchedCount;
    if (typeof count === 'number' && Number.isFinite(count)) return `Hatched: ${count}`;
    return pairing?.hatch?.notes || '';
  }
  if (stage === 'preLay') {
    const interval = pairing?.preLayShed?.intervalFromOvulation;
    if (typeof interval === 'number' && Number.isFinite(interval)) {
      return `${interval} days after ovulation`;
    }
    return pairing?.preLayShed?.notes || '';
  }
  if (stage === 'ovulation') {
    return pairing?.ovulation?.notes || '';
  }
  return '';
}

function describeActivityEntry(activityKey, entry) {
  if (!entry) return '';
  const lines = [];
  if (activityKey === 'feeds') {
    const labelParts = [];
    if (entry.feed) labelParts.push(entry.feed);
    else if (entry.item) labelParts.push(entry.item);
    if (entry.size) labelParts.push(entry.size);
    if (labelParts.length) lines.push(`Item: ${labelParts.join(' ')}`);
    const weight = (typeof entry.weightGrams === 'number' && entry.weightGrams > 0)
      ? `${entry.weightGrams} g`
      : (typeof entry.grams === 'number' && entry.grams > 0 ? `${entry.grams} g` : null);
    if (weight) lines.push(`Weight: ${weight}`);
    if (entry.method) {
      const methodLine = entry.methodDetail ? `${entry.method} (${entry.methodDetail})` : entry.method;
      lines.push(`Method: ${methodLine}`);
    }
    if (entry.notes) lines.push(`Notes: ${entry.notes}`);
    return lines.join('\n');
  }

  if (activityKey === 'weights') {
    if (typeof entry.grams === 'number' && entry.grams > 0) lines.push(`Weight: ${entry.grams} g`);
    if (typeof entry.weightGrams === 'number' && entry.weightGrams > 0) lines.push(`Weight: ${entry.weightGrams} g`);
    if (entry.notes) lines.push(`Notes: ${entry.notes}`);
    return lines.join('\n');
  }

  if (activityKey === 'cleanings') {
    if (entry.deep === true) lines.push('Deep clean');
    if (entry.notes) lines.push(`Notes: ${entry.notes}`);
    return lines.join('\n');
  }

  if (activityKey === 'sheds') {
    if (entry.complete === true) lines.push('Complete shed');
    if (entry.complete === false) lines.push('Incomplete shed');
    if (entry.notes) lines.push(`Notes: ${entry.notes}`);
    return lines.join('\n');
  }

  if (activityKey === 'meds') {
    if (entry.drug) lines.push(`Drug: ${entry.drug}`);
    if (entry.dose) lines.push(`Dose: ${entry.dose}`);
    if (entry.notes) lines.push(`Notes: ${entry.notes}`);
    return lines.join('\n');
  }

  return describeGenericActivityEntry(entry);
}

function describeGenericActivityEntry(entry) {
  const lines = [];
  Object.entries(entry || {}).forEach(([key, value]) => {
    if (key === 'date' || key === 'id' || key === 'createdAt' || key === 'updatedAt') return;
    if (value === null || value === undefined || value === '') return;
    if (typeof value === 'object') return;
    lines.push(`${cap(key)}: ${value}`);
  });
  return lines.join('\n');
}

function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatDateToIcs(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function formatDateTimeUTC(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function formatDateForGoogle(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calculateInclusiveMonthSpan(startYear, startMonth, endYear, endMonth) {
  if (!Number.isFinite(startYear) || !Number.isFinite(startMonth) || !Number.isFinite(endYear) || !Number.isFinite(endMonth)) {
    return 1;
  }
  const startIndex = startYear * 12 + startMonth;
  const endIndex = endYear * 12 + endMonth;
  if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) return 1;
  const diff = endIndex - startIndex;
  return diff >= 0 ? diff + 1 : 1;
}

function computeCalendarEventBounds({ pairings = [], snakes = [] }) {
  let minDate = null;
  let maxDate = null;

  const consider = (value) => {
    if (!value) return;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return;
    dt.setHours(0, 0, 0, 0);
    if (!minDate || dt < minDate) minDate = new Date(dt);
    if (!maxDate || dt > maxDate) maxDate = new Date(dt);
  };

  (Array.isArray(pairings) ? pairings : []).forEach(rawPairing => {
    if (!rawPairing) return;
    const pairing = withPairingLifecycleDefaults({ ...rawPairing });
    (Array.isArray(pairing.appointments) ? pairing.appointments : []).forEach(appt => consider(appt?.date));
    consider(pairing?.ovulation?.date);
    consider(pairing?.preLayShed?.date);
    consider(pairing?.clutch?.date);
    consider(pairing?.hatch?.date);
    consider(pairing?.hatch?.scheduledDate);
  });

  (Array.isArray(snakes) ? snakes : []).forEach(snake => {
    if (!snake || !snake.logs) return;
    ['feeds', 'weights', 'sheds', 'cleanings', 'meds'].forEach(key => {
      const entries = Array.isArray(snake.logs[key]) ? snake.logs[key] : [];
      entries.forEach(entry => consider(entry?.date));
    });
  });

  return { start: minDate, end: maxDate };
}

// calendar helpers
function daysInMonth(year, month) { return new Date(year, month+1, 0).getDate(); }
function ymd(year, month, day) { return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; }
function buildMonthGrid(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const dim = daysInMonth(year, month);
  const prevMonth = month - 1;
  const prevYear = prevMonth < 0 ? year - 1 : year;
  const prevDim = daysInMonth(prevYear, (prevMonth+12)%12);
  const cells = [];
  for (let i=0; i<firstWeekday; i++) cells.push({ year: prevYear, month: (prevMonth+12)%12, day: prevDim - firstWeekday + 1 + i, current:false });
  for (let d=1; d<=dim; d++) cells.push({ year, month, day: d, current:true });
  const nextMonth = (month+1)%12; const nextYear = nextMonth===0?year+1:year;
  while (cells.length % 7) cells.push({ year: nextYear, month: nextMonth, day: cells.length%7, current:false });
  return cells;
}

// robust male color index: accepts undefined/null and non-string ids
function maleColorIdx(id) {
  const s = (typeof id === 'string' || typeof id === 'number') ? String(id) : '';
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}
function maleColorTokens(id, theme='blue') {
  const hash = maleColorIdx(id);
  const hue = hash % 360;
  const saturation = theme === 'dark' ? 55 : 62;
  const dotLightness = theme === 'dark' ? 55 : 45;
  const borderLightness = theme === 'dark' ? 38 : 50;
  const fillLightness = theme === 'dark' ? 22 : 92;
  const fillAlpha = theme === 'dark' ? 0.35 : 0.25;

  return {
    border: `hsl(${hue}, ${saturation}%, ${borderLightness}%)`,
    dot: `hsl(${hue}, ${saturation}%, ${dotLightness}%)`,
    fill: `hsla(${hue}, ${saturation}%, ${fillLightness}%, ${fillAlpha})`,
  };
}

// activity color palette (used for activity badges and calendar dots)
// activity palettes: using explicit hex colors provided by the user
const activityPalettes = {
  feeds: { bg: '#9EB7B8', border: '#9EB7B8' }, // Teal faded 50%
  weights: { bg: '#BBC7B4', border: '#BBC7B4' }, // Muted Green faded 50%
  cleanings: { bg: '#E6B6A0', border: '#E6B6A0' }, // Muted Orange faded 50%
  sheds: { bg: '#ECD1A5', border: '#ECD1A5' }, // Mustard Yellow faded 50%
  meds: { bg: '#DCAD9A', border: '#DCAD9A' }, // Terracotta faded 50%
  groups: { bg: '#FAF5EE', border: '#FAF5EE' }, // Light Beige faded 50%
  pairing: { bg: '#ECB5CE', border: '#ECB5CE' }, // dark oink faded 50%
};

// gene groups database
const HET_GENE_COLOR_CLASSES = 'bg-violet-200 border border-violet-300 text-violet-800';
const SUPER_CODOMINANT_GENE_COLOR_CLASSES = 'bg-rose-500 border border-rose-600 text-white shadow-inner';

const GENE_GROUP_COLOR_CLASSES = {
  'SuperCodominant': SUPER_CODOMINANT_GENE_COLOR_CLASSES,
  'Het': HET_GENE_COLOR_CLASSES,
  'Recessive': 'bg-violet-300 border border-violet-400',
  'Incomplete Dominant': 'bg-rose-300 border border-rose-400',
  'Dominant': 'bg-sky-300 border border-sky-400',
  'Other': 'bg-emerald-300 border border-emerald-400'
};

function getGeneChipClasses(gene, displayGroup, isSuper = false) {
  if (isHetGeneToken(gene)) {
    return GENE_GROUP_COLOR_CLASSES.Het;
  }
  if (isSuper) {
    return SUPER_CODOMINANT_GENE_COLOR_CLASSES;
  }
  const group = displayGroup || getGeneDisplayGroup(gene);
  return GENE_GROUP_COLOR_CLASSES[group] || GENE_GROUP_COLOR_CLASSES.Other;
}

const GENE_LEGEND_ITEMS = [
  { key: 'Recessive', label: 'Recessive' },
  { key: 'Het', label: 'Het / Possible Het' },
  { key: 'SuperCodominant', label: 'Super (homozygous co-dom)' },
  { key: 'Incomplete Dominant', label: 'Incomplete Dominant' },
  { key: 'Dominant', label: 'Dominant' },
  { key: 'Other', label: 'Other / Polygenic' }
];

const GENE_LINE_SIZE_STYLES = {
  sm: { container: 'text-[11px]', label: 'text-[10px]', chip: 'text-[11px] px-2 py-0.5' },
  md: { container: 'text-sm', label: 'text-[11px]', chip: 'text-xs px-2 py-0.5' },
  xs: { container: 'text-[10px]', label: 'text-[9px]', chip: 'text-[10px] px-1.5 py-0.5' }
};

function GeneLine({ label, genes = [], size = 'sm', className }) {
  const list = Array.isArray(genes) ? genes.filter(Boolean) : [];
  if (!list.length) return null;
  const styles = GENE_LINE_SIZE_STYLES[size] || GENE_LINE_SIZE_STYLES.sm;
  return (
    <div className={cx('flex flex-wrap items-center gap-1 leading-snug', styles.container, className)}>
      <span className={cx('uppercase tracking-wide text-neutral-500 mr-1', styles.label)}>{label}:</span>
      {list.map((gene, idx) => {
        const rawGroup = getGeneDisplayGroup(gene);
        const superInfo = getSuperGeneInfo(gene);
        const isSuper = isSuperCodominantGeneToken(gene, rawGroup, superInfo);
        const displayGroup = isSuper ? 'Incomplete Dominant' : rawGroup;
        const chipClasses = getGeneChipClasses(gene, displayGroup, isSuper);
        const chipTitle = isSuper && superInfo?.base
          ? `Homozygous (Super) expression of ${superInfo.base}`
          : undefined;
        return (
          <span
            key={`${label}-${gene}-${idx}`}
            className={cx('inline-flex items-center rounded-md border font-medium break-words', styles.chip, chipClasses)}
            title={chipTitle}
          >
            {gene}
          </span>
        );
      })}
    </div>
  );
}

function GeneLegend({ className }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-center gap-3 text-[11px] font-normal', className)}>
      {GENE_LEGEND_ITEMS.map(item => (
        <div key={item.key} className="flex items-center gap-1">
          <span className={cx('inline-block h-3 w-3 rounded-sm', GENE_GROUP_COLOR_CLASSES[item.key])}></span>
          <span className="text-neutral-600 whitespace-nowrap">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ScrollToTopButton({ theme = 'blue', className }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 200);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal((
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={cx(
        'fixed bottom-6 right-6 z-[9990] rounded-full shadow-lg border backdrop-blur-sm transition-opacity duration-200 flex items-center justify-center h-12 w-12 text-white',
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        primaryBtnClass(theme, true),
        className
      )}
      aria-label="Scroll to top"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5" />
        <path d="m6 11 6-6 6 6" />
      </svg>
    </button>
  ), document.body);
}

function addDaysYmd(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}










