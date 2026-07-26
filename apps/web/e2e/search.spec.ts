import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeTestDatabase,
  seedDashboard,
  TEST_EMAIL,
  TEST_PASSWORD,
  seedExtraRecords,
  breakTimezone,
  restoreTimezone,
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

test("matches a category name only when the Category field is enabled", async ({ page }) => {
  await allTime(page);

  await searchBox(page).fill("Food");
  await expect(page.getByText(EMPTY_TEXT)).toBeVisible();

  await openAdvanced(page);
  const categoryChip = page.getByRole("button", { name: "Category", exact: true });
  await expect(categoryChip).toHaveAttribute("aria-pressed", "false");
  await categoryChip.click();
  await expect(categoryChip).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByRole("heading", { name: "3 results", exact: true })).toBeVisible();
  await expect(page.getByText("Lunch groceries")).toBeVisible();
  await expect(page.getByText("Market groceries")).toBeVisible();
  await expect(page.getByText("Old rent")).toBeVisible();
  await expect(page.getByText("Bus pass")).toHaveCount(0);
});

test("drops transfers entirely when only Category is enabled", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);
  await page.getByRole("button", { name: "Category", exact: true }).click();
  await page.getByRole("button", { name: "Description", exact: true }).click();
  await page.getByRole("button", { name: "Amount", exact: true }).click();
  await expect(page).toHaveURL(/[?&]by=category(&|$)/);

  // Transfers have no category, so their OR list is empty: an amount that would
  // otherwise match the seeded transfer exactly must return nothing at all.
  await searchBox(page).fill("30");
  await expect(page.getByText(EMPTY_TEXT)).toBeVisible();
  await expect(page.getByRole("heading", { name: "0 results", exact: true })).toBeVisible();
  await expect(page.getByText("Cash → Bank")).toHaveCount(0);

  await searchBox(page).fill("Food");
  await expect(page.getByRole("heading", { name: "3 results", exact: true })).toBeVisible();
  await expect(page.getByText("Lunch groceries")).toBeVisible();
  await expect(page.getByText("Cash → Bank")).toHaveCount(0);
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

  // Bigger than any storable amount, so the bound is dropped instead of being
  // handed to Prisma as a Float: every entry comes back, and no error boundary.
  await page.getByLabel("Minimum amount").fill("90071992547410");
  await expect(page).toHaveURL(/min=90071992547410/);
  await expect(page.getByRole("heading", { name: "8 results", exact: true })).toBeVisible();
  await expect(page.getByText("Old rent")).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
});

test("accepts the amount formats a number input can produce", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);

  // Exponent and bare-fraction notation are both valid <input type="number">
  // values, so they have to filter rather than be thrown away.
  await page.getByLabel("Minimum amount").fill("1e3");
  await expect(page.getByRole("heading", { name: "1 result", exact: true })).toBeVisible();
  await expect(page.getByText("Old rent")).toBeVisible();

  // ".5" as a maximum: 50 minor is below every seeded amount, so a bound that
  // silently failed to parse would show all 8 entries instead of none.
  await page.getByLabel("Minimum amount").fill("");
  await page.getByLabel("Maximum amount").fill(".5");
  await expect(page.getByRole("heading", { name: "0 results", exact: true })).toBeVisible();
});

test("drops a category that the newly picked type can never match", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);

  await page.getByRole("button", { name: "🍜 Food", exact: true }).click();
  await expect(page).toHaveURL(/category=/);

  // Food is an expense category: keeping it under Income would filter with a
  // chip that the category row no longer shows.
  await page.getByRole("button", { name: "Income", exact: true }).click();
  await expect(page).toHaveURL(/type=INCOME/);
  await expect(page).not.toHaveURL(/category=/);
  await expect(page.getByText("Monthly salary")).toBeVisible();
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

test("composes two rapid chip toggles instead of overwriting", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);

  // Back-to-back, faster than the server round-trip: the second toggle reads
  // the params the first one asked for, not the ones still coming back from
  // the server, so the two compose instead of overwriting each other.
  await page.getByRole("button", { name: "Category", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();

  await expect(page).toHaveURL(/[?&]by=(?=[^&]*category)(?=[^&]*account)/);
  await expect(page.getByRole("button", { name: "Category", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Account", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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

/**
 * Widen the server round-trip so client state races are reproducible: only the
 * RSC fetches are held back, never the document itself.
 */
async function delayNavigations(page: Page, ms: number) {
  await page.route(/\/search(\?|$)/, async (route) => {
    if (route.request().resourceType() !== "document") {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.continue();
  });
}

test("pushes text typed while a fresh load is still resetting filters", async ({ page }) => {
  await delayNavigations(page, 900);
  await page.goto("/search?q=Bus&range=all");

  // The mount reset is in flight; these keystrokes must not be swallowed.
  await searchBox(page).fill("Lunch");
  await expect(page).toHaveURL(/q=Lunch/);
  await expect(page.getByText("Lunch groceries")).toBeVisible();
});

test("keeps the search box alive after a chip tapped during the reset", async ({ page }) => {
  await delayNavigations(page, 900);
  await page.goto("/search?q=Bus&range=all");

  await page.getByRole("button", { name: "All time" }).click();
  await searchBox(page).fill("Lunch");

  await expect(page).toHaveURL(/q=Lunch/);
  await expect(page).toHaveURL(/range=all/);
  await expect(page.getByText("Lunch groceries")).toBeVisible();
});

test("never combines the Transfers type with a category", async ({ page }) => {
  await delayNavigations(page, 900);
  await page.goto("/search");
  await openAdvanced(page);

  await page.getByRole("button", { name: "Transfers", exact: true }).click();
  // Any unrelated re-render before the round-trip lands (here: collapsing and
  // re-opening the panel) republishes the optimistic Transfers state to the
  // handlers. Both taps have to agree on what's current, or the URL ends up
  // asking for a transfer with a category — a combination that matches nothing.
  const disclosure = page.getByRole("button", { name: /Advanced filters/ });
  await disclosure.click();
  await disclosure.click();
  await page.getByRole("button", { name: "🍜 Food", exact: true }).click();

  await expect(page).toHaveURL(/category=/);
  await expect(page).not.toHaveURL(/type=TRANSFER/);
  await expect(page.getByText("Lunch groceries")).toBeVisible();
});

test("keeps filters cleared when a chip is tapped right after Clear all", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);
  await page.getByRole("button", { name: "Expenses", exact: true }).click();
  await searchBox(page).fill("groceries");
  await expect(page).toHaveURL(/q=groceries/);
  await expect(page).toHaveURL(/type=EXPENSE/);

  await delayNavigations(page, 900);
  await page.getByRole("button", { name: "Clear all" }).click();
  await page.getByRole("button", { name: "Last month" }).click();

  // The tap composes on the cleared state, so nothing else comes back with it.
  await expect(page).toHaveURL(/\/search\?range=lastmonth$/);
});

test("renders rather than crashing on invalid date params", async ({ page }) => {
  for (const params of [
    "range=custom&to=2026-13-45",
    "range=custom&from=2026-01-32",
    "range=custom&from=2026-02-30&to=2026-06-31",
    // toISOString() renders year 10000 as "+010000-…", which Prisma rejects.
    "range=custom&to=9999-12-31",
  ]) {
    const response = await page.goto(`/search?${params}`);
    expect(response?.status()).toBe(200);
    await expect(searchBox(page)).toBeVisible();
  }
});

// The Next/Prev asymmetry in `stepPage` has no end-to-end test on purpose: the
// pager's own `disabled={page >= totalPages}` guard blocks the tap in precisely
// the situations where Next's missing upper clamp would change the outcome
// (displayed page is `min(live.page, totalPages)`, so live.page >= totalPages
// always renders Next disabled). The asymmetry is defensive; the enabled path
// is covered by the double-tap test below.
test("advances two pages when Next is tapped twice", async ({ page }) => {
  await seedExtraRecords(401);
  await allTime(page);
  await expect(page.getByText("Page 1 of 3")).toBeVisible();

  await delayNavigations(page, 900);
  const next = page.getByRole("button", { name: "Next ›" });
  await next.click();
  await next.click();

  await expect(page).toHaveURL(/page=3/);
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
});

test("keeps every row reachable exactly once across pages", async ({ page }) => {
  await seedExtraRecords(401);

  // Fetched rather than clicked: a fresh document load wipes filter params, so
  // deep pages are only addressable through the server directly.
  const perPage: Set<string>[] = [];
  for (const n of [1, 2, 3]) {
    const response = await page.request.get(`/search?range=all&page=${n}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    // Anchored to the rendered subtitle so the inlined flight payload, which
    // repeats every note, can't inflate the counts.
    perPage.push(new Set([...html.matchAll(/· (Bulk \d+)<\/div>/g)].map((m) => m[1])));
  }

  const union = new Set(perPage.flatMap((set) => [...set]));
  // Disjoint pages (no row served twice) covering every seeded row.
  expect(perPage.reduce((sum, set) => sum + set.size, 0)).toBe(401);
  expect(union.size).toBe(401);
});

test("clamps a page past the end to the last real page", async ({ page }) => {
  await seedExtraRecords(401);

  const response = await page.request.get("/search?range=all&page=1000");
  expect(response.status()).toBe(200);
  const html = await response.text();

  // The last page specifically: the heading is built from the page the server
  // reports serving, so a fallback to page 1 would read "1–200 of 409" and hold
  // only same-day bulk rows. ("Page 3 of 3" isn't assertable — React splits
  // interpolated text into separate nodes in the SSR markup.)
  expect(html).toContain("401–409 of 409");
  expect(html).toContain("Old rent");
  expect(html).not.toContain("Nothing matches");
});

test("offers Clear all for an amount bound the server rejects", async ({ page }) => {
  // Default month range and no query, so the raw min text is the only thing
  // that can make the filter set look non-empty.
  await openAdvanced(page);
  await page.getByLabel("Minimum amount").fill("-5");

  await expect(page).toHaveURL(/min=-5/);
  await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();
});

test("counts only amount bounds the server can apply", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);

  await page.getByLabel("Minimum amount").fill("-5");
  await expect(page).toHaveURL(/min=-5/);
  // Unparseable: filters nothing, so it must not claim a badge — but it still
  // counts as an attempt, so Clear all has to be reachable.
  const badge = page.getByRole("button", { name: /Advanced filters/ }).locator("span.bg-brand");
  await expect(badge).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "8 results", exact: true })).toBeVisible();

  await page.getByLabel("Minimum amount").fill("50");
  await expect(badge).toHaveText("1");
});

test("shows the error boundary and recovers once the data is sound", async ({ page }) => {
  await breakTimezone();
  await page.goto("/search");

  await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();
  // The digest is what ties a user report to a server log line.
  await expect(page.getByText(/^Reference: \d+$/)).toBeVisible();

  // Retrying while the data is still broken has to stay harmless; that it can
  // actually recover is what the assertions after the repair below pin down.
  await retry.click();

  await restoreTimezone();
  await retry.click();
  await expect(searchBox(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
});

test("never shows a result range beyond the rows on screen", async ({ page }) => {
  await seedExtraRecords(401);
  await allTime(page);
  await expect(page.getByRole("heading", { name: "1–200 of 409" })).toBeVisible();

  await delayNavigations(page, 900);
  await page.getByRole("button", { name: "Next ›" }).click();

  // Mid-flight the pager may read "Page 2", but the range line describes the
  // rows actually rendered — which are still page 1's.
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "1–200 of 409" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "201–400 of 409" })).toBeVisible();
});

test("swaps reversed amount bounds when the field loses focus", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);
  const min = page.getByLabel("Minimum amount");
  const max = page.getByLabel("Maximum amount");

  await min.fill("1000");
  await max.fill("50");
  await max.blur();

  // The server already filters ₹50–₹1000 either way; the inputs have to say so.
  await expect(min).toHaveValue("50");
  await expect(max).toHaveValue("1000");
  await expect(page).toHaveURL(/min=50/);
  await expect(page).toHaveURL(/max=1000/);
  await expect(page.getByRole("status")).toHaveText(
    "Amount bounds swapped: minimum 50, maximum 1000",
  );
});

test("leaves the bounds alone while tabbing between them", async ({ page }) => {
  await allTime(page);
  await openAdvanced(page);
  const min = page.getByLabel("Minimum amount");
  const max = page.getByLabel("Maximum amount");

  // Max already holds a smaller value, so a swap on Min's blur would move 1000
  // into Max and the next keystrokes would overwrite it.
  await max.fill("50");
  await min.fill("1000");
  await min.press("Tab");
  await expect(max).toBeFocused();
  await max.fill("2000");

  await expect(min).toHaveValue("1000");
  await expect(max).toHaveValue("2000");
  await expect(page).toHaveURL(/min=1000/);
  await expect(page).toHaveURL(/max=2000/);
});
