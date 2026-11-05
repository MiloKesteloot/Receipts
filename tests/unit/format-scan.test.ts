import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  centsToInput,
  cleanItemName,
  cleanMerchant,
  cleanText,
  formatDollars,
  formatMoney,
  stripItemCode,
  titleCaseIfShouting,
} from "@/lib/format-scan";

describe("cleanText", () => {
  it("collapses spaces and line breaks and trims", () => {
    assert.equal(cleanText("  WHOLE \n MILK\t 1GAL "), "WHOLE MILK 1GAL");
  });

  it("turns null and undefined into an empty string", () => {
    assert.equal(cleanText(null), "");
    assert.equal(cleanText(undefined), "");
  });
});

describe("titleCaseIfShouting", () => {
  it("title-cases all-caps text", () => {
    assert.equal(titleCaseIfShouting("ORGANIC BANANAS"), "Organic Bananas");
    assert.equal(titleCaseIfShouting("HALF-AND-HALF"), "Half-And-Half");
    assert.equal(titleCaseIfShouting("TRADER JOE'S"), "Trader Joe's");
  });

  it("leaves mixed-case text alone", () => {
    assert.equal(titleCaseIfShouting("Latte Large"), "Latte Large");
    assert.equal(titleCaseIfShouting("iPhone case"), "iPhone case");
  });

  it("leaves words with digits alone", () => {
    assert.equal(titleCaseIfShouting("7UP SODA"), "7UP Soda");
  });

  it("leaves text with no letters alone", () => {
    assert.equal(titleCaseIfShouting("123 456"), "123 456");
    assert.equal(titleCaseIfShouting(""), "");
  });
});

describe("stripItemCode", () => {
  it("drops a long leading code", () => {
    assert.equal(stripItemCode("00123 MILK"), "MILK");
  });

  it("keeps short numbers that may be part of the name", () => {
    assert.equal(stripItemCode("1000 Island Dressing"), "1000 Island Dressing");
    assert.equal(stripItemCode("4011 BANANAS"), "4011 BANANAS");
  });

  it("keeps a code when nothing follows it", () => {
    assert.equal(stripItemCode("123456"), "123456");
  });
});

describe("cleanItemName", () => {
  it("strips the code, tidies spaces and title-cases", () => {
    assert.equal(cleanItemName("00123  WHOLE\nMILK "), "Whole Milk");
  });

  it("adds the quantity when it is a whole number above 1", () => {
    assert.equal(cleanItemName("Taco", 3), "Taco ×3");
  });

  it("does not add a quantity of 1 or a weight", () => {
    assert.equal(cleanItemName("Taco", 1), "Taco");
    assert.equal(cleanItemName("Apples", 1.34), "Apples");
    assert.equal(cleanItemName("Apples", null), "Apples");
  });

  it("returns an empty name when nothing was read, even with a quantity", () => {
    assert.equal(cleanItemName("", 3), "");
    assert.equal(cleanItemName(null), "");
    assert.equal(cleanItemName("   "), "");
  });
});

describe("cleanMerchant", () => {
  it("title-cases an all-caps store name", () => {
    assert.equal(cleanMerchant("CAFE ROMA"), "Cafe Roma");
  });

  it("returns an empty string when none was read", () => {
    assert.equal(cleanMerchant(null), "");
  });
});

describe("centsToInput", () => {
  it("formats cents as plain two-decimal text", () => {
    assert.equal(centsToInput(0), "0.00");
    assert.equal(centsToInput(5), "0.05");
    assert.equal(centsToInput(1250), "12.50");
    assert.equal(centsToInput(123456), "1234.56");
  });

  it("keeps the sign of a negative amount", () => {
    assert.equal(centsToInput(-150), "-1.50");
  });
});

describe("formatMoney and formatDollars", () => {
  it("formats USD by default", () => {
    assert.equal(formatMoney(1766), "$17.66");
    assert.equal(formatMoney(1766, "USD"), "$17.66");
  });

  it("formats other currencies with their symbol", () => {
    assert.equal(formatMoney(500, "EUR"), "€5.00");
  });

  it("falls back to the code for an unsupported currency", () => {
    assert.equal(formatMoney(500, "NOPE"), "5.00 NOPE");
  });

  it("formats dollars, negatives and missing amounts", () => {
    assert.equal(formatDollars(4.1), "$4.10");
    assert.equal(formatDollars(-1.5), "-$1.50");
    assert.equal(formatDollars(null), "—");
  });
});
