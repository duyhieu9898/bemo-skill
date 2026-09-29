const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseFormFields, buildOnchangeSpec, evalModifier, buildCreateValues, missingRequiredFields } = require("../src/rpc/form");

const arch = fs.readFileSync(path.join(__dirname, "fixtures", "hr-leave-dialog-form.xml"), "utf8");
const fields = parseFormFields(arch);

// Values after the dialog was filled (ids are fake)
const filled = {
  can_reset: true, can_approve: false, can_refuse: false, state: "confirm", responsible_can_refuse: false,
  tz: "Asia/Saigon", tz_mismatch: false, holiday_type: "employee", leave_type_request_unit: "hour",
  holiday_status_id: 44, employee_id: 10, manager_id: 20, division_id: 4, approve_by_id: 30,
  date_from: "2026-09-30 01:00:00", date_to: "2026-09-30 01:15:00",
  number_of_minutes_display: 15, number_of_hours_display: 0.25, number_of_days: 0.03125,
  email_cc_ids: [[5]], validation_type: "manager", approval_2nd_id: 40, name: "reason",
  message_follower_ids: [[5]], activity_ids: [[5]], message_ids: [[5]],
};

test("onchange spec matches the one the web client sends (top-level fields)", () => {
  // Captured from the real dialog; chatter sub-fields are intentionally omitted.
  assert.deepEqual(buildOnchangeSpec(fields), {
    can_reset: "", can_approve: "", can_refuse: "", state: "1", responsible_can_refuse: "", tz: "1",
    tz_mismatch: "", holiday_type: "1", leave_type_request_unit: "", holiday_status_id: "1", employee_id: "1",
    manager_id: "", division_id: "", approve_by_id: "", date_from: "1", date_to: "1",
    number_of_minutes_display: "", number_of_hours_display: "1", number_of_days: "1", email_cc_ids: "",
    validation_type: "", approval_2nd_id: "", name: "", message_follower_ids: "", activity_ids: "", message_ids: "",
  });
});

test("create values skip readonly fields unless force_save, and empty x2many", () => {
  assert.deepEqual(buildCreateValues(fields, filled), {
    state: "confirm", holiday_type: "employee", holiday_status_id: 44, employee_id: 10, manager_id: 20,
    division_id: 4, approve_by_id: 30, date_from: "2026-09-30 01:00:00", date_to: "2026-09-30 01:15:00",
    number_of_minutes_display: 15, number_of_hours_display: 0.25, number_of_days: 0.03125,
    approval_2nd_id: 40, name: "reason",
  });
});

test("state-dependent readonly: dates are not sent once the request is validated", () => {
  const values = buildCreateValues(fields, { ...filled, state: "validate" });
  assert.equal("date_from" in values, false);
  assert.equal("holiday_status_id" in values, false);
});

test("approval_2nd_id is required only for manager_director validation", () => {
  const values = { ...filled, approval_2nd_id: false };
  assert.deepEqual(missingRequiredFields(fields, values), []);
  assert.deepEqual(missingRequiredFields(fields, { ...values, validation_type: "manager_director" }), ["approval_2nd_id"]);
});

test("evalModifier supports prefix operators and many2one pairs", () => {
  assert.equal(evalModifier(["|", ["state", "=", "draft"], ["state", "=", "confirm"]], { state: "confirm" }), true);
  assert.equal(evalModifier(["!", ["state", "in", ["draft"]]], { state: "draft" }), false);
  assert.equal(evalModifier([["employee_id", "=", 10]], { employee_id: [10, "Someone"] }), true);
  assert.throws(() => evalModifier([["x", "like", "a"]], {}), /Unsupported modifier operator/);
});
