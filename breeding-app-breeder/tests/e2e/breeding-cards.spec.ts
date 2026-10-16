import { test, expect, type Page } from "@playwright/test";

/**
 * The breeding-card scenario, driven through the real app with isolated synthetic animals seeded
 * into this browser's localStorage (the app is local-first; the seeded breeder account from the
 * e2e reset signs us in, and the cloud sync carries the cards to the backend).
 *
 * Breeding is Dashboard · Active pairing · Incubator · Completed pairing.
 *
 *  1. first actual pairing creates the card, in the season its date falls in
 *  2. multiple sires: second male, his session and lock  3. follicle exams on her Follicles tab
 *  4. ovulation, pre-lay shed, eggs laid: the clutch is in the incubator
 *  5. the cycle clock, then Log hatch: the hatchlings become animals and the cycle completes
 *  6. her next cycle in the next season, with embedded history
 *  7. correct a historical event on the reopened card and see the recalculation
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

/** Dashboard · Active pairing · Incubator · Completed pairing. */
const openBreedingTab = async (page: Page, name: RegExp) => {
  await page.getByRole("button", { name }).first().click();
};

const openBreedingCards = async (page: Page) => {
  await page.goto("/#/breeder");
  await expect(page.getByText("Serpentora").first()).toBeVisible();
  // Species workspace first (species-scoped tabs are gated), then the Breeding tab.
  const speciesTile = page.getByRole("button", { name: /Ball Python/i }).first();
  if (await speciesTile.isVisible().catch(() => false)) await speciesTile.click();
  await page.getByRole("button", { name: "Breeding", exact: true }).first().click();
  await openBreedingTab(page, /^Active pairing/);
  await expect(page.getByText(/One breeding card per female for her whole cycle/)).toBeVisible();
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

/** Cards remount collapsed when they move between tabs; open them. */
const expandCards = async (page: Page) => {
  for (let i = 0; i < 3; i += 1) {
    const collapsed = card(page).filter({ hasText: "View details" }).first();
    if (!(await collapsed.isVisible().catch(() => false))) return;
    await collapsed.click();
  }
};

test.describe("breeding cards end to end", () => {
  test.setTimeout(900_000);

  test("the full female cycle: pairings with two males, locks, follicles, eggs, hatchlings, history", async ({ page }) => {
    await seedAnimals(page);
    await openBreedingCards(page);

    // 1. The first actual pairing creates one card. Lock observed: an explicit choice.
    await page.getByRole("button", { name: "Record a pairing" }).first().click();
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
    await expandCards(page);
    // A first pairing on 1 March belongs to the season that started the previous 1 September.
    await expect(card(page).getByText("Season 2025–26").first()).toBeVisible();
    // The pairing plan lists the pairing as a ticked row; nothing is pending or overdue.
    await expect(card(page).getByRole("region", { name: "Pairing plan and milestones" }).getByRole("checkbox", { name: "Pairing 1: Paired" })).toBeChecked();
    await expect(card(page).getByText("First pairing").locator("..").getByText("01/03/2026")).toBeVisible();

    // 2. Multiple sires: a second male, his session and lock on the SAME card.
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

    // 3. Follicle exams between pairings; her own Follicles tab shows chart, trend and table.
    for (const [date, mm] of [["2026-03-20", "19"], ["2026-04-03", "24"]]) {
      await card(page).getByRole("button", { name: "+ Follicle exam" }).first().click();
      await fillDate(page, /Examination date/, date);
      await dialog(page).getByLabel(/Largest measured diameter/).fill(mm);
      await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog(page)).toHaveCount(0);
    }
    await card(page).getByRole("tab", { name: /^Follicles \(2\)/ }).click();
    await expect(card(page).getByText(/\+5 mm over 14 days/)).toBeVisible();
    await card(page).getByRole("tab", { name: "Table" }).click();
    await expect(card(page).getByRole("cell", { name: "24 mm" }).first()).toBeVisible();
    await card(page).getByRole("tab", { name: "Overview" }).click();

    // 4. Ovulation, pre-lay shed, eggs laid. From "eggs laid" the clutch is in the incubator.
    const milestone = async (type: string, date: string) => {
      await card(page).getByRole("button", { name: "+ Milestone" }).click();
      await dialog(page).getByLabel("Milestone").selectOption({ label: type });
      await fillDate(page, /^Date$/, date);
      await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog(page)).toHaveCount(0);
      await dismissNotice(page);
    };
    await milestone("Ovulation", "2026-04-20");
    await expect(card(page).getByText(/Ovulation recorded: no further pairing rows/)).toBeVisible();
    await milestone("Pre-lay shed", "2026-05-08");
    await card(page).getByRole("button", { name: "Eggs laid", exact: true }).click();
    await fillDate(page, /Laying date/, "2026-06-05");
    await dialog(page).getByLabel("Total eggs").fill("6");
    await dialog(page).getByLabel("Fertile").fill("5");
    await dialog(page).getByLabel("Slugs").fill("1");
    await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(card(page).getByText("Eggs laid, incubating")).toBeVisible();
    await expect(card(page).getByText("In the incubator")).toBeVisible();
    await openBreedingTab(page, /^Incubator \(1\)/);
    await expect(page.getByText(/E2E Hera/).first()).toBeVisible();
    await openBreedingTab(page, /^Active pairing/);
    await expandCards(page);

    // The cycle clock counts 60 days from laying; this scenario runs long after, so it is red.
    await expect(card(page).getByText(/Watch for hatching: \d+ days past due \(expected 04\/08\/2026\)/).first()).toBeVisible();

    // 5. Log hatch, once every hatchling is out: the hatchlings become animals in Hatchlings 2026
    // and the cycle completes on its own.
    await card(page).getByRole("button", { name: "Log hatch", exact: true }).click();
    await fillDate(page, /Hatch date/, "2026-08-04");
    await dialog(page).getByLabel("How many hatched").fill("5");
    await dialog(page).getByLabel(/Did not hatch/).fill("0");
    await dialog(page).getByRole("button", { name: "Log hatch", exact: true }).click();
    await expect(page.getByText("5 hatchlings added to Hatchlings 2026.")).toBeVisible();
    await dismissNotice(page);

    // The card is complete and lives under Completed pairing, in its own season.
    await openBreedingTab(page, /^Completed pairing \(1\)/);
    await expect(page.getByText("Season 2025–26").first()).toBeVisible();
    await expandCards(page);
    await expect(card(page).getByText("Closed: Hatching complete")).toBeVisible();

    // 6. Her next actual cycle, in the next season: a new card with the previous one inside it.
    await openBreedingTab(page, /^Active pairing/);
    await page.getByRole("button", { name: "Record a pairing" }).first().click();
    await chooseAnimal(page, /^Female/, FEMALE.id);
    await chooseAnimal(page, /^Male/, MALE_A.id);
    await fillDate(page, /Pairing date/, "2026-11-01");
    await dialog(page).getByRole("button", { name: "Save session" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(card(page)).toHaveCount(1);
    await expandCards(page);
    const nextCard = card(page).first();
    await expect(nextCard.getByText("Season 2026–27").first()).toBeVisible();
    await nextCard.getByText(/Previous breeding cycles \(1\)/).click();
    await expect(nextCard.getByText(/Based on one prior cycle/)).toBeVisible();
    const ovulationRow = () => card(page).first().getByRole("row", { name: /First pairing to ovulation/ });
    await expect(ovulationRow()).toContainText("50 d");

    // 7. Correct a historical event: reopen the completed card deliberately (it keeps season
    // 2025–26), move ovulation from 20/04 to 25/04, and watch the statistic on the open card
    // recalculate (50 → 55 days).
    await openBreedingTab(page, /^Completed pairing/);
    await expandCards(page);
    page.once("dialog", (d) => d.accept("Correcting the ovulation date"));
    await card(page).first().getByRole("button", { name: "Reopen" }).click();
    await dismissNotice(page); // "reopened in correction mode (paused)"
    await openBreedingTab(page, /^Active pairing/);
    await expect(page.getByText("Season 2025–26").first()).toBeVisible();
    await expandCards(page);
    const reopened = card(page).filter({ hasText: "Reopened or resumed" }).first();
    await reopened.getByRole("button", { name: /Recorded.*Ovulation/ }).first().click();
    await fillDate(page, /^Date$/, "2026-04-25");
    await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await dismissNotice(page);
    // Its hatchlings are already registered, so logging the hatch again completes it again and
    // creates no second set of hatchlings.
    await reopened.getByRole("button", { name: "Log hatch", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Log hatch", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(card(page)).toHaveCount(1);
    await expandCards(page);
    if (!(await ovulationRow().isVisible().catch(() => false))) {
      await card(page).first().getByText(/Previous breeding cycles \(1\)/).click();
    }
    await expect(ovulationRow()).toContainText("55 d");
  });
});
