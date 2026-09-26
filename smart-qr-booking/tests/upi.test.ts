import { test } from "node:test";
import assert from "node:assert/strict";
import { upiPayLink } from "../src/lib/upi";

test("UPI deep link: payee, name, amount with paise, currency, note", () => {
  const link = upiPayLink({ upiId: "coral@okhdfc", name: "The Coral Courtyard", amount: 1800, note: "HTL-20261012-007" });
  assert.equal(link, "upi://pay?pa=coral@okhdfc&pn=The%20Coral%20Courtyard&am=1800.00&cu=INR&tn=HTL-20261012-007");
});
