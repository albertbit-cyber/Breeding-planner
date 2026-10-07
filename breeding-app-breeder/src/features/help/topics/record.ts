import { topic } from '../helpTypes';

// The animal record, adding and importing animals, and selling.
export const record = {
  // The edit window: header and its actions.
  'record-window': topic('animal-record', { see: ['record-save', 'record-cancel', 'saving'] }),
  'record-save': topic('animal-record', { title: 'common:actions.saveChanges', see: ['record-cancel', 'record-window', 'sell-for-sale'] }),
  'record-cancel': topic('animal-record', { title: 'common:actions.cancel', see: ['record-save', 'record-window'] }),
  'record-delete': topic('animal-record', { title: 'common:actions.delete', see: ['record-delete-dialog', 'record-save'] }),
  'record-family-tree': topic('animal-record', { title: 'common:actions.openFamilyTree', see: ['record-parentage', 'nav-family-tree', 'record-save'] }),
  'record-export-pdf': topic('animal-record', { title: 'common:actions.exportPdf', see: ['record-qr-label', 'record-window'] }),
  'record-qr-label': topic('animal-record', { title: 'common:actions.qrLabel', see: ['record-id', 'record-export-pdf'] }),

  // Basics.
  'record-status': topic('animal-record', { title: 'common:snakeEdit.tag', see: ['concept-status-vs-group', 'record-status-add', 'record-status-delete'] }),
  'record-status-add': topic('animal-record', { title: 'common:snakeEdit.addTag', see: ['record-status', 'record-status-delete'], minor: true }),
  'record-status-delete': topic('animal-record', { title: 'common:snakeEdit.deleteTag', see: ['record-status', 'record-status-add'], minor: true }),
  'record-name': topic('animal-record', { title: 'common:snakeEdit.name', see: ['record-parentage', 'record-id'], minor: true }),
  'record-id': topic('animal-record', { title: 'common:snakeEdit.id', see: ['record-generate-id', 'record-update-id', 'record-sex'], minor: true }),
  'record-generate-id': topic('animal-record', { title: 'common:snakeEdit.generateId', see: ['record-update-id', 'record-id'], minor: true }),
  'record-update-id': topic('animal-record', { title: 'common:snakeEdit.updateId', see: ['record-generate-id', 'record-id'], minor: true }),
  'record-sex': topic('animal-record', { title: 'common:snakeEdit.sex', see: ['record-id', 'record-parentage'], minor: true }),
  'record-species': topic('animal-record', { title: 'common:snakeEdit.species', see: ['record-genetics', 'add-species-backfill'], minor: true }),
  'record-birth-date': topic('animal-record', { title: 'common:snakeEdit.birthDate', see: ['record-generate-id'], minor: true }),
  'record-genetics': topic('animal-record', {
    title: 'common:snakeEdit.genetics',
    see: ['concept-morph', 'concept-het', 'concept-possible-het', 'concept-visual', 'concept-super'],
  }),
  'record-weight': topic('animal-record', { title: 'common:snakeEdit.weight', see: ['record-weights'], minor: true }),

  // Feed Cycle.
  'record-feed-cycle': topic('animal-record', { title: 'common:feedPrep.profileTitle', see: ['record-feed-interval', 'record-feeds', 'nav-feed-prep'] }),
  'record-feed-type': topic('animal-record', { title: 'common:feedPrep.foodType', see: ['record-feed-cycle', 'record-feed-size'], minor: true }),
  'record-feed-size': topic('animal-record', { title: 'common:feedPrep.sizeClass', see: ['record-feed-cycle', 'record-feed-weight'], minor: true }),
  'record-feed-weight': topic('animal-record', { title: 'common:feedPrep.weightGrams', see: ['record-feed-cycle', 'record-feed-size'], minor: true }),
  'record-feed-quantity': topic('animal-record', { title: 'common:feedPrep.quantity', see: ['record-feed-cycle'], minor: true }),
  'record-feed-interval': topic('animal-record', { title: 'common:feedPrep.intervalDays', see: ['record-feed-cycle', 'record-feeds', 'nav-calendar'], minor: true }),
  'record-feed-notes': topic('animal-record', { title: 'common:feedPrep.notes', see: ['record-feed-cycle'], minor: true }),

  // Group.
  'record-group': topic('animal-record', { title: 'common:snakeEdit.group', see: ['concept-status-vs-group', 'record-add-group'] }),
  'record-add-group': topic('animal-record', { title: 'common:groups.addGroupPlaceholder', see: ['record-group', 'concept-status-vs-group'], minor: true }),

  // Photos.
  'record-photo-take': topic('animal-record', { title: 'common:snakeEdit.image.take', see: ['record-photo-upload', 'record-photo-view'], minor: true }),
  'record-photo-upload': topic('animal-record', { title: 'common:snakeEdit.image.upload', see: ['record-photo-take', 'record-photo-view'], minor: true }),
  'record-photo-view': topic('animal-record', { title: 'common:snakeEdit.image.view', see: ['record-gallery', 'record-photo-clear'], minor: true }),
  'record-photo-clear': topic('animal-record', { title: 'common:snakeEdit.image.clear', see: ['record-gallery-set-cover', 'record-photo-view'], minor: true }),

  // The photo window.
  'record-gallery': topic('animal-record', { see: ['record-gallery-set-cover', 'record-gallery-remove', 'record-photo-upload'] }),
  'record-gallery-close': topic('animal-record', { title: 'common:common.close', see: ['record-gallery'], minor: true }),
  'record-gallery-open': topic('animal-record', { title: 'common:actions.open', see: ['record-gallery'], minor: true }),
  'record-gallery-set-cover': topic('animal-record', { title: 'common:photoGallery.setAsCover', see: ['record-gallery', 'record-photo-clear'], minor: true }),
  'record-gallery-remove': topic('animal-record', { title: 'common:common.remove', see: ['record-gallery', 'record-gallery-set-cover'], minor: true }),

  // Parentage.
  'record-parentage': topic('animal-record', { title: 'common:snakeEdit.parentage.title', see: ['record-clutch', 'record-dam', 'record-sire', 'record-family-tree'] }),
  'record-clutch': topic('animal-record', { title: 'common:snakeEdit.parentage.clutch', see: ['record-parentage', 'record-dam', 'record-sire'], minor: true }),
  'record-dam': topic('animal-record', { title: 'common:snakeEdit.parentage.dam', see: ['record-parentage', 'record-sire'], minor: true }),
  'record-sire': topic('animal-record', { title: 'common:snakeEdit.parentage.sire', see: ['record-parentage', 'record-dam'], minor: true }),

  'record-pairing-overview': topic('animal-record', { title: 'common:snakeEdit.pairingOverview', see: ['nav-pairings', 'record-parentage'] }),

  // Logs.
  'record-logs': topic('animal-record', { title: 'common:snakeEdit.logsTitle', see: ['record-feeds', 'record-weights', 'record-log-add', 'record-log-delete'] }),
  'record-log-add': topic('animal-record', { title: 'common:logs.addEntry', see: ['record-logs', 'record-log-delete'], minor: true }),
  'record-log-delete': topic('animal-record', { title: 'common:actions.delete', see: ['record-logs', 'record-save'], minor: true }),
  'record-feeds': topic('animal-record', { title: 'common:logs.feeds', see: ['record-mark-refused', 'record-feed-interval', 'record-log-add'] }),
  'record-mark-refused': topic('animal-record', { title: 'common:logs.markRefused', see: ['record-feeds', 'record-undo-refused'], minor: true }),
  'record-undo-refused': topic('animal-record', { title: 'common:logs.undoRefused', see: ['record-feeds', 'record-mark-refused'], minor: true }),
  'record-weights': topic('animal-record', { title: 'common:logs.weights', see: ['record-weight', 'record-log-add'] }),
  'record-sheds': topic('animal-record', { title: 'common:logs.sheds', see: ['record-logs', 'record-log-add'] }),
  'record-cleanings': topic('animal-record', { title: 'common:logs.cleanings', see: ['record-logs', 'record-log-add'] }),
  'record-meds': topic('animal-record', { title: 'common:logs.meds', see: ['record-logs', 'record-log-add'] }),

  // The delete confirmation.
  'record-delete-dialog': topic('animal-record', { see: ['record-delete-confirm', 'record-delete-cancel', 'record-delete'] }),
  'record-delete-confirm': topic('animal-record', { title: 'common:common.delete', see: ['record-delete-dialog', 'record-delete-cancel'], minor: true }),
  'record-delete-cancel': topic('animal-record', { title: 'common:common.cancel', see: ['record-delete-dialog'], minor: true }),

  // Hobby genetics, explained once; reached from the genetics fields.
  'concept-morph': topic('animal-record', { see: ['concept-visual', 'concept-het', 'concept-super', 'record-genetics'] }),
  'concept-visual': topic('animal-record', { see: ['concept-morph', 'concept-het', 'concept-super'] }),
  'concept-het': topic('animal-record', { see: ['concept-possible-het', 'concept-visual', 'concept-morph'] }),
  'concept-possible-het': topic('animal-record', { see: ['concept-het', 'concept-visual', 'record-genetics'] }),
  'concept-super': topic('animal-record', { see: ['concept-morph', 'concept-visual', 'add-leucistic'] }),
  'concept-status-vs-group': topic('animal-record', { see: ['record-status', 'record-group', 'sell-for-sale'] }),

  // Adding one animal.
  'add-window': topic('adding', { title: 'common:ui.animals.addAnimal.title', see: ['add-species', 'add-quick-add', 'add-submit'] }),
  'add-close': topic('adding', { title: 'common:common.close', see: ['add-window', 'add-cancel'], minor: true }),
  'add-species': topic('adding', { title: 'common:ui.animals.addAnimal.species', see: ['add-genetics', 'add-quick-add'] }),
  'add-quick-add': topic('adding', { title: 'common:ui.animals.addAnimal.quickAdd', see: ['add-update-fields', 'add-species'] }),
  'add-update-fields': topic('adding', { title: 'common:ui.animals.addAnimal.updateFields', see: ['add-quick-add', 'add-leucistic'] }),
  'add-name': topic('adding', { title: 'common:ui.animals.addAnimal.name', see: ['record-parentage', 'add-id'], minor: true }),
  'add-id': topic('adding', { title: 'common:ui.animals.addAnimal.id', see: ['add-name', 'record-generate-id'], minor: true }),
  'add-sex': topic('adding', { title: 'common:ui.animals.addAnimal.sex', see: ['add-id'], minor: true }),
  'add-status': topic('adding', { title: 'common:ui.animals.addAnimal.tag', see: ['concept-status-vs-group', 'record-status-delete', 'add-price'], minor: true }),
  'add-genetics': topic('adding', {
    title: 'common:ui.animals.addAnimal.genetics',
    see: ['concept-morph', 'concept-het', 'concept-possible-het', 'concept-visual', 'concept-super'],
  }),
  'add-weight': topic('adding', { title: 'common:ui.animals.addAnimal.weight', see: ['record-weights'], minor: true }),
  'add-price': topic('adding', { title: 'common:ui.animals.addAnimal.price', see: ['add-status', 'sell-for-sale'], minor: true }),
  'add-year': topic('adding', { title: 'common:ui.animals.addAnimal.year', see: ['add-birth-date'], minor: true }),
  'add-birth-date': topic('adding', { title: 'common:snakeEdit.birthDate', see: ['add-year'], minor: true }),
  'add-group': topic('adding', { title: 'common:snakeEdit.group', see: ['record-add-group', 'concept-status-vs-group'], minor: true }),
  'add-arrival': topic('adding', { title: 'common:quarantine.arrivalLegend', see: ['add-source', 'add-source-name', 'nav-quarantine'] }),
  'add-source': topic('adding', { title: 'common:quarantine.source', see: ['add-arrival', 'add-source-name'], minor: true }),
  'add-source-name': topic('adding', { title: 'common:quarantine.sourceName', see: ['add-arrival', 'add-source'], minor: true }),
  'add-cancel': topic('adding', { title: 'common:common.cancel', see: ['add-window'], minor: true }),
  'add-submit': topic('adding', { title: 'common:ui.animals.addAnimal.button', see: ['add-window', 'add-arrival', 'saving'] }),

  // Windows that can open while adding or importing.
  'add-species-backfill': topic('adding', { title: 'common:species.backfill.title', see: ['add-backfill-apply', 'add-backfill-later', 'record-species'] }),
  'add-backfill-species': topic('adding', { title: 'common:ui.animals.addAnimal.species', see: ['add-species-backfill', 'add-backfill-apply'], minor: true }),
  'add-backfill-later': topic('adding', { title: 'common:species.backfill.later', see: ['add-species-backfill', 'record-species'], minor: true }),
  'add-backfill-apply': topic('adding', { see: ['add-species-backfill', 'add-backfill-later'], minor: true }),
  'add-leucistic': topic('adding', { title: 'common:leucistic.title', see: ['add-leucistic-type', 'add-leucistic-apply', 'concept-super'] }),
  'add-leucistic-type': topic('adding', { title: 'common:leucistic.typeLabel', see: ['add-leucistic', 'add-leucistic-bel', 'add-leucistic-black'], minor: true }),
  'add-leucistic-bel': topic('adding', { see: ['add-leucistic-type', 'add-leucistic-apply'], minor: true }),
  'add-leucistic-black': topic('adding', { title: 'common:leucistic.blackEyeGene', see: ['add-leucistic-type', 'concept-super'], minor: true }),
  'add-leucistic-cancel': topic('adding', { title: 'common:common.cancel', see: ['add-leucistic'], minor: true }),
  'add-leucistic-apply': topic('adding', { title: 'common:filters.apply', see: ['add-leucistic', 'add-leucistic-cancel'], minor: true }),

  // Importing a collection.
  'import-window': topic('adding', { title: 'common:ui.animals.import.modalTitle', see: ['import-morphmarket', 'import-generic-csv', 'import-pdf', 'import-paste'] }),
  'import-close': topic('adding', { title: 'common:common.close', see: ['import-window'], minor: true }),
  'import-already-owned': topic('adding', { title: 'common:ui.animals.import.alreadyOwned', see: ['add-arrival', 'import-window'] }),
  'import-source': topic('adding', { title: 'common:ui.animals.import.sourceLabel', see: ['import-morphmarket', 'import-generic-csv', 'import-pdf'] }),
  'import-morphmarket': topic('adding', { title: 'common:ui.animals.import.morphmarket.chooseFile', see: ['import-mm-review', 'import-generic-csv'] }),
  'import-generic-csv': topic('adding', { title: 'common:ui.animals.import.genericCsv', see: ['import-species', 'import-preview', 'import-morphmarket'] }),
  'import-pdf': topic('adding', { title: 'common:ui.animals.import.uploadPdfButton', see: ['import-paste', 'import-preview'] }),
  'import-paste': topic('adding', { title: 'common:ui.animals.import.pasteLabel', see: ['import-preview', 'import-pdf'] }),
  'import-species': topic('adding', { title: 'common:ui.animals.import.species', see: ['import-submit', 'record-species'], minor: true }),
  'import-preview': topic('adding', { title: 'common:ui.animals.import.previewButton', see: ['import-submit', 'import-paste'] }),
  'import-cancel': topic('adding', { title: 'common:common.cancel', see: ['import-window'], minor: true }),
  'import-submit': topic('adding', { title: 'common:ui.animals.import.importButton', see: ['import-preview', 'import-species', 'import-already-owned'] }),
  'import-mm-review': topic('adding', { see: ['import-mm-row', 'import-mm-confirm', 'import-morphmarket'] }),
  'import-mm-row': topic('adding', { title: 'common:ui.animals.import.morphmarket.resolveRow', see: ['import-mm-review', 'import-mm-confirm'], minor: true }),
  'import-mm-confirm': topic('adding', { see: ['import-mm-review', 'import-mm-row', 'import-mm-result'] }),
  'import-mm-cancel': topic('adding', { title: 'common:common.cancel', see: ['import-mm-review'], minor: true }),
  'import-mm-result': topic('adding', { see: ['import-mm-breeders', 'import-mm-view'] }),
  'import-mm-breeders': topic('adding', { title: 'common:ui.animals.import.morphmarket.breedersQuestion', see: ['import-mm-result', 'record-group'] }),
  'import-mm-view': topic('adding', { title: 'common:ui.animals.import.morphmarket.viewAnimals', see: ['import-mm-result'], minor: true }),

  // Selling.
  'sell-for-sale': topic('selling', { title: 'common:snakeEdit.forSale', see: ['sell-publish', 'record-save', 'concept-status-vs-group'] }),
  'sell-price': topic('selling', { title: 'common:snakeEdit.price', see: ['sell-currency', 'sell-for-sale'], minor: true }),
  'sell-currency': topic('selling', { title: 'common:snakeEdit.currency', see: ['sell-price'], minor: true }),
  'sell-description': topic('selling', { title: 'common:snakeEdit.saleDescription', see: ['sell-for-sale'], minor: true }),
  'sell-publish': topic('selling', { title: 'common:snakeEdit.publishToMarketplace', see: ['sell-for-sale', 'sell-published', 'record-save'] }),
  'sell-published': topic('selling', { title: 'common:snakeEdit.publishedToMarketplace', see: ['sell-for-sale', 'sell-publish'], minor: true }),

  // Lab.
  'record-order-test': topic('lab', { title: 'common:actions.orderGeneticTest', see: ['nav-lab-tests', 'record-genetics'] }),
} as const;
