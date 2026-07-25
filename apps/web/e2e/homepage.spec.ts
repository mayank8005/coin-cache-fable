import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeTestDatabase,
  seedDashboard,
  TEST_EMAIL,
  TEST_PASSWORD,
  type SeedDates,
} from "./fixtures";

const DATE_FMT = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function dateLabel(iso: string): string {
  return DATE_FMT.format(new Date(`${iso}T00:00:00Z`));
}

function group(page: Page, label: string): Locator {
  return page.getByRole("button", { name: new RegExp(`^(Expand|Collapse) ${label},`) });
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

let dates: SeedDates;

test.beforeEach(async ({ page }) => {
  dates = await seedDashboard();
  await signIn(page);
  await page.goto("/?period=all");
  await expect(page.getByRole("heading", { name: "Records" })).toBeVisible();
});

test.afterAll(async () => {
  await closeTestDatabase();
});

test("keeps insights and starts date cards collapsed with accurate spending bars", async ({ page }) => {
  await expect(page.getByText("Expenses", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Categories", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "By date" })).toHaveAttribute("aria-pressed", "true");

  const toggles = page.getByRole("button", { name: /^Expand .+, \d+ records?/ });
  await expect(toggles).toHaveCount(4);
  for (const toggle of await toggles.all()) await expect(toggle).toHaveAttribute("aria-expanded", "false");

  const today = group(page, dateLabel(dates.today));
  await expect(today).toContainText("Spent");
  await expect(today).toContainText("₹100");
  await expect(today.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

  const yesterday = group(page, dateLabel(dates.yesterday));
  await expect(yesterday).toContainText("3 records");
  await expect(yesterday.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
});

test("expands cards independently with keyboard and keeps records editable", async ({ page }) => {
  const today = group(page, dateLabel(dates.today));
  const yesterday = group(page, dateLabel(dates.yesterday));

  await today.focus();
  await page.keyboard.press("Enter");
  await expect(today).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Lunch groceries")).toBeVisible();

  await yesterday.click();
  await expect(today).toHaveAttribute("aria-expanded", "true");
  await expect(yesterday).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Market groceries")).toBeVisible();

  await page.getByText("Lunch groceries").locator("xpath=ancestor::button").click();
  await expect(page.getByRole("button", { name: "Delete record" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await today.focus();
  await page.keyboard.press("Space");
  await expect(today).toHaveAttribute("aria-expanded", "false");
  await expect(yesterday).toHaveAttribute("aria-expanded", "true");
});

test("groups by category, handles non-expenses, and resets cards after reload", async ({ page }) => {
  await page.getByRole("button", { name: "By category" }).click();
  await expect(page.getByRole("button", { name: "By category" })).toHaveAttribute("aria-pressed", "true");

  const food = group(page, "Food");
  const transport = group(page, "Transport");
  const salary = group(page, "Salary");
  const transfers = group(page, "Transfers");
  await expect(food.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "70");
  await expect(transport.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
  await expect(salary).toContainText("Income");
  await expect(salary).toContainText("₹500");
  await expect(salary.getByRole("progressbar")).toHaveCount(0);
  await expect(transfers).toContainText("Transferred");
  await expect(transfers).toContainText("₹30");
  await expect(transfers.getByRole("progressbar")).toHaveCount(0);

  await food.click();
  await expect(page.getByText("Lunch groceries")).toBeVisible();
  await expect(page.getByText("Market groceries")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "By category" })).toHaveAttribute("aria-pressed", "true");
  await expect(group(page, "Food")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Lunch groceries")).toBeHidden();
});

test("shows income-only and transfer-only date summaries without spending bars", async ({ page }) => {
  const income = group(page, dateLabel(dates.incomeOnly));
  const transfer = group(page, dateLabel(dates.transferOnly));
  await expect(income).toContainText("Income");
  await expect(income).toContainText("₹120");
  await expect(income.getByRole("progressbar")).toHaveCount(0);
  await expect(transfer).toContainText("Transferred");
  await expect(transfer).toContainText("₹30");
  await expect(transfer.getByRole("progressbar")).toHaveCount(0);
});

test("account changes reset expansion, recalculate shares, and preserve the empty state", async ({ page }) => {
  await page.getByRole("button", { name: "By category" }).click();
  await group(page, "Food").click();
  const accountSelect = page.locator("header select");
  const cashId = await accountSelect.locator("option", { hasText: "Cash" }).getAttribute("value");
  await accountSelect.selectOption(cashId ?? "");
  await expect(page).toHaveURL(/account=/);
  const cashFood = group(page, "Food");
  await expect(cashFood).toHaveAttribute("aria-expanded", "false");
  await expect(cashFood.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

  const emptyId = await accountSelect.locator("option", { hasText: "Empty" }).getAttribute("value");
  await accountSelect.selectOption(emptyId ?? "");
  await expect(page.getByText("No records in this period. Tap − or + to add one.")).toBeVisible();
});

test("adding an expense refreshes the collapsed summary and percentages", async ({ page }) => {
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByLabel("Description").fill("Test snack");
  await page.getByRole("button", { name: "Choose category" }).click();
  await page.locator("button:has(span.truncate)").filter({ hasText: "Food" }).click();

  await expect(page.getByRole("button", { name: "Add expense" })).toBeVisible();
  const today = group(page, dateLabel(dates.today));
  await expect(today).toContainText("₹150");
  await expect(today.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
  await expect(today).toHaveAttribute("aria-expanded", "false");
});

test("remembers last used account", async ({ page }) => {
  await page.getByRole("button", { name: "Add expense" }).click();
  const account = page.getByLabel("Account", { exact: true });
  const bankId = await account.locator("option", { hasText: "Bank" }).getAttribute("value");
  await account.selectOption(bankId ?? "");
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("textbox", { name: "Description" }).fill("Bank snack");
  await page.getByRole("button", { name: "Choose category" }).click();
  await page.locator("button:has(span.truncate)").filter({ hasText: "Food" }).click();
  await expect(page.getByLabel("Account", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByLabel("Account", { exact: true })).toHaveValue(bankId ?? "");
  await page.getByRole("button", { name: "Close" }).click();

  await group(page, dateLabel(dates.today)).click();
  await page.getByText("Lunch groceries").locator("xpath=ancestor::button").click();
  await page.getByRole("button", { name: "Choose category" }).click();
  await page.locator("button:has(span.truncate)").filter({ hasText: "Food" }).click();
  await expect(page.getByLabel("Account", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByLabel("Account", { exact: true })).toHaveValue(bankId ?? "");
});

test("ignores stale stored account", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("cc.lastAccountId", "nonexistent"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Records" })).toBeVisible();

  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByLabel("Account", { exact: true }).locator("option:checked")).toContainText("Cash");
});
