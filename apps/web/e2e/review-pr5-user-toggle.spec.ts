import { expect, test } from "@playwright/test";
import {
  closeTestDatabase,
  seedDashboard,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./fixtures";

test.afterAll(async () => {
  await closeTestDatabase();
});

test("review probe: sequential user-like search-by clicks compose", async ({ page }) => {
  await seedDashboard();
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/search");
  await page.getByRole("button", { name: /Advanced filters/ }).click();

  await page.getByRole("button", { name: "Category", exact: true }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();

  await expect(page).toHaveURL(/[?&]by=(?=[^&]*category)(?=[^&]*account)/);
});
