import { test, expect, type Page } from "@playwright/test";

/**
 * The breeding-card scenario from SBR-12, driven through the real app with isolated synthetic
 * animals seeded into this browser's localStorage (the app is local-first; the seeded breeder
 * account from the e2e reset signs us in, and the cloud sync carries the cards to the backend).
 *
 *  1. pre-pairing scan  2. first actual pairing creates the card  3. lock + planned follow-up
 *  4. multiple sires: second male, his session and lock  5. follow-up scans, chart and table
 *  6. ovulation, pre-lay shed, laying  7. partial hatching, then the final outcome
 *  8. previous-cycle summary and statistics  9. her next cycle with embedded history
 * 10. correct a historical event and see the recalculation
 */

const FEMALE = { id: "E2E-F-1", name: "E2E Hera", sex: "F", species: "ball-python", groups: ["Breeders"], morphs: ["Pastel"], hets: [], status: "Active", logs: {} };
const MALE_A = { id: "E2E-M-1", name: "E2E Zeus", sex: "M", species: "ball-python", groups: ["Breeders"], morphs: ["Clown"], hets: [], status: "Active", logs: {} };
const MALE_B = { id: "E2E-M-2", name: "E2E Ares", sex: "M", species: "ball-python", groups: ["Breeders"], morphs: [], hets: ["Clown"], status: "Active", logs: {} };

const seedAnimals = async (page: Page) => {
  await page.addInitScript(({ animals }) => {
    try {
      const existing = JSON.parse(localStorage.getItem("breedingPlannerSnakes") || "[]");
      const ids = new Set(animals.map((a: any) => a.id));
      const kept = Array.isArray(existing) ? existing.filter((a: any) => !ids.has(a?.id) && !a?.isDemo) : [];
      localStorage.setItem("breedingPlannerSnakes", JSON.stringify([...kept, ...animals]));
      localStorage.removeItem("breedingPlannerBreedingCycles");
      localStorage.removeItem("breedingPlannerFollicleExams");
    } catch { /* ignore */ }
  }, { animals: [FEMALE, MALE_A, MALE_B] });
};

const openBreedingCards = async (page: Page) => {
  await page.goto("/#/breeder");
  await expect(page.getByText("Serpentora").first()).toBeVisible();
  // Species workspace first (species-scoped tabs are gated), then the Breeding tab.
  const speciesTile = page.getByRole("button", { name: /Ball Python/i }).first();
  if (await speciesTile.isVisible().catch(() => false)) await speciesTile.click();
  await page.getByRole("button", { name: "Breeding", exact: true }).first().click();
  await page.getByRole("button", { name: "Breeding cards", exact: true }).click();
  await expect(page.getByText(/One card per female per cycle/)).toBeVisible();
};

const dialog = (page: Page) => page.getByRole("dialog");

const fillDate = async (page: Page, label: RegExp, value: string) => {
  await dialog(page).getByLabel(label).first().fill(value);
};

const chooseAnimal = async (page: Page, label: RegExp, animalId: string) => {
  await dialog(page).getByLabel(label).first().selectOption(animalId);
};

/** The app confirms a proposal or a cancellation with its own alert dialog. */
const dismissNotice = async (page: Page) => {
  for (const name of ["OK", "Close"]) {
    const button = page.getByRole("button", { name, exact: true }).first();
    if (await button.isVisible().catch(() => false)) await button.click();
  }
};

const card = (page: Page) => page.locator("[aria-label='Breeding card for E2E Hera']");

/** Cards remount collapsed when they move between the open and closed lists; open them. */
const expandCards = async (page: Page) => {
  for (let i = 0; i < 3; i += 1) {
    const collapsed = card(page).filter({ hasText: "View details" }).first();
    if (!(await collapsed.isVisible().catch(() => false))) return;
    await collapsed.click();
  }
};

test.describe("breeding cards end to end", () => {
  test.setTimeout(600_000);

  test("the full female cycle: scan, pairings with two males, locks, milestones, outcome, history", async ({ page }) => {
    await seedAnimals(page);
    await openBreedingCards(page);

    // 1. A pre-pairing scan. It starts nothing.
    await page.getByRole("button", { name: "Record a follicle exam" }).click();
    await chooseAnimal(page, /^Female/, FEMALE.id);
    await fillDate(page, /Examination date/, "2026-01-15");
    await dialog(page).getByLabel(/Largest measured diameter/).fill("14");
    await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText("No open breeding cards")).toBeVisible();

    // 2. The first actual pairing creates one card. 3. Lock observed: an explicit choice.
    await page.getByRole("button", { name: "Record a pairing" }).click();
    await chooseAnimal(page, /^Female/, FEMALE.id);
    await chooseAnimal(page, /^Male/, MALE_A.id);
    await fillDate(page, /Pairing date/, "2026-03-01");
    await dialog(page).getByLabel("Yes", { exact: true }).check();
    // Backdated entry (the scenario runs months later): the month-later date is shown, and the
    // dialog says no past-due reminder will be created automatically.
    await expect(dialog(page).getByText(/would be 01\/04\/2026, which is already past/)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Save session" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await dismissNotice(page);

    await expect(card(page)).toHaveCount(1);
    await expect(card(page).getByText("Season 2026–27")).toBeVisible();
    await expect(card(page).getByText(/None pending. An observed lock proposes the next pairing/)).toBeVisible();
    // The pre-pairing scan joined the card without moving its start.
    await expect(card(page).getByText("First pairing").locator("..").getByText("01/03/2026")).toBeVisible();
    await expect(card(page).getByText(/45 d before first pairing/)).toBeVisible();

    // 4. Multiple sires: a second male, his session and lock on the SAME card.
    await card(page).getByLabel("Multiple sires").check();
    await card(page).getByRole("button", { name: "+ Pairing" }).click();
    await chooseAnimal(page, /^Male/, MALE_B.id);
    await fillDate(page, /Pairing date/, "2026-03-10");
    await dialog(page).getByLabel("Yes", { exact: true }).check();
    await dialog(page).getByRole("button", { name: "Save session" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await dismissNotice(page);
    await expect(card(page)).toHaveCount(1);
    await expect(card(page).getByText("E2E Ares").first()).toBeVisible();
    const lockStat = () => card(page).getByText("Observed locks", { exact: true }).locator("..");
    await expect(lockStat()).toContainText("2");

    // Repeating the same dated lock does not add a count.
    await card(page).getByRole("button", { name: "+ Observed lock" }).click();
    await fillDate(page, /Observation date/, "2026-03-01");
    await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await dismissNotice(page);
    await expect(lockStat()).toContainText("2");

    // 5. Follow-up scans; chart, trend and table.
    for (const [date, mm] of [["2026-03-20", "19"], ["2026-04-03", "24"]]) {
      await card(page).getByRole("button", { name: "+ Follicle exam" }).click();
      await fillDate(page, /Examination date/, date);
      await dialog(page).getByLabel(/Largest measured diameter/).fill(mm);
      await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog(page)).toHaveCount(0);
    }
    await expect(card(page).getByText(/\+5 mm over 14 days/)).toBeVisible();
    await card(page).getByRole("tab", { name: "Table" }).click();
    await expect(card(page).getByRole("cell", { name: "24 mm" })).toBeVisible();

    // 6. Ovulation, pre-lay shed, laying.
    const milestone = async (type: string, date: string) => {
      await card(page).getByRole("button", { name: "+ Milestone" }).click();
      await dialog(page).getByLabel("Milestone").selectOption({ label: type });
      await fillDate(page, /^Date$/, date);
      await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog(page)).toHaveCount(0);
      await dismissNotice(page);
    };
    await milestone("Ovulation", "2026-04-20");
    await expect(card(page).getByText(/Ovulation recorded: no further pairing proposals/)).toBeVisible();
    await milestone("Pre-lay shed", "2026-05-08");
    await card(page).getByRole("button", { name: "Clutch", exact: true }).click();
    await fillDate(page, /Laying date/, "2026-06-05");
    await dialog(page).getByLabel("Total eggs").fill("6");
    await dialog(page).getByLabel("Fertile").fill("5");
    await dialog(page).getByLabel("Slugs").fill("1");
    await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(card(page).getByText("Eggs laid, incubating")).toBeVisible();

    // 7. Partial hatching keeps the card open; the final outcome completes it.
    await card(page).getByRole("button", { name: "Hatching", exact: true }).click();
    await fillDate(page, /Hatch date/, "2026-08-01");
    await dialog(page).getByLabel("Hatchlings so far").fill("2");
    await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(card(page).getByText("Active", { exact: true }).first()).toBeVisible();
    await card(page).getByRole("button", { name: "Hatching complete" }).first().click();
    await fillDate(page, /Final hatch date/, "2026-08-04");
    await dialog(page).getByLabel("Hatchlings so far").fill("5");
    await dialog(page).getByLabel(/Unhatched/).fill("1");
    await dialog(page).getByRole("button", { name: "Hatching complete", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);

    // The card is closed now and lives under "Closed cards".
    await page.getByRole("button", { name: /Closed cards \(1\)/ }).click();
    await expandCards(page);
    await expect(card(page).getByText("Closed: Hatching complete")).toBeVisible();

    // 8/9. Her next actual cycle: a new card with the previous one summarised inside it.
    await page.getByRole("button", { name: "Record a pairing" }).click();
    await chooseAnimal(page, /^Female/, FEMALE.id);
    await chooseAnimal(page, /^Male/, MALE_A.id);
    await fillDate(page, /Pairing date/, "2026-11-01");
    await dialog(page).getByRole("button", { name: "Save session" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(card(page)).toHaveCount(2);
    await expandCards(page);
    const nextCard = card(page).first();
    await nextCard.getByText(/Previous breeding cycles \(1\)/).click();
    await expect(nextCard.getByText(/Based on one prior cycle/)).toBeVisible();
    const ovulationRow = () => nextCard.getByRole("row", { name: /First pairing to ovulation/ });
    await expect(ovulationRow()).toContainText("50 d");

    // 10. Correct a historical event: reopen the closed card deliberately, move ovulation from
    // 20/04 to 25/04, and watch the statistic on the open card recalculate (50 → 55 days).
    const closedCard = card(page).last();
    page.once("dialog", (d) => d.accept("Correcting the ovulation date"));
    await closedCard.getByRole("button", { name: "Reopen" }).click();
    await dismissNotice(page); // "reopened in correction mode (paused)"
    await expandCards(page);
    const reopened = card(page).filter({ hasText: "Reopened or resumed" }).first();
    await reopened.getByRole("button", { name: /Recorded.*Ovulation/ }).first().click();
    await fillDate(page, /^Date$/, "2026-04-25");
    await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await dismissNotice(page);
    // The reopened card is open again, so it is excluded from the other card's baseline until
    // closed; close it again with the same outcome and the recalculated statistic appears.
    await reopened.getByRole("button", { name: "Hatching complete" }).first().click();
    await dialog(page).getByRole("button", { name: "Hatching complete", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole("button", { name: /Closed cards \(1\)/ }).click().catch(() => {});
    await expect(ovulationRow()).toContainText("55 d");
  });
});
