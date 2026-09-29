/**
 * Emulates the Odoo 14 web client form: onchange spec, modifiers and the values sent on create.
 * Everything is derived from the server's form view arch, so view changes on Bemo are picked up.
 */

const ENTITIES = { "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" };
const decodeEntities = (text) => text.replace(/&(quot|apos|#39|lt|gt|amp);/g, (m) => ENTITIES[m]);

function readAttr(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : null;
}

/**
 * Parse <field> nodes of a form arch, keeping x2many sub-fields as "parent.child"
 * @param {string} arch - Form view arch XML
 * @returns {Array<{path: string, name: string, topLevel: boolean, onChange: boolean, forceSave: boolean, modifiers: Object}>}
 */
function parseFormFields(arch) {
  const fields = [];
  const stack = [];
  for (const match of arch.matchAll(/<(\/?)field\b([^>]*?)(\/?)>/g)) {
    const [, closing, attrs, selfClosing] = match;
    if (closing) {
      stack.pop();
      continue;
    }
    const name = readAttr(attrs, "name");
    const path = [...stack, name].join(".");
    const modifiers = readAttr(attrs, "modifiers");
    fields.push({
      path,
      name,
      topLevel: stack.length === 0,
      onChange: readAttr(attrs, "on_change") === "1",
      forceSave: readAttr(attrs, "force_save") === "1",
      modifiers: modifiers ? JSON.parse(modifiers) : {},
    });
    if (!selfClosing) stack.push(name);
  }
  return fields;
}

/**
 * The field_onchange spec the web client sends with every onchange call.
 * The web client also adds sub-fields of the chatter widgets (message_ids.*, activity_ids.*); those
 * only shape nested x2many data, which is always empty for a new record, so they are left out.
 * @param {Array} fields - Parsed fields
 * @returns {Object<string, string>}
 */
function buildOnchangeSpec(fields) {
  const spec = {};
  for (const field of fields) spec[field.path] = spec[field.path] === "1" || field.onChange ? "1" : "";
  return spec;
}

const idOf = (value) => (Array.isArray(value) && value.length === 2 && typeof value[1] === "string" ? value[0] : value);

function evalCondition([field, operator, expected], record) {
  const actual = idOf(record[field]);
  switch (operator) {
    case "=":
    case "==":
      return actual === expected || (actual === false && expected === null);
    case "!=":
    case "<>":
      return actual !== expected;
    case "in":
      return expected.includes(actual);
    case "not in":
      return !expected.includes(actual);
    case "<":
      return actual < expected;
    case ">":
      return actual > expected;
    case "<=":
      return actual <= expected;
    case ">=":
      return actual >= expected;
    default:
      throw new Error(`Unsupported modifier operator: ${operator}`);
  }
}

/**
 * Evaluate a modifier value (boolean or Odoo domain in prefix notation) against record values
 * @param {boolean|Array} modifier - e.g. true or [["state", "not in", ["draft", "confirm"]]]
 * @param {Object} record - Current values
 * @returns {boolean}
 */
function evalModifier(modifier, record) {
  if (modifier === undefined || modifier === null) return false;
  if (typeof modifier === "boolean") return modifier;
  const stack = [];
  for (let i = modifier.length - 1; i >= 0; i--) {
    const token = modifier[i];
    if (token === "&" || token === "|") {
      const a = stack.pop();
      const b = stack.pop();
      stack.push(token === "&" ? a && b : a || b);
    } else if (token === "!") {
      stack.push(!stack.pop());
    } else {
      stack.push(evalCondition(token, record));
    }
  }
  return stack.every(Boolean);
}

/**
 * Normalize onchange output into what the client keeps and sends back (many2one -> id)
 * @param {Object} value - onchange result.value
 * @returns {Object}
 */
function normalizeValues(value) {
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, idOf(v)]));
}

/**
 * x2many value with nothing in it: [] or only "clear" commands ([[5]]) as onchange returns for a new record.
 * The web client sends nothing for these on create, and the result is the same empty set.
 */
function isEmptyX2many(value) {
  return Array.isArray(value) && value.every((command) => Array.isArray(command) && command[0] === 5);
}

/**
 * Values the web client sends to create(): every top-level field except readonly ones without force_save.
 * Empty one2many command lists are left out, as the client does when nothing changed.
 * @param {Array} fields - Parsed fields
 * @param {Object} values - Current record values
 * @returns {Object}
 */
function buildCreateValues(fields, values) {
  const result = {};
  for (const field of fields) {
    if (!field.topLevel || !(field.name in values)) continue;
    const readonly = evalModifier(field.modifiers.readonly, values);
    if (readonly && !field.forceSave) continue;
    const value = values[field.name];
    if (isEmptyX2many(value)) continue;
    result[field.name] = value;
  }
  return result;
}

/**
 * Names of required fields that are empty
 * @param {Array} fields - Parsed fields
 * @param {Object} values - Current record values
 * @returns {Array<string>}
 */
function missingRequiredFields(fields, values) {
  return fields
    .filter((f) => f.topLevel && evalModifier(f.modifiers.required, values))
    .filter((f) => values[f.name] === false || values[f.name] === null || values[f.name] === undefined || values[f.name] === "")
    .map((f) => f.name);
}

/**
 * Stateful form session that mirrors the web client's onchange round-trips
 * @param {Object} rpc - RPC client
 * @param {string} model - Model name
 * @param {string} arch - Form view arch
 * @param {Object} context - Base context
 */
function createFormSession(rpc, model, arch, context) {
  const fields = parseFormFields(arch);
  const spec = buildOnchangeSpec(fields);
  let values = {};
  const warnings = [];

  async function onchange(fieldName, extraContext = {}) {
    const result = await rpc.callKw(model, "onchange", [[], values, fieldName, spec], {
      context: { ...context, ...extraContext },
    });
    if (result.warning) warnings.push(result.warning);
    values = { ...values, ...normalizeValues(result.value || {}) };
    return result;
  }

  return {
    fields,
    get values() {
      return values;
    },
    warnings,
    /** Open a new record: onchange with no values, like the "New" dialog */
    open: () => onchange([]),
    /** Set a field and run its onchange if the view declares one */
    async set(fieldName, value, extraContext) {
      values = { ...values, [fieldName]: value };
      if (spec[fieldName] === "1") await onchange(fieldName, extraContext);
    },
    missingRequired: () => missingRequiredFields(fields, values),
    createValues: () => buildCreateValues(fields, values),
  };
}

module.exports = {
  parseFormFields,
  buildOnchangeSpec,
  evalModifier,
  buildCreateValues,
  missingRequiredFields,
  createFormSession,
};
