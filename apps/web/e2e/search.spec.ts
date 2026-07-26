import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeTestDatabase,
  seedDashboard,
  TEST_EMAIL,
  TEST_PASSWORD,
  type SeedDates,
} from "./fixtures";

const MONTH_FMT = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const SHORT_DATE_FMT = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function monthLabel(iso: string): string {
  return MONTH_FMT.format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));
}

function shortDate(iso: string): string {
  return SHORT_DATE_FMT.format(new Date(`${iso}T00:00:00Z`));
}

/** Home-page offset that shows the month `iso` falls in. */
function monthOffset(iso: string, todayIso: string): number {
  const [y, m] = iso.split("-").map(Number);
  const [ty, tm] = todayIso.split("-").map(Number);
  return (y - ty) * 12 + (m - tm);
}

function group(page: Page, label: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^(Expand|Collapse) ${label},`) });
}

function searchBox(page: Page): Locator {
  return page.getByLabel("Search records");
}

const EMPTY_TEXT = "Nothing matches — try fewer filters or a shorter search term.";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Search opens with "This month"; every test here needs the older fixtures too. */
async function allTime(page: Page) {
  await page.getByRole("button", { name: "All time" }).click();
  await expect(page).toHaveURL(/range=all/);
}

async function openAdvanced(page: Page) {
  await page.getByRole("button", { name: /Advanced filters/ }).click();
  await expect(page.getByRole("button", { name: "Description", exact: true })).toBeVisible();
}

let dates: SeedDates;

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  dates = await seedDashboard();
  await signIn(page);
  await page.goto("/search");
  await expect(searchBox(page)).toBeVisible();
});

test.afterAll(async () => {
  await closeTestDatabase();
});

test("groups results by month with cards expanded by default", async ({ page }) => {
  await allTime(page);

  const current = group(page, monthLabel(dates.today));
  const old = group(page, monthLabel(dates.oldRent));
  await expect(current).toHaveAttribute("aria-expanded", "true");
  await expect(old).toHaveAttribute("aria-expanded", "true");
  await expect(old).toContainText("2 records");
  await expect(page.getByText("Old rent")).toBeVisible();
  await expect(page.getByText("Lunch groceries")).toBeVisible();

  await old.click();
  await expect(old).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Old rent")).toBeHidden();
  await expect(current).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Lunch groceries")).toBeVisible();
});

test("drops the share progress bar but keeps month totals", async ({ page }) => {
  await allTime(page);

  await expect(page.getByRole("progressbar")).toHaveCount(0);
  const old = group(page, monthLabel(dates.oldRent));
  await expect(old).toContainText("Spent");
  await expect(old).toContainText("₹1,314.50");

  await searchBox(page).fill("Monthly salary");
  await expect(page.getByRole("heading", { name: "1 result", exact: true })).toBeVisible();
  await expect(group(page, monthLabel(dates.yesterday))).toContainText("Income");
});

test("shows the date on each result row", async ({ page }) => {
  await allTime(page);

  await expect(page.getByText(`${shortDate(dates.oldRent)} · Bank · Old rent`)).toBeVisible();
  await expect(
    page.getByText(`${shortDate(dates.today)} · Cash · Lunch groceries`),
  ).toBeVisible();
});

test("matches description by default and account only when enabled", async ({ page }) => {
  await allTime(page);

  await searchBox(page).fill("Bank");
  await expect(page.getByText(EMPTY_TEXT)).toBeVisible();

  await searchBox(page).fill("groceries");
  await expect(page.getByText("Lunch groceries")).toBeVisible();
  await expect(page.getByText("Market groceries")).toBeVisible();

  await searchBox(page).fill("Bank");
  await expect(page.getByText(EMPTY_TEXT)).toBeVisible();
  await openAdvanced(page);
  const accountChip = page.getByRole("button", { name: "Account", exact: true });
  await expect(accountChip).toHaveAttribute("aria-pressed", "false");
  await accountChip.click();
  // Field order in the param is an implementation detail; the set is what matters.
  await expect(page).toHaveURL(/[?&]by=(?=[^&]*note)(?=[^&]*amount)(?=[^&]*account)/);
  await expect(accountChip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Bus pass")).toBeVisible();
  await expect(page.getByText("Old rent")).toBeVisible();
});

test("matches an exact amount but not a partial one", async ({ page }) => {
  await allTime(page);

  await searchBox(page).fill("1234.50");
  await expect(page.getByRole("heading", { name: "1 result", exact: true })).toBeVisible();
  await expect(page.getByText("Old rent")).toBeVisible();

  await searchBox(page).fill("1234");
  await expect(page.getByText(EMPTY_TEXT)).toBeVisible();
});

test("returns nothing for a non-numeric query when only Amount is enabled", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);
  await page.getByRole("button", { name: "Description", exact: true }).click();
  await expect(page).toHaveURL(/by=amount/);

  await searchBox(page).fill("rent");
  await expect(page.getByText(EMPTY_TEXT)).toBeVisible();
  await expect(page.getByRole("heading", { name: "0 results", exact: true })).toBeVisible();

  // The last active field can't be switched off, and says so.
  const amountChip = page.getByRole("button", { name: "Amount", exact: true });
  await expect(amountChip).toHaveAttribute("aria-disabled", "true");
  // aria-disabled makes Playwright consider the button unactionable, but a real
  // browser still dispatches the click — force it to prove the handler no-ops.
  await amountChip.click({ force: true });
  await expect(page).toHaveURL(/by=amount/);
  await expect(amountChip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(EMPTY_TEXT)).toBeVisible();

  await searchBox(page).fill("1234.50");
  await expect(page.getByText("Old rent")).toBeVisible();

  // A fresh document load drops the whole filter set, `by` included.
  await page.reload();
  await expect(page).toHaveURL(/\/search$/);
  await openAdvanced(page);
  await expect(page.getByRole("button", { name: "Description", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("filters on a valid minimum and survives an out-of-range one", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);

  await page.getByLabel("Minimum amount").fill("500");
  await expect(page.getByRole("heading", { name: "2 results", exact: true })).toBeVisible();
  await expect(page.getByText("Old rent")).toBeVisible();
  await expect(page.getByText("Monthly salary")).toBeVisible();

  // Bigger than any storable amount: the bound is dropped rather than handed to
  // Prisma as a Float, which used to blow up the whole page.
  await page.getByLabel("Minimum amount").fill("90071992547410");
  await expect(page).toHaveURL(/min=90071992547410/);
  await expect(page.getByRole("heading", { name: /^\d+ results?$/ })).toBeVisible();
  await expect(page.getByText("Old rent")).toBeVisible();
});

test("keeps a collapsed month card collapsed across filter changes", async ({ page }) => {
  await allTime(page);

  const old = group(page, monthLabel(dates.oldRent));
  await old.click();
  await expect(old).toHaveAttribute("aria-expanded", "false");

  await searchBox(page).fill("Old");
  await expect(page.getByRole("heading", { name: "2 results", exact: true })).toBeVisible();
  const stillOld = group(page, monthLabel(dates.oldRent));
  await expect(stillOld).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Old rent")).toBeHidden();

  await stillOld.click();
  await expect(page.getByText("Old rent")).toBeVisible();
});

test("keeps a chip toggle that lands mid-debounce", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);

  // No wait between the two: the pending 350ms timer must not revert the chip.
  await searchBox(page).fill("Bank");
  await page.getByRole("button", { name: "Account", exact: true }).click();

  await expect(page.getByText("Bus pass")).toBeVisible();
  await expect(page).toHaveURL(/q=Bank/);
  await expect(page).toHaveURL(/[?&]by=[^&]*account/);
});

test("jumps from a month card to that month on the dashboard", async ({ page }) => {
  await allTime(page);

  const offset = monthOffset(dates.oldRent, dates.today);
  expect(offset).toBe(-2);
  await expect(
    page.getByRole("link", { name: `Go to ${monthLabel(dates.today)}` }),
  ).toHaveAttribute("href", "/");

  await page.getByRole("link", { name: `Go to ${monthLabel(dates.oldRent)}` }).click();
  await expect(page).toHaveURL(new RegExp(`\\?offset=${offset}$`));
  await expect(page.getByRole("heading", { name: "Records" })).toBeVisible();
  await expect(page.getByText(monthLabel(dates.oldRent))).toBeVisible();
  // That month holds exactly the two seeded old records, on separate dates.
  await expect(page.getByRole("button", { name: /^Expand .+, \d+ records?/ })).toHaveCount(2);
});

test("matches transfers on exact amount and dates their rows", async ({ page }) => {
  await allTime(page);

  await searchBox(page).fill("30");
  await expect(page.getByRole("heading", { name: "1 result", exact: true })).toBeVisible();
  await expect(page.getByText("Cash → Bank")).toBeVisible();
  await expect(
    page.getByText(`${shortDate(dates.transferOnly)} · Move to savings`),
  ).toBeVisible();
});
