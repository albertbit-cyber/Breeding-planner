import React, { useState, useEffect, useCallback } from 'react';
import { useFamilyTreeData } from './hooks/useFamilyTreeData';
import FamilyTreeCanvas from './components/FamilyTreeCanvas';
import SelectedSnakePanel from './components/SelectedSnakePanel';
import PedigreePassportPanel from './components/PedigreePassportPanel';
import ViewTabs from './components/ViewTabs';
import StatsBar from './components/StatsBar';
import { buildTreeGraph } from './utils/buildTreeGraph';
import './familyTree.css';

const ComingSoonCanvas = ({ label }) => (
  <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-violet-50/40">
    <div className="text-5xl opacity-20">🌳</div>
    <div className="text-sm font-semibold text-neutral-400">{label} — coming soon</div>
    <div className="text-xs text-neutral-300 text-center max-w-xs">
      This view will display the pedigree in a different layout. Switch back to Tree View to explore the interactive graph.
    </div>
  </div>
);

const normalizeSex = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'M' || normalized === 'MALE') return 'male';
  if (normalized === 'F' || normalized === 'FEMALE') return 'female';
  return 'unknown';
};

const toGeneticsList = (snake) => [
  ...(Array.isArray(snake?.morphs) ? snake.morphs : []),
  ...(Array.isArray(snake?.hets) ? snake.hets.map((entry) => /^het\b/i.test(String(entry)) ? entry : `het ${entry}`) : []),
  ...(Array.isArray(snake?.possibleHets) ? snake.possibleHets.map((entry) => /^possible/i.test(String(entry)) ? entry : `possible het ${entry}`) : []),
].map((entry) => String(entry || '').trim()).filter(Boolean);

const toFamilyTreeSnake = (snake) => ({
  id: snake?.id,
  globalId: snake?.globalId || null,
  localId: snake?.id,
  name: snake?.name || snake?.id || 'Unnamed',
  species: snake?.species || null,
  sex: normalizeSex(snake?.sex),
  genetics: toGeneticsList(snake),
  breederId: snake?.breederId || 'local',
  breederName: snake?.breederName || null,
  currentOwnerId: snake?.ownerId || 'local',
  clutchId: snake?.clutchId || null,
  hatchlingIndex: snake?.hatchlingIndex || snake?.metadata?.hatchlingIndex || null,
  hatchDate: snake?.hatchDate || snake?.birthDate || (snake?.year ? String(snake.year) : null),
  status: snake?.status || (Array.isArray(snake?.tags) ? snake.tags[0] : null),
  privacyLevel: 'private',
  photoUrl: snake?.photoUrl || snake?.imageUrl || null,
});

const normalizeNameKey = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const normalizeLooseNameKey = (value) => normalizeNameKey(value).replace(/[^a-z0-9]/g, '');

const getYearFromTwoDigitPrefix = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed >= 70 ? 1900 + parsed : 2000 + parsed;
};

const parseParentNamesFromAnimalName = (name) => {
  const text = String(name || '').trim();
  if (!text) return null;
  let working = text.replace(/\s+/g, ' ').trim();
  let hatchYear = null;
  let hatchlingIndex = null;

  const leadingYear = working.match(/^(\d{2})(?=[A-Za-z])/);
  if (leadingYear) {
    hatchYear = getYearFromTwoDigitPrefix(leadingYear[1]);
    working = working.slice(leadingYear[1].length).trim();
  } else {
    const spacedYear = working.match(/^(\d{2}|\d{4})\s+/);
    if (spacedYear) {
      hatchYear = spacedYear[1].length === 2
        ? getYearFromTwoDigitPrefix(spacedYear[1])
        : Number(spacedYear[1]);
      working = working.slice(spacedYear[0].length).trim();
    }
  }

  const trailingIndex = working.match(/(?:[-#]\s*|\s+)(\d{1,3})$/);
  if (trailingIndex) {
    hatchlingIndex = Number(trailingIndex[1]);
    working = working.slice(0, trailingIndex.index).trim();
  }

  const delimiterMatch = working.match(/\s+[xX]\s+|\s*X\s*/);
  if (delimiterMatch) {
    const sireName = working.slice(0, delimiterMatch.index).trim();
    const damName = working.slice(delimiterMatch.index + delimiterMatch[0].length).trim();
    if (sireName && damName) {
      return {
        sireName,
        damName,
        hatchYear,
        hatchlingIndex,
        clutchId: buildClutchId(damName, sireName, hatchYear),
      };
    }
  }
  const parts = text.split(/\s+[xX]\s+|\s*[×✕]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    sireName: parts[0],
    damName: parts[1],
  };
};

const isBreederGroupSnake = (snake) => (
  Array.isArray(snake?.groups)
    ? snake.groups.some((group) => /^breeders?$/i.test(String(group || '').trim()))
    : false
);

// True when a name follows the "Sire x Dam N" hatchling pattern.
// Used to exclude clutch offspring from being treated as potential parents.
const isHatchlingName = (name) => !!parseParentNamesFromAnimalName(name);

const hasNameToken = (childName, parentName) => {
  const child = normalizeNameKey(childName);
  const parent = normalizeNameKey(parentName);
  if (!child || !parent || parent.length < 3) return false;
  const escaped = parent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(child);
};

const levenshteinDistance = (a, b) => {
  const left = normalizeLooseNameKey(a);
  const right = normalizeLooseNameKey(b);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let prevDiagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const temp = previous[j];
      previous[j] = left[i - 1] === right[j - 1]
        ? prevDiagonal
        : Math.min(previous[j - 1] + 1, previous[j] + 1, prevDiagonal + 1);
      prevDiagonal = temp;
    }
  }
  return previous[right.length];
};

const isLooseNameMatch = (candidateName, targetName) => {
  const candidate = normalizeLooseNameKey(candidateName);
  const target = normalizeLooseNameKey(targetName);
  if (!candidate || !target) return false;
  if (candidate === target) return true;
  if (candidate.length >= 3 && target.length >= 3 && (candidate.startsWith(target) || target.startsWith(candidate))) return true;
  return Math.max(candidate.length, target.length) >= 4 && levenshteinDistance(candidate, target) <= 1;
};

const findLocalParentByName = (snakes, name, preferredSex, selectedSnakeId) => {
  const target = normalizeNameKey(name);
  if (!target) return null;
  const matches = snakes.filter((snake) => (
    snake?.id !== selectedSnakeId
    && !isHatchlingName(snake?.name)  // clutch offspring cannot be parents
    && (
      normalizeNameKey(snake?.name) === target
      || hasNameToken(name, snake?.name)
      || hasNameToken(snake?.name, name)
      || isLooseNameMatch(snake?.name, name)
    )
  ));
  if (!matches.length) return null;
  // Prefer: exact name + right sex → exact name → right sex → first match
  const exactMatch = matches.find((snake) => normalizeNameKey(snake?.name) === target);
  if (exactMatch && normalizeSex(exactMatch?.sex) === preferredSex) return exactMatch;
  const preferred = matches.find((snake) => normalizeSex(snake?.sex) === preferredSex);
  return exactMatch || preferred || matches[0];
};

const inferParentsForLocalSnake = (child, snakes) => {
  if (!child) return { sire: null, dam: null };

  const byId = new Map(snakes.map((snake) => [snake?.id, snake]).filter(([id]) => !!id));
  let sire = child.sireId ? byId.get(child.sireId) || null : null;
  let dam = child.damId ? byId.get(child.damId) || null : null;

  const parsed = parseParentNamesFromAnimalName(child.name);
  if (parsed) {
    sire = sire || findLocalParentByName(snakes, parsed.sireName, 'male', child.id);
    dam = dam || findLocalParentByName(snakes, parsed.damName, 'female', child.id);
  }

  if (!sire || !dam) {
    const childNameKey = normalizeNameKey(child.name);
    const breederCandidates = snakes
      .filter((snake) => snake?.id !== child.id && isBreederGroupSnake(snake) && hasNameToken(child.name, snake.name))
      .sort((a, b) => childNameKey.indexOf(normalizeNameKey(a.name)) - childNameKey.indexOf(normalizeNameKey(b.name)));

    for (const candidate of breederCandidates) {
      const sex = normalizeSex(candidate.sex);
      if (!sire && sex === 'male') sire = candidate;
      if (!dam && sex === 'female') dam = candidate;
    }

    if ((!sire || !dam) && breederCandidates.length >= 2) {
      sire = sire || breederCandidates[0];
      dam = dam || breederCandidates.find((candidate) => candidate.id !== sire?.id) || null;
    } else if (!sire && !dam && breederCandidates.length === 1) {
      const only = breederCandidates[0];
      if (normalizeSex(only.sex) === 'female') dam = only;
      else sire = only;
    }
  }

  return {
    sire,
    dam,
    clutchId: parsed?.clutchId || null,
    hatchYear: parsed?.hatchYear || null,
    hatchlingIndex: parsed?.hatchlingIndex || null,
  };
};

const getPairingEggCount = (pairing) => {
  const clutch = pairing?.clutch && typeof pairing.clutch === 'object' ? pairing.clutch : {};
  const candidates = [
    clutch.fertileEggs,
    clutch.eggsTotal,
    clutch.eggCount,
    pairing?.eggsTotal,
    pairing?.eggCount,
  ];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(Math.floor(parsed), 80);
  }
  return 0;
};

// Canonical human-readable Clutch ID: "FemaleName x MaleName Year"
const buildClutchId = (femaleName, maleName, year) => {
  const names = [femaleName, maleName].filter(Boolean).join(' x ');
  return (names && year) ? `${names} ${year}` : names || null;
};

// Sum bad-egg counts recorded per egg-box slot (clutch.eggBoxBadEggs map)
const getPairingBadEggCount = (pairing) => {
  const eggBoxBadEggs = pairing?.clutch?.eggBoxBadEggs;
  if (!eggBoxBadEggs || typeof eggBoxBadEggs !== 'object') return 0;
  return Object.values(eggBoxBadEggs)
    .reduce((sum, n) => sum + (Math.floor(Number(n)) || 0), 0);
};

const buildVirtualEggSnake = ({ pairing, index, sire, dam }) => {
  const clutchYear = (pairing?.clutch?.date || pairing?.startDate || '').slice(0, 4) || null;
  return {
  id: `local-clutch-${pairing?.id || `${sire?.id || 'sire'}-${dam?.id || 'dam'}`}-egg-${index + 1}`,
  globalId: null,
  localId: `egg-${index + 1}`,
  name: `Egg ${index + 1} - ${(sire?.name || 'Sire')} x ${(dam?.name || 'Dam')}`,
  species: null,
  sex: 'unknown',
  genetics: [],
  breederId: 'local',
  breederName: null,
  currentOwnerId: 'local',
  clutchId: buildClutchId(dam?.name, sire?.name, clutchYear) || pairing?.id || null,
  hatchlingIndex: index + 1,
  hatchDate: pairing?.clutch?.date || pairing?.startDate || null,
  status: 'egg',
  privacyLevel: 'private',
  photoUrl: null,
  };
};

const getLocalClutchId = (snake) => (
  snake?.clutchId
  || snake?.pairingId
  || snake?.metadata?.clutchId
  || snake?.metadata?.pairingId
  || null
);

const buildInferredLocalPedigree = (snakes, selectedSnakeId, pairings = []) => {
  const selectedLocal = snakes.find((snake) => snake?.id === selectedSnakeId) || snakes[0] || null;
  if (!selectedLocal) {
    return {
      selectedSnake: null,
      parents: { sire: null, dam: null },
      offspring: [],
      graph: { snakes: [], relationships: [] },
    };
  }

  const selectedFamilySnake = toFamilyTreeSnake(selectedLocal);
  const selectedInference = inferParentsForLocalSnake(selectedLocal, snakes);
  const { sire: localSire, dam: localDam } = selectedInference;
  if (selectedInference.clutchId) selectedFamilySnake.clutchId = selectedInference.clutchId;
  if (Number.isFinite(Number(selectedInference.hatchlingIndex))) {
    selectedFamilySnake.hatchlingIndex = Number(selectedInference.hatchlingIndex);
  }
  const offspringLocal = snakes.filter((candidate) => {
    if (!candidate || candidate.id === selectedLocal.id) return false;
    const inferred = inferParentsForLocalSnake(candidate, snakes);
    return inferred.sire?.id === selectedLocal.id || inferred.dam?.id === selectedLocal.id;
  });

  const familySnakesById = new Map([[selectedFamilySnake.id, selectedFamilySnake]]);
  const relationships = [];
  const addSnake = (snake) => {
    if (!snake?.id || familySnakesById.has(snake.id)) return familySnakesById.get(snake?.id) || null;
    const familySnake = toFamilyTreeSnake(snake);
    familySnakesById.set(familySnake.id, familySnake);
    return familySnake;
  };

  const sire = localSire ? addSnake(localSire) : null;
  const dam = localDam ? addSnake(localDam) : null;

  if (sire) {
    relationships.push({
      id: `local-name-sire-${selectedFamilySnake.id}`,
      childId: selectedFamilySnake.id,
      parentId: sire.id,
      role: 'sire',
      confidence: 'inferred',
      clutchId: selectedFamilySnake.clutchId || null,
    });
  }
  if (dam) {
    relationships.push({
      id: `local-name-dam-${selectedFamilySnake.id}`,
      childId: selectedFamilySnake.id,
      parentId: dam.id,
      role: 'dam',
      confidence: 'inferred',
      clutchId: selectedFamilySnake.clutchId || null,
    });
  }

  // Add siblings — other snakes that parse to the same clutchId (same sire x dam pair)
  if (sire && dam && selectedInference.clutchId) {
    const siblings = snakes.filter((snake) => {
      if (!snake || snake.id === selectedLocal.id) return false;
      const parsed = parseParentNamesFromAnimalName(snake.name);
      return parsed?.clutchId === selectedInference.clutchId;
    });
    for (const sibling of siblings) {
      const sibFamilySnake = addSnake(sibling);
      if (!sibFamilySnake) continue;
      const parsed = parseParentNamesFromAnimalName(sibling.name);
      if (parsed?.clutchId) sibFamilySnake.clutchId = parsed.clutchId;
      if (Number.isFinite(Number(parsed?.hatchlingIndex))) {
        sibFamilySnake.hatchlingIndex = Number(parsed.hatchlingIndex);
      }
      relationships.push({
        id: `local-name-sire-${sibFamilySnake.id}`,
        childId: sibFamilySnake.id,
        parentId: sire.id,
        role: 'sire',
        confidence: 'inferred',
        clutchId: selectedFamilySnake.clutchId || null,
      });
      relationships.push({
        id: `local-name-dam-${sibFamilySnake.id}`,
        childId: sibFamilySnake.id,
        parentId: dam.id,
        role: 'dam',
        confidence: 'inferred',
        clutchId: selectedFamilySnake.clutchId || null,
      });
    }
  }

  const offspring = offspringLocal.map((child) => {
    const childFamilySnake = addSnake(child);
    const inferred = inferParentsForLocalSnake(child, snakes);
    const clutchId = getLocalClutchId(child) || inferred.clutchId;
    if (!childFamilySnake) return null;
    if (clutchId) childFamilySnake.clutchId = clutchId;
    if (Number.isFinite(Number(inferred.hatchlingIndex))) {
      childFamilySnake.hatchlingIndex = Number(inferred.hatchlingIndex);
    }

    if (inferred.sire?.id && inferred.sire.id !== selectedLocal.id) {
      const coParent = addSnake(inferred.sire);
      if (coParent) {
        relationships.push({
          id: `local-name-coparent-sire-${childFamilySnake.id}`,
          childId: childFamilySnake.id,
          parentId: coParent.id,
          role: 'sire',
          confidence: 'inferred',
          clutchId,
        });
      }
    }
    if (inferred.dam?.id && inferred.dam.id !== selectedLocal.id) {
      const coParent = addSnake(inferred.dam);
      if (coParent) {
        relationships.push({
          id: `local-name-coparent-dam-${childFamilySnake.id}`,
          childId: childFamilySnake.id,
          parentId: coParent.id,
          role: 'dam',
          confidence: 'inferred',
          clutchId,
        });
      }
    }

    relationships.push({
      id: `local-name-offspring-${selectedFamilySnake.id}-${childFamilySnake.id}`,
      childId: childFamilySnake.id,
      parentId: selectedFamilySnake.id,
      role: inferred.sire?.id === selectedLocal.id ? 'sire' : 'dam',
      confidence: 'inferred',
      clutchId,
    });
    return childFamilySnake;
  }).filter(Boolean);

  const selectedPairings = Array.isArray(pairings)
    ? pairings.filter((pairing) => pairing?.maleId === selectedLocal.id || pairing?.femaleId === selectedLocal.id)
    : [];

  for (const pairing of selectedPairings) {
    const sireLocal = snakes.find((snake) => snake?.id === pairing.maleId) || null;
    const damLocal = snakes.find((snake) => snake?.id === pairing.femaleId) || null;
    if (!sireLocal || !damLocal) continue;
    const sireNode = addSnake(sireLocal);
    const damNode = addSnake(damLocal);
    const eggCount    = getPairingEggCount(pairing);
    const badEggCount = getPairingBadEggCount(pairing);
    const goodEggs    = Math.max(0, eggCount - badEggCount);
    const clutchYear  = (pairing?.clutch?.date || pairing?.startDate || '').slice(0, 4) || null;
    const clutchId    = buildClutchId(damLocal?.name, sireLocal?.name, clutchYear) || pairing?.id || null;
    if (!sireNode || !damNode || goodEggs <= 0) continue;

    for (let index = 0; index < goodEggs; index += 1) {
      const egg = buildVirtualEggSnake({ pairing, index, sire: sireNode, dam: damNode });
      if (familySnakesById.has(egg.id)) continue;
      familySnakesById.set(egg.id, egg);
      relationships.push({
        id: `local-pairing-sire-${egg.id}`,
        childId: egg.id,
        parentId: sireNode.id,
        role: 'sire',
        confidence: 'inferred',
        clutchId,
      });
      relationships.push({
        id: `local-pairing-dam-${egg.id}`,
        childId: egg.id,
        parentId: damNode.id,
        role: 'dam',
        confidence: 'inferred',
        clutchId,
      });
    }
  }

  return {
    selectedSnake: selectedFamilySnake,
    parents: { sire, dam },
    offspring,
    graph: {
      snakes: Array.from(familySnakesById.values()),
      relationships,
    },
  };
};

const FamilyTreePage = ({ snakes = [], pairings = [], focusSnakeId = null }) => {
  const [selectedSnakeId, setSelectedSnakeId] = useState(() => focusSnakeId || snakes[0]?.id || null);
  const [activeView, setActiveView] = useState('tree');

  useEffect(() => {
    if (focusSnakeId && focusSnakeId !== selectedSnakeId) {
      setSelectedSnakeId(focusSnakeId);
    }
  }, [focusSnakeId, selectedSnakeId]);

  useEffect(() => {
    if (snakes.length && !selectedSnakeId) {
      setSelectedSnakeId(snakes[0].id);
    }
  }, [snakes, selectedSnakeId]);

  const {
    loading,
    error,
    stats,
    selectedSnake,
    snakeParents,
    snakeOffspring,
    snakeClutches,
    snakeOwnershipHistory,
    nodes,
    edges,
  } = useFamilyTreeData({ selectedSnakeId });

  const inferredLocalPedigree = React.useMemo(
    () => buildInferredLocalPedigree(snakes, selectedSnakeId, pairings),
    [pairings, selectedSnakeId, snakes]
  );
  const fallbackSelectedSnake = inferredLocalPedigree.selectedSnake;
  const displaySnake = selectedSnake || fallbackSelectedSnake;
  const displayParents = selectedSnake ? snakeParents : inferredLocalPedigree.parents;
  const displayOffspring = selectedSnake ? snakeOffspring : inferredLocalPedigree.offspring;
  const displayClutches = selectedSnake ? snakeClutches : [];
  const displayOwnershipHistory = selectedSnake ? snakeOwnershipHistory : [];
  const displayGraph = React.useMemo(() => {
    if (nodes.length) return { nodes, edges };
    if (!fallbackSelectedSnake) return { nodes: [], edges: [] };
    return buildTreeGraph({
      snakes: inferredLocalPedigree.graph.snakes,
      relationships: inferredLocalPedigree.graph.relationships,
      selectedSnakeId: fallbackSelectedSnake.id,
    });
  }, [edges, fallbackSelectedSnake, inferredLocalPedigree.graph.relationships, inferredLocalPedigree.graph.snakes, nodes]);
  const blockingError = error && !fallbackSelectedSnake ? error : null;

  const handleSnakeClick = useCallback((snake) => {
    setSelectedSnakeId(snake.id);
  }, []);

  const handleSnakeSelect = useCallback((snake) => {
    setSelectedSnakeId(snake.id);
  }, []);

  const noAnimals = !snakes.length;

  return (
    <div className="ft-page">
      <div className="ft-header">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-base flex-shrink-0 shadow-sm"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}
          >
            🌳
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-neutral-900 leading-tight">Family Tree</div>
            <div className="text-[11px] text-violet-500 font-medium">
              Interactive pedigree graph
              {displaySnake && ` · ${displaySnake.name}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="rounded-full bg-violet-100 border border-violet-200 text-violet-700 text-[11px] font-semibold px-3 py-1">
            {snakes.length} animal{snakes.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="ft-body">
        <div className="ft-left-col border-r border-violet-100">
          <SelectedSnakePanel
            snake={displaySnake}
            parents={displayParents}
            allSnakes={snakes}
            onSnakeSelect={handleSnakeSelect}
          />
        </div>

        <div className="ft-center-col">
          <ViewTabs activeTab={activeView} onTabChange={setActiveView} />

          <div className="ft-canvas-area">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <div className="text-sm text-neutral-400 animate-pulse">Building pedigree graph...</div>
              </div>
            )}

            {blockingError && (
              <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {blockingError}
              </div>
            )}

            {!loading && !blockingError && noAnimals && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-neutral-400">
                <div className="text-5xl opacity-20">🐍</div>
                <div className="text-sm font-semibold">No animals found</div>
                <div className="text-xs text-center max-w-xs">
                  Add animals in the Animals tab to start building your family tree.
                </div>
              </div>
            )}

            {!loading && !blockingError && !noAnimals && activeView === 'tree' && (
              <FamilyTreeCanvas
                nodes={displayGraph.nodes}
                edges={displayGraph.edges}
                onSnakeClick={handleSnakeClick}
              />
            )}

            {!loading && !blockingError && !noAnimals && activeView !== 'tree' && (
              <ComingSoonCanvas
                label={
                  activeView === 'horizontal' ? 'Horizontal View' :
                  activeView === 'descendants' ? 'Descendants View' :
                  activeView === 'clutch' ? 'Clutch View' :
                  activeView === 'universe' ? 'Universe View' :
                  'View'
                }
              />
            )}
          </div>
        </div>

        <div className="ft-right-col border-l border-violet-100">
          <PedigreePassportPanel
            snake={displaySnake}
            parents={displayParents}
            offspring={displayOffspring}
            clutches={displayClutches}
            ownershipHistory={displayOwnershipHistory}
          />
        </div>
      </div>

      <StatsBar stats={stats} />
    </div>
  );
};

export default FamilyTreePage;
