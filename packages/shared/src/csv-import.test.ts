import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExpenseCsv, parseCsvAmount } from "./csv-import.ts";

test("parses the supported export format", () => {
  const csv = [
    "date,account,category,amount,currency,converted amount,currency,description",
    "9/2/2022,Cash,Salary,216000,INR,216000,INR,Salary",
    "9/2/2022,Cash,Bills,-89700,INR,-89700,INR,Credit card bill",
    "28/2/2022,Cash,Fitness,-603,INR,-603,INR,PlayO",
    "",
  ].join("\n");
  const res = parseExpenseCsv(csv);
  assert.equal(res.errors.length, 0);
  assert.equal(res.rows.length, 3);
  // 28/2 forces day-first interpretation for the whole file
  assert.equal(res.dateOrderAmbiguous, false);
  assert.deepEqual(res.rows[0], {
    date: "2022-02-09",
    account: "Cash",
    category: "Salary",
    amountMinor: 21600000,
    type: "INCOME",
    currency: "INR",
    note: "Salary",
  });
  assert.equal(res.rows[1].type, "EXPENSE");
  assert.equal(res.rows[1].amountMinor, 8970000);
  assert.equal(res.rows[2].date, "2022-02-28");
});

test("ambiguous dates fall back to the requested order", () => {
  const csv =
    "date,account,category,amount,currency,converted amount,currency,description\n" +
    "9/2/2022,Cash,Food,-100,INR,-100,INR,x";
  const dmy = parseExpenseCsv(csv, "auto", "DMY");
  assert.equal(dmy.dateOrderAmbiguous, true);
  assert.equal(dmy.rows[0].date, "2022-02-09");
  const mdy = parseExpenseCsv(csv, "MDY");
  assert.equal(mdy.rows[0].date, "2022-09-02");
});

test("handles quoted fields, semicolons and decimal commas", () => {
  const csv =
    'date;account;category;amount;currency;converted amount;currency;description\n' +
    '01.02.2023;"My; Card";Food;-1.234,56;EUR;-1.234,56;EUR;"Dinner, out"';
  const res = parseExpenseCsv(csv);
  assert.equal(res.errors.length, 0);
  assert.deepEqual(res.rows[0].account, "My; Card");
  assert.equal(res.rows[0].amountMinor, 123456);
  assert.equal(res.rows[0].note, "Dinner, out");
  assert.equal(res.rows[0].date, "2023-02-01");
});

test("amount parsing edge cases", () => {
  assert.equal(parseCsvAmount("216,000"), 21600000);
  assert.equal(parseCsvAmount("-89 700"), -8970000);
  assert.equal(parseCsvAmount("12.5"), 1250);
  assert.equal(parseCsvAmount("0.99"), 99);
  assert.equal(parseCsvAmount("abc"), null);
});

test("rejects files without the expected header", () => {
  const res = parseExpenseCsv("foo,bar\n1,2");
  assert.equal(res.rows.length, 0);
  assert.equal(res.errors.length, 1);
});
