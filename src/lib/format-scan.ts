/**
 * Pure helpers that tidy text and money read by the scanner before it reaches
 * the receipt form or the screen. Rules are deliberately conservative: the user
 * can always edit the result, and over-cleaning can damage real names.
 */

/**
 * A leading run of digits is treated as a store item code (and dropped) only
 * when it has at least this many digits, so "1000 Island Dressing" survives.
 */
const MIN_ITEM_CODE_DIGITS = 5;

/**
 * Shown in place of an amount the scanner did not find.
 */
const MISSING_AMOUNT = "—";

/**
 * Collapses runs of whitespace (including line breaks) into single spaces and trims.
 * @param raw Text as read by the scanner
 * @returns Tidy single-line text, or "" for null or undefined
 */
export function cleanText(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Title-cases text that is entirely UPPERCASE, as many receipts print it.
 * Mixed-case text is left alone, and so are words that contain digits (7UP).
 * @param text Single-line text
 * @returns Title-cased text when it was all caps, otherwise unchanged
 */
export function titleCaseIfShouting(text: string): string {
  if (!/\p{L}/u.test(text) || /\p{Ll}/u.test(text)) return text;
  return text
    .split(" ")
    .map((word) =>
      /\d/.test(word)
        ? word
        : word
            .toLowerCase()
            .replace(/(^|[-/])(\p{L})/gu, (_m, sep: string, letter: string) =>
              sep + letter.toUpperCase(),
            ),
    )
    .join(" ");
}

/**
 * Removes a long leading item code, such as "00123 MILK" becoming "MILK".
 * @param name Single-line item name
 * @returns The name without the leading code
 */
export function stripItemCode(name: string): string {
  const match = /^(\d+)\s+(.+)$/.exec(name);
  if (match && match[1].length >= MIN_ITEM_CODE_DIGITS) return match[2];
  return name;
}

/**
 * Cleans an item description for the form. A whole-number quantity above 1 is
 * added as " ×N", because the form has no quantity field.
 * @param raw Description as read by the scanner
 * @param quantity Quantity read by the scanner, if any
 * @returns A tidy item name, or "" when there is no readable description
 */
export function cleanItemName(
  raw: string | null | undefined,
  quantity: number | null = null,
): string {
  const name = titleCaseIfShouting(stripItemCode(cleanText(raw)));
  if (name === "") return "";
  const showQuantity =
    quantity !== null && Number.isInteger(quantity) && quantity > 1;
  return showQuantity ? `${name} ×${quantity}` : name;
}

/**
 * Cleans a merchant name for the form's Store field.
 * @param raw Merchant as read by the scanner
 * @returns A tidy store name, or "" when none was read
 */
export function cleanMerchant(raw: string | null | undefined): string {
  return titleCaseIfShouting(cleanText(raw));
}

/**
 * Formats cents as the plain text the form's amount fields expect.
 * @param cents Amount in cents
 * @returns Text such as "12.50" (never a currency symbol or thousands separator)
 */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Formats cents as money for display, in the receipt's currency.
 * Falls back to "5.00 CODE" if the currency code is not supported on the device.
 * @param cents Amount in cents
 * @param currency ISO currency code such as "USD"; defaults to USD when null
 * @returns Formatted money, such as "$17.66"
 */
export function formatMoney(
  cents: number,
  currency: string | null = null,
): string {
  const code = currency ?? "USD";
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

/**
 * Formats a dollar amount from the scanner, or a dash when it was not found.
 * @param dollars Amount in dollars, or null when the scanner did not find it
 * @param currency ISO currency code, or null for USD
 * @returns Formatted money, or "—"
 */
export function formatDollars(
  dollars: number | null,
  currency: string | null = null,
): string {
  return dollars === null
    ? MISSING_AMOUNT
    : formatMoney(Math.round(dollars * 100), currency);
}
