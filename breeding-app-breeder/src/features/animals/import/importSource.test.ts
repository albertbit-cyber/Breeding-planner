import { describe, expect, it } from 'vitest';
import { detectImportSource, IMPORT_SOURCES } from './importSource';
import { parseCsvToRows } from '../../../utils/csvRows';
import { readFileSync } from 'node:fs';

// The exact header row of a real MorphMarket animal export. Kept verbatim as a regression
// fixture: the detector must keep recognising this, without any single one of these columns
// becoming a requirement.
const MORPHMARKET_HEADER_ROW = "Category*,Title*,Animal_Id*,Maturity,Price,State,Visibility,Enabled,Sex,Dob,Weight,Quantity,Group_Id,Traits,Photo_Urls,Video_Url,Desc,Length,Length_Type,Proven_Breeder,Is_Group,Wholesale_Price,Wholesale_Only,Wholesale_Description,Origin,Diet,Min_Shipping,Max_Shipping,Is_Rep_Photo,Is_Negotiable,Is_For_Trade,Enable 'Buy Now',Last_Update**,First_Listed**,Last_Renewal**,Impression_Count**,Click_Count**,Inquiries_Count**,Mm_Url**,Sires**,Dams**,Private_Notes";

const headersOf = (line: string) => parseCsvToRows(line)[0];

describe('detectImportSource', () => {
  it('recognises the real MorphMarket export header row', () => {
    expect(detectImportSource(headersOf(MORPHMARKET_HEADER_ROW))).toBe(IMPORT_SOURCES.MORPHMARKET);
  });

  it('recognises the header row of the bundled fixture file', () => {
    const csv = readFileSync(new URL('./__fixtures__/morphmarketAnimals.csv', import.meta.url), 'utf8');
    expect(detectImportSource(parseCsvToRows(csv)[0])).toBe(IMPORT_SOURCES.MORPHMARKET);
  });

  it('still recognises MorphMarket when it adds future columns we know nothing about', () => {
    const headers = [...headersOf(MORPHMARKET_HEADER_ROW), 'Future_Column', 'Another_New_Thing**'];
    expect(detectImportSource(headers)).toBe(IMPORT_SOURCES.MORPHMARKET);
  });

  it('still recognises MorphMarket when irrelevant optional columns are dropped', () => {
    const headers = ['Category*', 'Title*', 'Animal_Id*', 'Sex', 'Dob', 'Weight', 'Price', 'State', 'Traits'];
    expect(detectImportSource(headers)).toBe(IMPORT_SOURCES.MORPHMARKET);
  });

  it('tolerates reordered columns', () => {
    const headers = headersOf(MORPHMARKET_HEADER_ROW).slice().reverse();
    expect(detectImportSource(headers)).toBe(IMPORT_SOURCES.MORPHMARKET);
  });

  it('survives a UTF-8 BOM on the first header cell', () => {
    expect(detectImportSource(parseCsvToRows('﻿' + MORPHMARKET_HEADER_ROW)[0]))
      .toBe(IMPORT_SOURCES.MORPHMARKET);
  });

  it('does not claim a generic breeder sheet as MorphMarket', () => {
    const headers = ['Name', 'ID', 'Sex', 'Morphs', 'Hets', 'Weight', 'Notes'];
    expect(detectImportSource(headers)).toBe(IMPORT_SOURCES.GENERIC_CSV);
  });

  it('does not claim a sheet that only shares a couple of MorphMarket words', () => {
    // Sex and Traits alone appear on plenty of unrelated exports.
    const headers = ['Sex', 'Traits', 'Weight', 'Price'];
    expect(detectImportSource(headers)).toBe(IMPORT_SOURCES.GENERIC_CSV);
  });

  it('needs the distinctive identifiers, not just the required-column count', () => {
    const headers = ['Category*', 'Title*', 'Sex', 'Traits', 'Maturity', 'Price', 'State', 'Dob'];
    // No Animal_Id* -- this is not MorphMarket.
    expect(detectImportSource(headers)).not.toBe(IMPORT_SOURCES.MORPHMARKET);
  });

  it('returns UNKNOWN for a CSV with nothing we can read', () => {
    expect(detectImportSource(['Alpha', 'Beta', 'Gamma'])).toBe(IMPORT_SOURCES.UNKNOWN);
    expect(detectImportSource([])).toBe(IMPORT_SOURCES.UNKNOWN);
  });
});
