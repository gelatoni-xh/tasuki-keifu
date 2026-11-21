import { strict as assert } from "node:assert";
import { test } from "node:test";
import { overlapYears } from "./matrix-overlaps";

const membership = { personId: "p", organizationId: "o", organization: { type: "university" }, startDate: new Date("2021-04-01Z"), endDate: new Date("2025-03-31Z"), startYear: null, endYear: null, endState: "ended" };

test("calculates elapsed overlapping years and rejects unknown boundaries", () => {
  const younger = { ...membership, startDate: new Date("2022-04-01Z"), endDate: new Date("2026-03-31Z") };
  assert.equal(overlapYears(membership, younger), 3);
  assert.equal(overlapYears(membership, { ...younger, startDate: null }), undefined);
  assert.equal(overlapYears(membership, { ...younger, endDate: null, endState: "unknown" }), undefined);
  assert.equal(overlapYears(membership, { ...younger, endDate: null, endState: "ongoing" }, new Date("2024-04-01Z")), 2);
});
