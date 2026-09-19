// Generated from verified WASD source. Edit WASD source and rebuild; never edit this artifact.
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/src/aurion/npc/authority.ts
var WASD_NPC_MEMORY_RULESET = "wasd-aurion-npc-memory.v4";
function npcAuthority() {
  if (!/^[a-f0-9]{40}$/.test("28ecb7aec84271bd3bcc4fa5e1e7deef530804b6") || false || !/^[a-f0-9]{64}$/.test("466c835cbae412e9c6a0aa851f99228216f31ae065cb944e4e8232ea59db7a85")) {
    throw new Error("WASD_NPC_COMPILED_AUTHORITY_REQUIRED");
  }
  return Object.freeze({ rulesetVersion: WASD_NPC_MEMORY_RULESET, sourceRevision: "28ecb7aec84271bd3bcc4fa5e1e7deef530804b6", sourceSha256: "466c835cbae412e9c6a0aa851f99228216f31ae065cb944e4e8232ea59db7a85" });
}

// server/src/aurion/npc/canonical.ts
function stableCatalogStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableCatalogStringify).join(",")}]`;
  const valueRecord = value;
  return `{${Object.keys(valueRecord).sort().map((key) => `${JSON.stringify(key)}:${stableCatalogStringify(valueRecord[key])}`).join(",")}}`;
}

// server/src/aurion/npc/npcNeeds.ts
import { createHash } from "node:crypto";
var npcNeedKeys = ["safety", "resources", "belonging", "status", "wealth", "power"];
var needGoal = {
  safety: "seek_safety",
  resources: "gather_resources",
  belonging: "socialize",
  status: "gain_reputation",
  wealth: "trade",
  power: "expand_influence"
};
var needTieOrder = ["safety", "resources", "belonging", "status", "wealth", "power"];
function clampUnit(value) {
  return Math.max(0, Math.min(1, Math.round(value * 1e4) / 1e4));
}
function clampSigned(value) {
  return Math.max(-1, Math.min(1, Math.round(value * 1e4) / 1e4));
}
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function canonicalHash(parts) {
  return createHash("sha256").update(parts.join(""), "utf8").digest("hex");
}
function defaultNeeds() {
  return { safety: 0.8, resources: 0.5, belonging: 0.4, status: 0.3, wealth: 0.3, power: 0.2 };
}
function resolveNpcNeeds(input) {
  const next2 = { ...defaultNeeds(), ...input.current };
  input.events.slice().sort((left, right) => left.resolutionIndex - right.resolutionIndex || compareText(left.sourceReceiptId, right.sourceReceiptId) || compareText(left.id, right.id)).forEach((event) => {
    next2[event.need] = clampUnit(next2[event.need] + clampSigned(event.delta));
  });
  return next2;
}
function decideNpcGoal(input) {
  const selectedNeed = needTieOrder.reduce((selected, candidate) => input.needs[candidate] < input.needs[selected] ? candidate : selected, needTieOrder[0]);
  const observations2 = input.observationIds.slice().sort(compareText);
  const decisionHash = canonicalHash([input.npcId, String(input.resolutionIndex), selectedNeed, ...observations2, ...needTieOrder.map((need) => `${need}:${input.needs[need]}`)]);
  return { npcId: input.npcId, goal: needGoal[selectedNeed], needs: input.needs, observationIds: observations2, decisionHash, resolutionIndex: input.resolutionIndex };
}

// server/src/aurion/npc/npcLifeProtocol.ts
import { createHash as createHash2 } from "node:crypto";

// node_modules/.pnpm/zod@4.6.1/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/.pnpm/zod@4.6.1/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/.pnpm/zod@4.6.1/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (el === "_errors") {
              if (terminal)
                curr._errors.push(mapper(issue));
              i++;
              continue;
            }
            if (!Object.prototype.hasOwnProperty.call(curr, el)) {
              if (el === "__proto__") {
                Object.defineProperty(curr, el, {
                  value: { _errors: [] },
                  writable: true,
                  enumerable: true,
                  configurable: true
                });
              } else {
                curr[el] = { _errors: [] };
              }
            }
            curr = curr[el];
            if (terminal) {
              curr._errors.push(mapper(issue));
            }
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = /* @__PURE__ */ Object.create(null);
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/.pnpm/zod@4.6.1/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/.pnpm/zod@4.6.1/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/.pnpm/zod@4.6.1/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/.pnpm/zod@4.6.1/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/.pnpm/zod@4.6.1/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index5) {
    return new _ZodObject({
      ...this._def,
      catchall: index5
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    if (Object.prototype.hasOwnProperty.call(newObj, "__proto__"))
      delete newObj.__proto__;
    for (const key of sharedKeys) {
      if (key === "__proto__")
        continue;
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index5 = 0; index5 < a.length; index5++) {
      const itemA = a[index5];
      const itemB = b[index5];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index5) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index5, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index5, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze2 = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze2(data)) : freeze2(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// server/src/aurion/npc/npcLifeProtocol.ts
var NPC_LIFE_VERSION = "aurion-npc-life.v1";
var NPC_LIFE_MAX_RELATIONSHIPS = 64;
var NPC_LIFE_MAX_OPPORTUNITIES = 128;
var NPC_LIFE_MAX_PLAN_STEPS = 6;
var NPC_LIFE_MEMORY_HORIZON = 3500;
var id = external_exports.string().min(1).max(96).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
var index = external_exports.number().int().min(0).max(2147483647);
var bps = external_exports.number().int().min(0).max(1e4);
var signedBps = external_exports.number().int().min(-1e4).max(1e4);
var copper = external_exports.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
var signedCopper = external_exports.number().int().min(-1e9).max(1e9);
var npcLifeGoals = ["seek_safety", "gather_resources", "socialize", "gain_reputation", "trade", "expand_influence"];
var npcLifeOpportunityKinds = ["safe_hub", "resource", "social", "reputation", "market", "influence"];
var npcLifePlanActions = ["travel_to_safety", "recover_safety", "travel_to_resource", "gather_resource", "approach_actor", "socialize", "serve_region", "gain_reputation", "reach_market", "trade", "approach_influence_target", "extend_influence"];
var personalitySchema = external_exports.object({ empathyBps: bps, courageBps: bps, curiosityBps: bps, loyaltyBps: bps, ambitionBps: bps, prudenceBps: bps }).strict();
var npcRelationshipEventSchema = external_exports.object({ id, targetId: id, trustDeltaBps: signedBps.default(0), affectionDeltaBps: signedBps.default(0), fearDeltaBps: signedBps.default(0), rivalryDeltaBps: signedBps.default(0), debtDeltaCopper: signedCopper.default(0), sourceReceiptId: external_exports.string().min(3).max(128), resolutionIndex: index }).strict();
var relationshipSchema = external_exports.object({ targetId: id, trustBps: bps, affectionBps: bps, fearBps: bps, rivalryBps: bps, debtCopper: signedCopper, lastResolutionIndex: index }).strict();
var npcLifeOpportunitySchema = external_exports.object({ id, kind: external_exports.enum(npcLifeOpportunityKinds), regionId: id, targetId: id.optional(), benefitBps: bps, riskBps: bps, distanceBps: bps, sourceReceiptId: external_exports.string().min(3).max(128), resolutionIndex: index }).strict();
var npcEconomyLifeStateSchema = external_exports.object({ currentHubId: id, wealthCopper: copper, hungerBps: bps, fatigueBps: bps, tradeProwessBps: external_exports.number().int().min(0).max(3e4), harvestYieldBps: external_exports.number().int().min(0).max(3e4) }).strict();
var planStepSchema = external_exports.object({ action: external_exports.enum(npcLifePlanActions), opportunityId: id, regionId: id, targetId: id.optional() }).strict();
var planSchema = external_exports.object({ status: external_exports.enum(["planned", "blocked"]), goal: external_exports.enum(npcLifeGoals), opportunityId: id.nullable(), steps: external_exports.array(planStepSchema).max(NPC_LIFE_MAX_PLAN_STEPS), planHash: external_exports.string().regex(/^[a-f0-9]{64}$/) }).strict();
var stateSchema = external_exports.object({ version: external_exports.literal(NPC_LIFE_VERSION), npcId: id, homeRegionId: id, roleId: id, personality: personalitySchema, relationships: external_exports.array(relationshipSchema).max(NPC_LIFE_MAX_RELATIONSHIPS), currentGoal: external_exports.enum(npcLifeGoals), currentGoalSinceResolutionIndex: index, longTermGoal: external_exports.enum(npcLifeGoals), longTermGoalSinceResolutionIndex: index, plan: planSchema, economy: npcEconomyLifeStateSchema.optional(), lastResolutionIndex: index, decisionCount: external_exports.number().int().min(1).max(2147483647), stateHash: external_exports.string().regex(/^[a-f0-9]{64}$/) }).strict();
var needForGoal = Object.freeze({ seek_safety: "safety", gather_resources: "resources", socialize: "belonging", gain_reputation: "status", trade: "wealth", expand_influence: "power" });
var opportunityForGoal = Object.freeze({ seek_safety: "safe_hub", gather_resources: "resource", socialize: "social", gain_reputation: "reputation", trade: "market", expand_influence: "influence" });
function compareText2(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
function lifeHash(value) {
  return createHash2("sha256").update(stableCatalogStringify(value), "utf8").digest("hex");
}
function withoutStateHash(state) {
  const { stateHash: _ignored, ...rest } = state;
  return rest;
}
function parseNpcEconomyLifeState(value) {
  const e = npcEconomyLifeStateSchema.parse(value);
  return Object.freeze({ ...e, currentHubId: e.currentHubId, wealthCopper: e.wealthCopper, hungerBps: e.hungerBps, fatigueBps: e.fatigueBps, tradeProwessBps: e.tradeProwessBps, harvestYieldBps: e.harvestYieldBps });
}
function parseNpcLifeOpportunity(value) {
  const e = npcLifeOpportunitySchema.parse(value);
  return { ...e, id: e.id, kind: e.kind, regionId: e.regionId, benefitBps: e.benefitBps, riskBps: e.riskBps, distanceBps: e.distanceBps, sourceReceiptId: e.sourceReceiptId, resolutionIndex: e.resolutionIndex };
}
function parseNpcRelationshipEvent(value) {
  const e = npcRelationshipEventSchema.parse(value);
  return { ...e, id: e.id, targetId: e.targetId, trustDeltaBps: e.trustDeltaBps, affectionDeltaBps: e.affectionDeltaBps, fearDeltaBps: e.fearDeltaBps, rivalryDeltaBps: e.rivalryDeltaBps, debtDeltaCopper: e.debtDeltaCopper, sourceReceiptId: e.sourceReceiptId, resolutionIndex: e.resolutionIndex };
}
function freezePlan(plan) {
  return Object.freeze({
    ...plan,
    status: plan.status,
    goal: plan.goal,
    opportunityId: plan.opportunityId,
    planHash: plan.planHash,
    steps: Object.freeze(plan.steps.map((step) => Object.freeze({ ...step, action: step.action, opportunityId: step.opportunityId, regionId: step.regionId })))
  });
}
function freezeState(parsed) {
  const p = parsed.personality;
  const { economy, ...required } = parsed;
  return Object.freeze({
    ...required,
    version: parsed.version,
    npcId: parsed.npcId,
    homeRegionId: parsed.homeRegionId,
    roleId: parsed.roleId,
    currentGoal: parsed.currentGoal,
    currentGoalSinceResolutionIndex: parsed.currentGoalSinceResolutionIndex,
    longTermGoal: parsed.longTermGoal,
    longTermGoalSinceResolutionIndex: parsed.longTermGoalSinceResolutionIndex,
    lastResolutionIndex: parsed.lastResolutionIndex,
    decisionCount: parsed.decisionCount,
    stateHash: parsed.stateHash,
    personality: Object.freeze({ empathyBps: p.empathyBps, courageBps: p.courageBps, curiosityBps: p.curiosityBps, loyaltyBps: p.loyaltyBps, ambitionBps: p.ambitionBps, prudenceBps: p.prudenceBps }),
    relationships: Object.freeze(parsed.relationships.map((e) => Object.freeze({ targetId: e.targetId, trustBps: e.trustBps, affectionBps: e.affectionBps, fearBps: e.fearBps, rivalryBps: e.rivalryBps, debtCopper: e.debtCopper, lastResolutionIndex: e.lastResolutionIndex }))),
    plan: freezePlan(parsed.plan),
    ...economy ? { economy: parseNpcEconomyLifeState(economy) } : {}
  });
}
function parseNpcLifeState(value) {
  const parsed = stateSchema.parse(value);
  if (parsed.relationships.some((entry2, i) => i > 0 && parsed.relationships[i - 1].targetId >= entry2.targetId)) throw new Error("NPC_LIFE_RELATIONSHIP_ORDER_INVALID");
  if (parsed.plan.status === "blocked" ? parsed.plan.opportunityId !== null || parsed.plan.steps.length !== 0 : parsed.plan.opportunityId === null || parsed.plan.steps.length === 0) throw new Error("NPC_LIFE_PLAN_INVALID");
  if (parsed.plan.planHash !== lifeHash({ goal: parsed.plan.goal, opportunityId: parsed.plan.opportunityId, steps: parsed.plan.steps })) throw new Error("NPC_LIFE_PLAN_HASH_INVALID");
  if (parsed.stateHash !== lifeHash(withoutStateHash(parsed))) throw new Error("NPC_LIFE_STATE_HASH_INVALID");
  return freezeState(parsed);
}
function deriveNpcPersonality(npcId) {
  id.parse(npcId);
  const bytes = createHash2("sha256").update(`${NPC_LIFE_VERSION}${npcId}`, "utf8").digest();
  const value = (offset) => 2e3 + bytes.readUInt16BE(offset) % 6001;
  return Object.freeze({ empathyBps: value(0), courageBps: value(2), curiosityBps: value(4), loyaltyBps: value(6), ambitionBps: value(8), prudenceBps: value(10) });
}
function decayToward(value, target, ticks, perTick) {
  if (value === target || ticks <= 0) return value;
  const movement = Math.min(Math.abs(value - target), ticks * perTick);
  return value < target ? value + movement : value - movement;
}
function advanceRelationships(input) {
  const map = /* @__PURE__ */ new Map();
  for (const previous of input.previous?.relationships ?? []) {
    if (previous.lastResolutionIndex > input.resolutionIndex) throw new Error("NPC_LIFE_RELATIONSHIP_CLOCK_REWIND");
    const elapsed = input.resolutionIndex - previous.lastResolutionIndex;
    map.set(previous.targetId, Object.freeze({ ...previous, trustBps: decayToward(previous.trustBps, 5e3, elapsed, 1), affectionBps: decayToward(previous.affectionBps, 0, elapsed, 1), fearBps: decayToward(previous.fearBps, 0, elapsed, 2), rivalryBps: decayToward(previous.rivalryBps, 0, elapsed, 1), lastResolutionIndex: input.resolutionIndex }));
  }
  const events = input.events.map((event) => npcRelationshipEventSchema.parse(event)).slice().sort((a, b) => compareText2(a.sourceReceiptId, b.sourceReceiptId) || compareText2(a.id, b.id));
  if (events.some((event) => event.resolutionIndex !== input.resolutionIndex || event.targetId === input.npcId)) throw new Error("NPC_LIFE_RELATIONSHIP_EVENT_INVALID");
  if (new Set(events.map((event) => event.id)).size !== events.length) throw new Error("NPC_LIFE_DUPLICATE_RELATIONSHIP_EVIDENCE");
  for (const event of events) {
    const current = map.get(event.targetId) ?? Object.freeze({ targetId: event.targetId, trustBps: 5e3, affectionBps: 0, fearBps: 0, rivalryBps: 0, debtCopper: 0, lastResolutionIndex: input.resolutionIndex });
    map.set(event.targetId, Object.freeze({ targetId: event.targetId, trustBps: clampInt(current.trustBps + event.trustDeltaBps, 0, 1e4), affectionBps: clampInt(current.affectionBps + event.affectionDeltaBps, 0, 1e4), fearBps: clampInt(current.fearBps + event.fearDeltaBps, 0, 1e4), rivalryBps: clampInt(current.rivalryBps + event.rivalryDeltaBps, 0, 1e4), debtCopper: clampInt(current.debtCopper + event.debtDeltaCopper, -1e9, 1e9), lastResolutionIndex: input.resolutionIndex }));
  }
  if (map.size > NPC_LIFE_MAX_RELATIONSHIPS) throw new Error("NPC_LIFE_RELATIONSHIP_CAPACITY_EXCEEDED");
  return Object.freeze([...map.values()].sort((a, b) => compareText2(a.targetId, b.targetId)));
}
function memoryUtility(goal, entries, resolutionIndex) {
  let total = 0;
  for (const entry2 of entries) {
    if (entry2.lastSeenIndex > resolutionIndex) throw new Error("NPC_LIFE_MEMORY_CLOCK_REWIND");
    const age = resolutionIndex - entry2.lastSeenIndex;
    if (age >= NPC_LIFE_MEMORY_HORIZON) continue;
    const salience = Math.max(0, 2500 - Math.floor(age * 2500 / NPC_LIFE_MEMORY_HORIZON));
    const text = entry2.text.toLowerCase();
    const relevant = goal === "seek_safety" ? /danger:|ambush|hazard|attack/.test(text) : goal === "gather_resources" ? /produce:|resource:|gather:/.test(text) : goal === "socialize" ? /social:|friend|helped|talk/.test(text) : goal === "gain_reputation" ? /reputation:|status:|quest:|patrol/.test(text) : goal === "trade" ? /trade:|market:|price:|sell:|buy:/.test(text) : /influence:|politics:|leadership:|territory:/.test(text);
    if (relevant) total += salience;
  }
  return Math.min(5e3, total);
}
function relationshipUtility(goal, relationships) {
  if (!relationships.length) return 0;
  let best = 0;
  for (const relationship of relationships) {
    const value = goal === "seek_safety" ? Math.floor((relationship.fearBps + relationship.rivalryBps) / 4) : goal === "socialize" ? Math.floor((relationship.affectionBps + (1e4 - relationship.trustBps)) / 5) : goal === "gain_reputation" || goal === "expand_influence" ? Math.floor(relationship.rivalryBps / 3) : goal === "trade" ? Math.min(2500, Math.floor(Math.abs(relationship.debtCopper) / 100)) : 0;
    best = Math.max(best, value);
  }
  return Math.min(5e3, best);
}
function personalityUtility(goal, personality) {
  const raw = goal === "seek_safety" ? personality.prudenceBps + (1e4 - personality.courageBps) : goal === "gather_resources" ? personality.prudenceBps + personality.ambitionBps : goal === "socialize" ? personality.empathyBps + personality.loyaltyBps : goal === "gain_reputation" ? personality.ambitionBps + personality.loyaltyBps : goal === "trade" ? personality.ambitionBps + personality.prudenceBps : personality.ambitionBps + (1e4 - personality.empathyBps);
  return Math.floor(raw / 4);
}
function opportunityNet(opportunity) {
  return clampInt(opportunity.benefitBps - Math.floor(opportunity.riskBps / 2) - Math.floor(opportunity.distanceBps / 4), 0, 1e4);
}
function bestOpportunity(goal, opportunities) {
  return opportunities.filter((value) => value.kind === opportunityForGoal[goal]).slice().sort((a, b) => opportunityNet(b) - opportunityNet(a) || compareText2(a.id, b.id))[0];
}
function makePlan(goal, opportunities) {
  const opportunity = bestOpportunity(goal, opportunities);
  if (!opportunity) {
    const raw = { status: "blocked", goal, opportunityId: null, steps: [] };
    return Object.freeze({ ...raw, steps: Object.freeze(raw.steps), planHash: lifeHash({ goal, opportunityId: null, steps: raw.steps }) });
  }
  const actionPairs = Object.freeze({ seek_safety: ["travel_to_safety", "recover_safety"], gather_resources: ["travel_to_resource", "gather_resource"], socialize: ["approach_actor", "socialize"], gain_reputation: ["serve_region", "gain_reputation"], trade: ["reach_market", "trade"], expand_influence: ["approach_influence_target", "extend_influence"] });
  const steps = actionPairs[goal].map((action) => Object.freeze({ action, opportunityId: opportunity.id, regionId: opportunity.regionId, ...opportunity.targetId ? { targetId: opportunity.targetId } : {} }));
  return Object.freeze({ status: "planned", goal, opportunityId: opportunity.id, steps: Object.freeze(steps), planHash: lifeHash({ goal, opportunityId: opportunity.id, steps }) });
}
function npcLifeDecisionHash(input) {
  return lifeHash({ version: NPC_LIFE_VERSION, npcId: input.npcId, resolutionIndex: input.resolutionIndex, goal: input.goal, longTermGoal: input.longTermGoal, needs: input.needs, observationIds: [...input.observationIds].sort(compareText2), utilityBps: input.utilityBps, planHash: input.planHash, stateHash: input.stateHash });
}
function resolveNpcLife(input) {
  id.parse(input.npcId);
  id.parse(input.regionId);
  id.parse(input.roleId);
  index.parse(input.resolutionIndex);
  if (input.previous && (input.previous.npcId !== input.npcId || input.previous.lastResolutionIndex >= input.resolutionIndex)) throw new Error("NPC_LIFE_PREVIOUS_STATE_INVALID");
  const needs = Object.freeze({ ...input.needs });
  const observations2 = Object.freeze([...input.observationIds].sort(compareText2));
  if (new Set(observations2).size !== observations2.length) throw new Error("NPC_LIFE_DUPLICATE_OBSERVATION");
  const opportunities = input.opportunities.map((value) => parseNpcLifeOpportunity(value)).slice().sort((a, b) => compareText2(a.sourceReceiptId, b.sourceReceiptId) || compareText2(a.id, b.id));
  if (opportunities.length > NPC_LIFE_MAX_OPPORTUNITIES || new Set(opportunities.map((value) => value.id)).size !== opportunities.length || opportunities.some((value) => value.resolutionIndex !== input.resolutionIndex)) throw new Error("NPC_LIFE_OPPORTUNITY_EVIDENCE_INVALID");
  const personality = input.previous?.personality ?? deriveNpcPersonality(input.npcId);
  const relationships = advanceRelationships({ npcId: input.npcId, previous: input.previous, events: input.relationshipEvents, resolutionIndex: input.resolutionIndex });
  const utility = {};
  for (const goal of npcLifeGoals) {
    const need = needForGoal[goal];
    const satisfactionBps = clampInt(needs[need] * 1e4, 0, 1e4);
    const pressure = 1e4 - satisfactionBps;
    const opportunity = bestOpportunity(goal, opportunities);
    let score = pressure * 2 + personalityUtility(goal, personality) + memoryUtility(goal, input.memoryEntries, input.resolutionIndex) + relationshipUtility(goal, relationships) + Math.floor((opportunity ? opportunityNet(opportunity) : 0) / 2);
    if (input.previous?.currentGoal === goal) score += input.resolutionIndex - input.previous.currentGoalSinceResolutionIndex < 500 ? 1500 : 800;
    if (input.previous?.longTermGoal === goal) score += 600;
    if (goal === "seek_safety" && pressure >= 7500) score += 5e3;
    if (goal === "gather_resources" && pressure >= 8500) score += 3e3;
    utility[goal] = clampInt(score, 0, 4e4);
  }
  const ranked = npcLifeGoals.slice().sort((a, b) => utility[b] - utility[a] || npcLifeGoals.indexOf(a) - npcLifeGoals.indexOf(b));
  let currentGoal = ranked[0];
  const previousGoal = input.previous?.currentGoal;
  const safetyPressure = 1e4 - clampInt(needs.safety * 1e4, 0, 1e4);
  if (previousGoal && currentGoal !== previousGoal && safetyPressure < 7500 && utility[currentGoal] - utility[previousGoal] < 1200) currentGoal = previousGoal;
  let longTermGoal = input.previous?.longTermGoal ?? currentGoal;
  let longTermSince = input.previous?.longTermGoalSinceResolutionIndex ?? input.resolutionIndex;
  if (input.previous && currentGoal !== longTermGoal) {
    const held = input.resolutionIndex - input.previous.longTermGoalSinceResolutionIndex;
    if (held >= 1e3 && utility[currentGoal] - utility[longTermGoal] >= 2500) {
      longTermGoal = currentGoal;
      longTermSince = input.resolutionIndex;
    }
  }
  const currentGoalSince = input.previous?.currentGoal === currentGoal ? input.previous.currentGoalSinceResolutionIndex : input.resolutionIndex;
  const plan = makePlan(currentGoal, opportunities);
  const stateWithoutHash = Object.freeze({ version: NPC_LIFE_VERSION, npcId: input.npcId, homeRegionId: input.previous?.homeRegionId ?? input.regionId, roleId: input.roleId, personality, relationships, currentGoal, currentGoalSinceResolutionIndex: currentGoalSince, longTermGoal, longTermGoalSinceResolutionIndex: longTermSince, plan, ...input.economy ?? input.previous?.economy ? { economy: Object.freeze(npcEconomyLifeStateSchema.parse(input.economy ?? input.previous.economy)) } : {}, lastResolutionIndex: input.resolutionIndex, decisionCount: (input.previous?.decisionCount ?? 0) + 1 });
  const state = parseNpcLifeState({ ...stateWithoutHash, stateHash: lifeHash(stateWithoutHash) });
  const utilityBps = Object.freeze({ ...utility });
  const decision = Object.freeze({ npcId: input.npcId, goal: currentGoal, longTermGoal, needs, observationIds: observations2, resolutionIndex: input.resolutionIndex, utilityBps, plan, decisionHash: npcLifeDecisionHash({ npcId: input.npcId, resolutionIndex: input.resolutionIndex, goal: currentGoal, longTermGoal, needs, observationIds: observations2, utilityBps, planHash: plan.planHash, stateHash: state.stateHash }) });
  return Object.freeze({ state, decision });
}

// server/src/aurion/npc/npcPersistenceProtocol.ts
import { createHash as createHash3 } from "node:crypto";
var NPC_MEMORY_VERSION = "aurion-npc-memory.v2";
var NPC_RECEIPT_VERSION = "aurion-npc-decision.v2";
var NPC_LIFE_RECEIPT_VERSION = "aurion-npc-decision.v3";
var NPC_MEMORY_CAPACITY = 24;
var NPC_MEMORY_AGE_TICKS = 3500;
var index2 = external_exports.number().int().min(0).max(2147483647);
var id2 = external_exports.string().min(1).max(96).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
var observations = external_exports.array(external_exports.string().min(1).max(120)).max(128);
var memoryText = external_exports.string().min(1).max(280);
var hash64 = external_exports.string().regex(/^[a-f0-9]{64}$/);
var npcNeedsSchema = external_exports.object({ safety: external_exports.number().finite().min(0).max(1), resources: external_exports.number().finite().min(0).max(1), belonging: external_exports.number().finite().min(0).max(1), status: external_exports.number().finite().min(0).max(1), wealth: external_exports.number().finite().min(0).max(1), power: external_exports.number().finite().min(0).max(1) }).strict();
var npcRequestSchema = external_exports.object({
  npcId: id2,
  regionId: id2,
  resolutionIndex: index2,
  needEvents: external_exports.array(external_exports.object({ id: id2, need: external_exports.enum(npcNeedKeys), delta: external_exports.number().finite().min(-1).max(1), sourceReceiptId: external_exports.string().min(3).max(128), resolutionIndex: index2 }).strict()).max(128),
  observationIds: observations,
  memory: external_exports.array(memoryText).max(NPC_MEMORY_CAPACITY),
  languageProfileId: id2.default("aurion-common-v1"),
  roleId: id2.default("resident"),
  relationshipEvents: external_exports.array(npcRelationshipEventSchema).max(NPC_LIFE_MAX_RELATIONSHIPS).default([]),
  opportunities: external_exports.array(npcLifeOpportunitySchema).max(NPC_LIFE_MAX_OPPORTUNITIES).default([]),
  economy: npcEconomyLifeStateSchema.optional()
}).strict();
function npcHash(value) {
  return createHash3("sha256").update(stableCatalogStringify(value)).digest("hex");
}
function normalizeNpcRequest(input) {
  const result = npcRequestSchema.parse(input);
  if (new Set(result.needEvents.map((e) => e.id)).size !== result.needEvents.length || new Set(result.observationIds).size !== result.observationIds.length || new Set(result.relationshipEvents.map((e) => e.id)).size !== result.relationshipEvents.length || new Set(result.opportunities.map((e) => e.id)).size !== result.opportunities.length) throw new Error("NPC_DUPLICATE_EVIDENCE");
  if (result.needEvents.some((e) => e.resolutionIndex !== result.resolutionIndex) || result.relationshipEvents.some((e) => e.resolutionIndex !== result.resolutionIndex) || result.opportunities.some((e) => e.resolutionIndex !== result.resolutionIndex)) throw new Error("NPC_EVENT_RESOLUTION_MISMATCH");
  if (result.relationshipEvents.some((e) => e.targetId === result.npcId)) throw new Error("NPC_SELF_RELATIONSHIP_EVIDENCE");
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  result.needEvents.sort((a, b) => cmp(a.sourceReceiptId, b.sourceReceiptId) || cmp(a.id, b.id));
  result.observationIds.sort(cmp);
  result.memory = [...new Set(result.memory)].sort(cmp);
  result.relationshipEvents.sort((a, b) => cmp(a.sourceReceiptId, b.sourceReceiptId) || cmp(a.id, b.id));
  result.opportunities.sort((a, b) => cmp(a.sourceReceiptId, b.sourceReceiptId) || cmp(a.id, b.id));
  const { economy, ...required } = result;
  return {
    ...required,
    npcId: result.npcId,
    regionId: result.regionId,
    resolutionIndex: result.resolutionIndex,
    languageProfileId: result.languageProfileId,
    roleId: result.roleId,
    observationIds: result.observationIds,
    memory: result.memory,
    needEvents: result.needEvents.map((e) => ({ id: e.id, need: e.need, delta: e.delta, sourceReceiptId: e.sourceReceiptId, resolutionIndex: e.resolutionIndex })),
    relationshipEvents: result.relationshipEvents.map(parseNpcRelationshipEvent),
    opportunities: result.opportunities.map(parseNpcLifeOpportunity),
    ...economy ? { economy: parseNpcEconomyLifeState(economy) } : {}
  };
}
function npcRequestHash(input, version) {
  if (version === NPC_RECEIPT_VERSION) {
    return npcHash({ npcId: input.npcId, regionId: input.regionId, resolutionIndex: input.resolutionIndex, needEvents: input.needEvents, observationIds: input.observationIds, memory: input.memory, languageProfileId: input.languageProfileId });
  }
  return npcHash(input);
}
function parseNpcJson(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 65535) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("NPC_STORED_CONTENT_CORRUPT");
  }
}
var entry = external_exports.object({ id: hash64, text: memoryText, lastSeenIndex: index2 }).strict();
var memorySchema = external_exports.object({ version: external_exports.literal(NPC_MEMORY_VERSION), entries: external_exports.array(entry).max(NPC_MEMORY_CAPACITY) }).strict();
function freezeMemory(entries) {
  return Object.freeze({ version: NPC_MEMORY_VERSION, entries: Object.freeze(entries.map((e) => Object.freeze({ id: e.id, text: e.text, lastSeenIndex: e.lastSeenIndex }))) });
}
function parseNpcMemory(raw, lastIndex) {
  const value = parseNpcJson(raw);
  if (Array.isArray(value)) {
    const texts = external_exports.array(memoryText).max(NPC_MEMORY_CAPACITY).parse(value);
    if (texts.length && lastIndex < 0) throw new Error("NPC_STORED_CONTENT_CORRUPT");
    return freezeMemory([...new Set(texts)].map((text) => ({ id: npcHash(text), text, lastSeenIndex: lastIndex })));
  }
  const parsed = memorySchema.parse(value);
  if (new Set(parsed.entries.map((e) => e.id)).size !== parsed.entries.length || parsed.entries.some((e) => e.id !== npcHash(e.text) || e.lastSeenIndex > lastIndex)) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  return freezeMemory(parsed.entries);
}
function advanceNpcMemory(current, texts, resolutionIndex) {
  index2.parse(resolutionIndex);
  if (current.entries.some((e) => e.lastSeenIndex > resolutionIndex)) throw new Error("NPC_MEMORY_CLOCK_REWIND");
  const next2 = new Map(current.entries.filter((e) => resolutionIndex >= e.lastSeenIndex && resolutionIndex - e.lastSeenIndex < NPC_MEMORY_AGE_TICKS).map((e) => [e.id, { ...e }]));
  for (const text of external_exports.array(memoryText).max(NPC_MEMORY_CAPACITY).parse(texts)) next2.set(npcHash(text), { id: npcHash(text), text, lastSeenIndex: resolutionIndex });
  const entries = [...next2.values()].sort((a, b) => b.lastSeenIndex - a.lastSeenIndex || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, NPC_MEMORY_CAPACITY);
  return freezeMemory(entries);
}
function parseNpcNeeds(value) {
  const n = npcNeedsSchema.parse(value);
  return Object.freeze({ safety: n.safety, resources: n.resources, belonging: n.belonging, status: n.status, wealth: n.wealth, power: n.power });
}
function createNpcSnapshot(input) {
  const needs = parseNpcNeeds(input.needs);
  const decision = decideNpcGoal({ ...input, needs });
  return Object.freeze({ npcId: input.npcId, regionId: input.regionId, needs, memory: Object.freeze(input.memoryState.entries.map((e) => e.text)), memoryState: freezeMemory(memorySchema.parse(input.memoryState).entries), decision: Object.freeze({ ...decision, needs, observationIds: Object.freeze([...decision.observationIds]) }) });
}
function createNpcLifeSnapshot(input) {
  const needs = parseNpcNeeds(input.needs);
  const life = resolveNpcLife({ npcId: input.npcId, regionId: input.regionId, roleId: input.roleId, resolutionIndex: input.resolutionIndex, needs, memoryEntries: input.memoryState.entries, observationIds: input.observationIds, relationshipEvents: input.relationshipEvents, opportunities: input.opportunities, previous: input.previousLifeState, ...input.economy ? { economy: input.economy } : {} });
  const memoryState = freezeMemory(memorySchema.parse(input.memoryState).entries);
  return Object.freeze({ npcId: input.npcId, regionId: input.regionId, needs, memory: Object.freeze(memoryState.entries.map((e) => e.text)), memoryState, lifeState: life.state, decision: life.decision });
}
function encodeNpcReceipt(requestHash, snapshot) {
  const raw = stableCatalogStringify({ version: NPC_RECEIPT_VERSION, requestHash, snapshot, snapshotHash: npcHash(snapshot) });
  parseNpcJson(raw);
  return raw;
}
function encodeNpcLifeReceipt(requestHash, snapshot) {
  const raw = stableCatalogStringify({ version: NPC_LIFE_RECEIPT_VERSION, requestHash, snapshot, snapshotHash: npcHash(snapshot) });
  parseNpcJson(raw);
  return raw;
}
function npcReceiptVersion(raw) {
  const parsed = external_exports.object({ version: external_exports.enum([NPC_RECEIPT_VERSION, NPC_LIFE_RECEIPT_VERSION]) }).passthrough().parse(parseNpcJson(raw));
  return parsed.version;
}
var legacyDecisionSchema = external_exports.object({ npcId: id2, needs: npcNeedsSchema, goal: external_exports.string(), observationIds: observations, resolutionIndex: index2, decisionHash: external_exports.string() }).strict();
var legacyEnvelopeSchema = external_exports.object({ version: external_exports.literal(NPC_RECEIPT_VERSION), requestHash: hash64, snapshotHash: hash64, snapshot: external_exports.object({ npcId: id2, regionId: id2, needs: npcNeedsSchema, memory: external_exports.array(memoryText).max(NPC_MEMORY_CAPACITY), memoryState: memorySchema, decision: legacyDecisionSchema }).strict() }).strict();
var utilitySchema = external_exports.object({ seek_safety: external_exports.number().int().min(0).max(4e4), gather_resources: external_exports.number().int().min(0).max(4e4), socialize: external_exports.number().int().min(0).max(4e4), gain_reputation: external_exports.number().int().min(0).max(4e4), trade: external_exports.number().int().min(0).max(4e4), expand_influence: external_exports.number().int().min(0).max(4e4) }).strict();
var lifeDecisionSchema = external_exports.object({ npcId: id2, needs: npcNeedsSchema, goal: external_exports.enum(npcLifeGoals), longTermGoal: external_exports.enum(npcLifeGoals), observationIds: observations, resolutionIndex: index2, utilityBps: utilitySchema, plan: external_exports.unknown(), decisionHash: hash64 }).strict();
var lifeEnvelopeSchema = external_exports.object({ version: external_exports.literal(NPC_LIFE_RECEIPT_VERSION), requestHash: hash64, snapshotHash: hash64, snapshot: external_exports.object({ npcId: id2, regionId: id2, needs: npcNeedsSchema, memory: external_exports.array(memoryText).max(NPC_MEMORY_CAPACITY), memoryState: memorySchema, lifeState: external_exports.unknown(), decision: lifeDecisionSchema }).strict() }).strict();
function decodeNpcReceipt(raw, expected) {
  const value = parseNpcJson(raw);
  if (Array.isArray(value)) throw new Error("NPC_LEGACY_RECEIPT_REQUIRES_RECONCILIATION");
  const version = external_exports.object({ version: external_exports.string() }).passthrough().parse(value).version;
  if (version === NPC_RECEIPT_VERSION) {
    const envelope2 = legacyEnvelopeSchema.parse(value);
    if (envelope2.snapshotHash !== npcHash(envelope2.snapshot)) throw new Error("NPC_STORED_CONTENT_CORRUPT");
    if (expected.requestHash && envelope2.requestHash !== expected.requestHash) throw new Error("NPC_RESOLUTION_INPUT_CONFLICT");
    const stored2 = envelope2.snapshot;
    const snapshot2 = createNpcSnapshot({ npcId: stored2.npcId, regionId: stored2.regionId, needs: parseNpcNeeds(stored2.needs), memoryState: freezeMemory(stored2.memoryState.entries), observationIds: stored2.decision.observationIds, resolutionIndex: stored2.decision.resolutionIndex });
    if (snapshot2.npcId !== expected.npcId || snapshot2.regionId !== expected.regionId || snapshot2.decision.resolutionIndex !== expected.resolutionIndex || snapshot2.decision.decisionHash !== expected.decisionHash || snapshot2.decision.goal !== expected.goal || npcHash(snapshot2) !== envelope2.snapshotHash) throw new Error("NPC_STORED_CONTENT_CORRUPT");
    return snapshot2;
  }
  if (version !== NPC_LIFE_RECEIPT_VERSION) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  const envelope = lifeEnvelopeSchema.parse(value);
  if (envelope.snapshotHash !== npcHash(envelope.snapshot)) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  if (expected.requestHash && envelope.requestHash !== expected.requestHash) throw new Error("NPC_RESOLUTION_INPUT_CONFLICT");
  const stored = envelope.snapshot;
  const memoryState = freezeMemory(memorySchema.parse(stored.memoryState).entries);
  const lifeState = parseNpcLifeState(stored.lifeState);
  const decisionPlan = lifeState.plan;
  const parsedDecision = lifeDecisionSchema.parse(stored.decision);
  const utilityBps = Object.freeze({
    seek_safety: parsedDecision.utilityBps.seek_safety,
    gather_resources: parsedDecision.utilityBps.gather_resources,
    socialize: parsedDecision.utilityBps.socialize,
    gain_reputation: parsedDecision.utilityBps.gain_reputation,
    trade: parsedDecision.utilityBps.trade,
    expand_influence: parsedDecision.utilityBps.expand_influence
  });
  const decision = {
    ...parsedDecision,
    npcId: parsedDecision.npcId,
    resolutionIndex: parsedDecision.resolutionIndex,
    goal: parsedDecision.goal,
    longTermGoal: parsedDecision.longTermGoal,
    decisionHash: parsedDecision.decisionHash,
    needs: parseNpcNeeds(parsedDecision.needs),
    observationIds: parsedDecision.observationIds,
    utilityBps
  };
  const decisionHash = npcLifeDecisionHash({ npcId: decision.npcId, resolutionIndex: decision.resolutionIndex, goal: decision.goal, longTermGoal: decision.longTermGoal, needs: decision.needs, observationIds: decision.observationIds, utilityBps: decision.utilityBps, planHash: decisionPlan.planHash, stateHash: lifeState.stateHash });
  if (lifeState.npcId !== stored.npcId || lifeState.lastResolutionIndex !== decision.resolutionIndex || lifeState.currentGoal !== decision.goal || lifeState.longTermGoal !== decision.longTermGoal || npcHash(decision.plan) !== npcHash(decisionPlan) || decisionHash !== decision.decisionHash || stored.memory.length !== memoryState.entries.length || stored.memory.some((text, i) => text !== memoryState.entries[i].text)) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  const snapshot = Object.freeze({ npcId: stored.npcId, regionId: stored.regionId, needs: parseNpcNeeds(stored.needs), memory: Object.freeze([...stored.memory]), memoryState, lifeState, decision: Object.freeze({ ...decision, needs: Object.freeze({ ...decision.needs }), observationIds: Object.freeze([...decision.observationIds]), utilityBps: Object.freeze({ ...decision.utilityBps }), plan: decisionPlan }) });
  if (snapshot.npcId !== expected.npcId || snapshot.regionId !== expected.regionId || snapshot.decision.resolutionIndex !== expected.resolutionIndex || snapshot.decision.decisionHash !== expected.decisionHash || snapshot.decision.goal !== expected.goal || npcHash(snapshot) !== envelope.snapshotHash) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  return snapshot;
}

// server/src/aurion/npc/ax1LivingWorldProtocol.ts
import { createHash as createHash4 } from "node:crypto";
var AX1_LIVING_WORLD_RULESET = "aurion-ax1-living-world.v2";
var livingWorldSocialActions = ["negotiation", "diplomacy", "intimidation", "friendship", "trade", "leadership", "politics"];
var commodityBasePrice = Object.freeze({ grain: 20, sandstone: 45, bronze: 90, aether: 220, salve: 60, rune_core: 450 });
var productionFocus = Object.freeze({
  observatory_threshold: ["salve", "rune_core"],
  windhollow: ["grain"],
  emberfall: ["sandstone", "bronze"],
  cinder_vault: ["aether", "rune_core"]
});
var routeSecurity = Object.freeze({
  "observatory_threshold:windhollow": 85,
  "observatory_threshold:emberfall": 70,
  "observatory_threshold:cinder_vault": 35,
  "windhollow:emberfall": 60,
  "emberfall:cinder_vault": 48
});
function hash(...parts) {
  return createHash4("sha256").update(parts.join(""), "utf8").digest("hex");
}
function seed32(value) {
  const digest3 = createHash4("sha256").update(value, "utf8").digest();
  return digest3.readUInt32BE(0) >>> 0;
}
function next(seed) {
  let state = seed + 1831565813 >>> 0;
  let t = state;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return { value: ((t ^ t >>> 14) >>> 0) / 4294967296, seed: state };
}
function boundedInt(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} out of range`);
  return value;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function marketPriceCopper(input) {
  const stock = Math.max(1, boundedInt(input.stock, 0, 1e6, "stock"));
  const demand = boundedInt(input.demandBps, 0, 2e4, "demandBps") / 1e4;
  const tax = boundedInt(input.taxRateBasisPoints, 0, 5e3, "taxRateBasisPoints") / 1e4;
  const affinity = boundedInt(input.memoryAffinityBps ?? 1e4, 2500, 3e4, "memoryAffinityBps") / 1e4;
  const scarcity = clamp(120 / stock, 0.2, 4);
  const damped = Math.tanh(demand * affinity * scarcity - 1);
  const beforeTax = commodityBasePrice[input.commodity] * (1 + 0.85 * damped);
  return Math.max(1, Math.round(beforeTax * (1 + tax)));
}
function hasLivingWorldRoute(from, to) {
  return from !== to && (routeSecurity[`${from}:${to}`] !== void 0 || routeSecurity[`${to}:${from}`] !== void 0);
}
function caravanSecurityIndex(from, to, polityStability, rememberedThreat) {
  const direct = routeSecurity[`${from}:${to}`] ?? routeSecurity[`${to}:${from}`] ?? 50;
  return Math.round(clamp(direct + clamp(polityStability, -100, 100) * 0.15 - clamp(rememberedThreat, 0, 100) * 0.35, 5, 100));
}
function socialMasteryEvidence(action, sourceReceiptId, resolutionIndex) {
  if (!sourceReceiptId || !Number.isSafeInteger(resolutionIndex) || resolutionIndex < 0) throw new Error("social evidence requires server receipt and resolution index");
  const mapping = {
    negotiation: ["diplomacy", "3", 2],
    diplomacy: ["diplomacy", "5", 4],
    intimidation: ["sovereignty", "3", -2],
    friendship: ["stewardship", "4", 5],
    trade: ["stewardship", "3", 3],
    leadership: ["council", "5", 4],
    politics: ["sovereignty", "5", 3]
  };
  const [disciplineId, amountExact, reputationDelta] = mapping[action];
  return Object.freeze({ disciplineId, amountExact, sourceReceiptId, resolutionIndex, reputationDelta });
}
function actionForGoal(goal, wealthCopper, unitPriceCopper) {
  if (!goal) return wealthCopper < unitPriceCopper * 2 ? "produce" : "trade";
  switch (goal) {
    case "seek_safety":
      return "patrol";
    case "gather_resources":
      return "produce";
    case "socialize":
      return "socialize";
    case "gain_reputation":
      return "patrol";
    case "trade":
      return "trade";
    case "expand_influence":
      return "trade";
  }
}
function resolveLivingWorldTick(input) {
  if (!input.worldSeed.trim() || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0 || input.npc.currentHubId !== input.market.hubId) throw new Error("invalid living world context");
  let rng = seed32(`${input.worldSeed}:${input.resolutionIndex}:${input.npc.npcId}:${input.preferredGoal ?? "none"}:${AX1_LIVING_WORLD_RULESET}`);
  const roll = () => {
    const result = next(rng);
    rng = result.seed;
    return result.value;
  };
  const hunger = boundedInt(input.npc.hungerBps, 0, 1e4, "hungerBps");
  const fatigue = boundedInt(input.npc.fatigueBps, 0, 1e4, "fatigueBps");
  const focus = productionFocus[input.market.hubId];
  const commodity = focus[Math.floor(roll() * focus.length)];
  const memoryAffinityBps = input.npc.memory.some((entry2) => entry2.includes(`trade:${input.market.hubId}`)) ? 13e3 : 1e4;
  const demandBps = clamp(5e3 + hunger + Math.round(fatigue * 0.25), 0, 2e4);
  const unitPriceCopper = marketPriceCopper({ commodity, stock: input.market.stock[commodity], demandBps, taxRateBasisPoints: input.market.taxRateBasisPoints, memoryAffinityBps });
  const quantity = Math.max(1, Math.floor((2 + roll() * 4) * clamp(input.npc.harvestYieldBps / 1e4, 0.5, 2)));
  let action = hunger >= 7500 ? "consume" : fatigue >= 8500 ? "rest" : actionForGoal(input.preferredGoal, input.npc.wealthCopper, unitPriceCopper);
  const destinations = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"].filter((hub) => hub !== input.market.hubId);
  let destination = null;
  let securityIndex = 100;
  let ambushed = false;
  const caravanThreshold = input.preferredGoal === "expand_influence" ? 0.25 : 0.45;
  if (action === "trade" && roll() > caravanThreshold) {
    action = "caravan";
    destination = destinations[Math.floor(roll() * destinations.length)];
    const rememberedThreat = input.npc.memory.some((entry2) => entry2.startsWith("danger:")) ? 60 : 10;
    securityIndex = caravanSecurityIndex(input.market.hubId, destination, input.polityStability, rememberedThreat);
    ambushed = roll() < (100 - securityIndex) / 300;
  }
  const taxCopper = action === "trade" || action === "caravan" ? Math.floor(unitPriceCopper * quantity * input.market.taxRateBasisPoints / 1e4) : 0;
  const memoryEntry = action === "caravan" ? `trade:${destination}:${commodity}:${unitPriceCopper}:security=${securityIndex}${ambushed ? ":ambushed" : ""}` : action === "socialize" ? `social:${input.market.hubId}` : `${action}:${input.market.hubId}:${commodity}:${unitPriceCopper}`;
  const nextMemory = Object.freeze([...input.npc.memory, memoryEntry].slice(-24));
  const stabilityDelta = ambushed ? -2 : action === "patrol" ? 1 : action === "socialize" ? 1 : taxCopper > 0 ? 1 : 0;
  const stockDelta = action === "produce" ? quantity : action === "consume" || action === "trade" || action === "caravan" ? -Math.min(quantity, input.market.stock[commodity]) : 0;
  const market = Object.freeze({ ...input.market, treasuryCopper: input.market.treasuryCopper + taxCopper, stock: Object.freeze({ ...input.market.stock, [commodity]: Math.max(0, input.market.stock[commodity] + stockDelta) }) });
  const wealthDelta = action === "consume" ? -Math.min(input.npc.wealthCopper, unitPriceCopper) : action === "trade" || action === "caravan" ? unitPriceCopper * quantity - taxCopper : 0;
  const hungerDelta = action === "consume" ? -3e3 : action === "rest" ? 100 : action === "produce" ? 350 : action === "caravan" ? 450 : action === "patrol" ? 300 : action === "socialize" ? 150 : 220;
  const fatigueDelta = action === "rest" ? -3500 : action === "produce" ? 350 : action === "caravan" ? 550 : action === "patrol" ? 450 : action === "socialize" ? 100 : action === "consume" ? 80 : 180;
  const currentHubId = action === "caravan" && destination && !ambushed ? destination : input.npc.currentHubId;
  const npc = Object.freeze({ ...input.npc, currentHubId, wealthCopper: Math.max(0, input.npc.wealthCopper + wealthDelta), hungerBps: Math.round(clamp(hunger + hungerDelta, 0, 1e4)), fatigueBps: Math.round(clamp(fatigue + fatigueDelta, 0, 1e4)), memory: nextMemory });
  const deterministicHash = hash(AX1_LIVING_WORLD_RULESET, input.worldSeed, input.resolutionIndex, npc.npcId, input.preferredGoal ?? "none", action, commodity, quantity, unitPriceCopper, taxCopper, destination ?? "none", securityIndex, ambushed ? 1 : 0, npc.currentHubId, npc.wealthCopper, npc.hungerBps, npc.fatigueBps, ...nextMemory);
  return Object.freeze({ resolutionIndex: input.resolutionIndex, market, npc, preferredGoal: input.preferredGoal ?? null, action, commodity, quantity, unitPriceCopper, taxCopper, caravan: Object.freeze({ destination, securityIndex, ambushed }), nextMemory, stabilityDelta, deterministicHash });
}

// server/src/aurion/npc/merchantRules.ts
var merchantBootstrapMarkets = Object.freeze({
  observatory_threshold: Object.freeze({ hubId: "observatory_threshold", controllingGuild: "Order of Aurion", taxRateBasisPoints: 400, treasuryCopper: 5e5, stock: Object.freeze({ grain: 150, sandstone: 100, bronze: 80, aether: 40, salve: 60, rune_core: 25 }) }),
  windhollow: Object.freeze({ hubId: "windhollow", controllingGuild: "Aethelgard Pioneers", taxRateBasisPoints: 250, treasuryCopper: 28e4, stock: Object.freeze({ grain: 600, sandstone: 120, bronze: 30, aether: 15, salve: 40, rune_core: 5 }) }),
  emberfall: Object.freeze({ hubId: "emberfall", controllingGuild: "Bronze Syndicate", taxRateBasisPoints: 550, treasuryCopper: 42e4, stock: Object.freeze({ grain: 80, sandstone: 450, bronze: 350, aether: 20, salve: 25, rune_core: 10 }) }),
  cinder_vault: Object.freeze({ hubId: "cinder_vault", controllingGuild: "Starforged Sentinels", taxRateBasisPoints: 600, treasuryCopper: 61e4, stock: Object.freeze({ grain: 40, sandstone: 90, bronze: 60, aether: 180, salve: 30, rune_core: 80 }) })
});
function npcIdentity(regionId) {
  return `ax1_merchant_${regionId}`;
}
function npcName(regionId) {
  return regionId === "emberfall" ? "Torin" : regionId === "windhollow" ? "Elowen" : regionId === "cinder_vault" ? "Kael" : "Valen";
}
function isHubId(value) {
  return value === "observatory_threshold" || value === "windhollow" || value === "emberfall" || value === "cinder_vault";
}
function defaultNpc(regionId) {
  return Object.freeze({ npcId: npcIdentity(regionId), name: npcName(regionId), currentHubId: regionId, wealthCopper: 1500, hungerBps: 2e3, fatigueBps: 1500, tradeProwessBps: 10500, harvestYieldBps: 1e4, memory: Object.freeze([]) });
}
function confirmedNpcEconomy(homeRegionId, snapshot) {
  if (!snapshot || !("lifeState" in snapshot) || !snapshot.lifeState.economy) return defaultNpc(homeRegionId);
  const economy = snapshot.lifeState.economy;
  if (!isHubId(economy.currentHubId)) throw new Error("NPC_LIFE_HUB_INVALID");
  return Object.freeze({ npcId: snapshot.npcId, name: npcName(homeRegionId), currentHubId: economy.currentHubId, wealthCopper: economy.wealthCopper, hungerBps: economy.hungerBps, fatigueBps: economy.fatigueBps, tradeProwessBps: economy.tradeProwessBps, harvestYieldBps: economy.harvestYieldBps, memory: Object.freeze([...snapshot.memory]) });
}

// server/src/aurion/npc/multiMemory.ts
import { createHash as createHash5 } from "node:crypto";
var NPC_MULTI_MEMORY_VERSION = "wasd-npc-multi-memory.v4";
var NPC_MULTI_MEMORY_LIMITS = Object.freeze({ episodes: 24, facts: 64, competencies: 8, seenReceipts: 64, evidenceReceipts: 160, horizon: 3500, bytes: 262144, replayReceipts: 4096 });
var id3 = external_exports.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
var hash2 = external_exports.string().regex(/^[a-f0-9]{64}$/);
var revision = external_exports.string().regex(/^[a-f0-9]{40}$/);
var index3 = external_exports.number().int().min(0).max(2147483647);
var expiry = external_exports.number().int().min(0).max(2147487147);
var authoritySchema = external_exports.object({ rulesetVersion: external_exports.literal(WASD_NPC_MEMORY_RULESET), sourceRevision: revision, sourceSha256: hash2 }).strict();
var provenanceSchema = external_exports.object({ receiptId: id3, receiptSha256: hash2, decisionHash: hash2, logicalIndex: index3, authority: authoritySchema }).strict();
var episodeSchema = external_exports.object({ id: hash2, logicalIndex: index3, regionId: id3, participants: external_exports.array(id3).min(1).max(16), outcome: external_exports.literal("goal_selected"), goal: external_exports.enum(npcLifeGoals), source: provenanceSchema, expiresAtIndex: expiry }).strict();
var factSchema = external_exports.object({ id: hash2, subjectId: id3, predicate: external_exports.enum(["selected_goal", "current_hub"]), value: id3, version: external_exports.literal("wasd-npc-fact.v1"), validFromIndex: index3, validUntilIndex: expiry, provenance: external_exports.array(provenanceSchema).min(1).max(16), status: external_exports.enum(["active", "expired", "conflicted"]), conflictsWith: external_exports.array(hash2).max(NPC_MULTI_MEMORY_LIMITS.facts) }).strict();
var competencySchema = external_exports.object({ id: hash2, competencyId: external_exports.enum(["utility_goal_selection", "bounded_goal_planning"]), mode: external_exports.literal("configured"), rulesetVersion: external_exports.literal(WASD_NPC_MEMORY_RULESET), authority: authoritySchema, provenance: external_exports.array(provenanceSchema).min(1).max(16) }).strict();
var seenSchema = external_exports.object({ receiptId: id3, receiptSha256: hash2, logicalIndex: index3 }).strict();
var stateSchema2 = external_exports.object({
  version: external_exports.literal(NPC_MULTI_MEMORY_VERSION),
  npcId: id3,
  authority: authoritySchema,
  lastResolutionIndex: external_exports.number().int().min(-1).max(2147483647),
  lastReceiptId: id3.nullable(),
  working: external_exports.object({
    goal: external_exports.enum(npcLifeGoals).nullable(),
    plan: planSchema.nullable(),
    // Reservation authority is introduced by the typed action gateway, not inferred from a plan.
    reservations: external_exports.array(external_exports.object({ receiptId: id3, targetId: id3, expiresAtIndex: expiry }).strict()).max(0),
    confirmedEventIds: external_exports.array(id3).max(64)
  }).strict(),
  episodic: external_exports.array(episodeSchema).max(NPC_MULTI_MEMORY_LIMITS.episodes),
  semantic: external_exports.array(factSchema).max(NPC_MULTI_MEMORY_LIMITS.facts),
  procedural: external_exports.array(competencySchema).max(NPC_MULTI_MEMORY_LIMITS.competencies),
  seenReceipts: external_exports.array(seenSchema).max(NPC_MULTI_MEMORY_LIMITS.seenReceipts),
  memoryHash: hash2
}).strict();
var compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var digest = (value) => createHash5("sha256").update(stableCatalogStringify(value)).digest("hex");
var rawDigest = (value) => createHash5("sha256").update(value).digest("hex");
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function unsignedFact(fact) {
  const { id: _id, status: _status, conflictsWith: _conflicts, ...payload } = fact;
  return payload;
}
function classifyFacts(facts, logicalIndex) {
  return facts.map((fact) => {
    const conflictsWith = facts.filter((other) => other.id !== fact.id && other.subjectId === fact.subjectId && other.predicate === fact.predicate && other.value !== fact.value && Math.max(other.validFromIndex, fact.validFromIndex) < Math.min(other.validUntilIndex, fact.validUntilIndex)).map((other) => other.id).sort(compare);
    return { ...fact, conflictsWith, status: logicalIndex >= fact.validUntilIndex ? "expired" : conflictsWith.length ? "conflicted" : "active" };
  });
}
function seal(state) {
  const result = { ...state, memoryHash: digest(state) };
  if (Buffer.byteLength(stableCatalogStringify(result)) > NPC_MULTI_MEMORY_LIMITS.bytes) throw new Error("NPC_MULTI_MEMORY_BYTE_LIMIT");
  return freeze(result);
}
function parseNpcMemoryV4(value) {
  if (typeof value === "string") {
    if (Buffer.byteLength(value) > NPC_MULTI_MEMORY_LIMITS.bytes) throw new Error("NPC_MULTI_MEMORY_BYTE_LIMIT");
    value = JSON.parse(value);
  }
  const state = stateSchema2.parse(value);
  const { memoryHash, ...unsigned } = state;
  if (memoryHash !== digest(unsigned) || Buffer.byteLength(stableCatalogStringify(state)) > NPC_MULTI_MEMORY_LIMITS.bytes) throw new Error("NPC_MULTI_MEMORY_HASH_INVALID");
  if (state.lastResolutionIndex === -1 !== (state.lastReceiptId === null)) throw new Error("NPC_MULTI_MEMORY_CURSOR_INVALID");
  if (new Set(state.seenReceipts.map((r) => r.receiptId)).size !== state.seenReceipts.length || state.seenReceipts.some((r, i) => r.logicalIndex > state.lastResolutionIndex || i > 0 && state.seenReceipts[i - 1].logicalIndex <= r.logicalIndex)) throw new Error("NPC_MULTI_MEMORY_RECEIPT_ORDER");
  if (state.lastReceiptId && (state.seenReceipts[0]?.receiptId !== state.lastReceiptId || state.seenReceipts[0]?.logicalIndex !== state.lastResolutionIndex || state.working.confirmedEventIds.length !== 1 || state.working.confirmedEventIds[0] !== state.lastReceiptId)) throw new Error("NPC_MULTI_MEMORY_CURSOR_INVALID");
  if (!state.lastReceiptId && (state.seenReceipts.length || state.episodic.length || state.semantic.length || state.procedural.length || state.working.goal !== null || state.working.plan !== null || state.working.confirmedEventIds.length)) throw new Error("NPC_MULTI_MEMORY_GENESIS_INVALID");
  const receiptIdAt = (logicalIndex) => `npc_${npcHash([NPC_LIFE_RECEIPT_VERSION, state.npcId, logicalIndex]).slice(0, 56)}`;
  for (const seen of state.seenReceipts) {
    if (seen.receiptId !== receiptIdAt(seen.logicalIndex)) throw new Error("NPC_MULTI_MEMORY_RECEIPT_ID_INVALID");
  }
  const provenances = [...state.episodic.map((e) => e.source), ...state.semantic.flatMap((f) => f.provenance), ...state.procedural.flatMap((c) => c.provenance)];
  const byReceipt = /* @__PURE__ */ new Map();
  for (const source of provenances) {
    const seen = state.seenReceipts.find((r) => r.receiptId === source.receiptId);
    const previous = byReceipt.get(source.receiptId), canonical = stableCatalogStringify(source);
    if (source.receiptId !== receiptIdAt(source.logicalIndex) || source.logicalIndex > state.lastResolutionIndex || seen && (seen.logicalIndex !== source.logicalIndex || seen.receiptSha256 !== source.receiptSha256) || previous && previous !== canonical) throw new Error("NPC_MULTI_MEMORY_PROVENANCE_INVALID");
    byReceipt.set(source.receiptId, canonical);
  }
  if (stableCatalogStringify(state.episodic) !== stableCatalogStringify([...state.episodic].sort((a, b) => b.logicalIndex - a.logicalIndex || compare(a.id, b.id))) || stableCatalogStringify(state.semantic) !== stableCatalogStringify([...state.semantic].sort((a, b) => b.validFromIndex - a.validFromIndex || compare(a.id, b.id))) || stableCatalogStringify(state.procedural) !== stableCatalogStringify([...state.procedural].sort((a, b) => compare(a.id, b.id)))) throw new Error("NPC_MULTI_MEMORY_ENTRY_ORDER");
  for (const episode of state.episodic) {
    const { id: entryId, ...payload } = episode;
    if (entryId !== digest(payload) || episode.source.logicalIndex !== episode.logicalIndex || episode.logicalIndex > state.lastResolutionIndex || episode.participants.length !== 1 || episode.participants[0] !== state.npcId || episode.expiresAtIndex !== episode.logicalIndex + NPC_MULTI_MEMORY_LIMITS.horizon || state.lastResolutionIndex >= episode.expiresAtIndex) throw new Error("NPC_MULTI_MEMORY_EPISODE_INVALID");
  }
  for (const fact of state.semantic) {
    if (fact.id !== digest(unsignedFact(fact)) || fact.subjectId !== state.npcId || fact.provenance.length !== 1 || fact.provenance[0].logicalIndex !== fact.validFromIndex || fact.validUntilIndex !== fact.validFromIndex + NPC_MULTI_MEMORY_LIMITS.horizon || fact.validFromIndex > state.lastResolutionIndex || fact.predicate === "selected_goal" && !npcLifeGoals.includes(fact.value)) throw new Error("NPC_MULTI_MEMORY_FACT_INVALID");
  }
  if (stableCatalogStringify(state.semantic) !== stableCatalogStringify(classifyFacts(state.semantic, state.lastResolutionIndex))) throw new Error("NPC_MULTI_MEMORY_CONFLICT_INVALID");
  for (const competency of state.procedural) {
    if (competency.id !== digest([competency.rulesetVersion, competency.competencyId, competency.authority]) || competency.provenance.length !== 1 || competency.provenance[0].logicalIndex > state.lastResolutionIndex || stableCatalogStringify(competency.authority) !== stableCatalogStringify(competency.provenance[0].authority)) throw new Error("NPC_MULTI_MEMORY_COMPETENCY_INVALID");
  }
  for (const entries of [state.episodic, state.semantic, state.procedural]) {
    if (new Set(entries.map((e) => e.id)).size !== entries.length) throw new Error("NPC_MULTI_MEMORY_DUPLICATE_ENTRY");
  }
  if (state.lastReceiptId) {
    const latest = state.episodic[0];
    if (!latest || latest.source.receiptId !== state.lastReceiptId || latest.goal !== state.working.goal || stableCatalogStringify(latest.source.authority) !== stableCatalogStringify(state.authority) || !state.semantic.some((f) => f.predicate === "selected_goal" && f.value === latest.goal && f.provenance[0].receiptId === state.lastReceiptId) || state.procedural.length !== 2 || new Set(state.procedural.map((c) => c.competencyId)).size !== 2 || !state.working.plan) throw new Error("NPC_MULTI_MEMORY_CURRENT_EVIDENCE_INVALID");
  }
  if (state.working.plan) {
    const plan = state.working.plan;
    if (plan.goal !== state.working.goal || plan.planHash !== digest({ goal: plan.goal, opportunityId: plan.opportunityId, steps: plan.steps }) || (plan.status === "blocked" ? plan.opportunityId !== null || plan.steps.length !== 0 : plan.opportunityId === null || plan.steps.length === 0)) throw new Error("NPC_MULTI_MEMORY_PLAN_INVALID");
  }
  return freeze(state);
}
function createNpcMemoryV4(npcId) {
  id3.parse(npcId);
  return seal({
    version: NPC_MULTI_MEMORY_VERSION,
    npcId,
    authority: npcAuthority(),
    lastResolutionIndex: -1,
    lastReceiptId: null,
    working: { goal: null, plan: null, reservations: [], confirmedEventIds: [] },
    episodic: [],
    semantic: [],
    procedural: [],
    seenReceipts: []
  });
}
var verifiedDecisions = /* @__PURE__ */ new WeakSet();
function isConfirmedNpcDecision(value) {
  return !!value && typeof value === "object" && verifiedDecisions.has(value);
}
function verifyConfirmedNpcDecision(raw, expected) {
  const snapshot = decodeNpcReceipt(raw, expected);
  if (!("lifeState" in snapshot) || JSON.parse(raw).version !== NPC_LIFE_RECEIPT_VERSION) throw new Error("NPC_MULTI_MEMORY_V3_RECEIPT_REQUIRED");
  const expectedId = `npc_${npcHash([NPC_LIFE_RECEIPT_VERSION, snapshot.npcId, snapshot.decision.resolutionIndex]).slice(0, 56)}`;
  if (expected.receiptId !== expectedId) throw new Error("NPC_MULTI_MEMORY_RECEIPT_ID_INVALID");
  const receipt = freeze({ receiptId: expected.receiptId, receiptSha256: rawDigest(raw), snapshot, authority: npcAuthority() });
  verifiedDecisions.add(receipt);
  return receipt;
}
function commitNpcMemoryV4(currentValue, receipt) {
  if (!verifiedDecisions.has(receipt)) throw new Error("NPC_MULTI_MEMORY_CONFIRMED_RECEIPT_REQUIRED");
  const current = parseNpcMemoryV4(currentValue), snapshot = receipt.snapshot, tick = snapshot.decision.resolutionIndex;
  if (snapshot.npcId !== current.npcId) throw new Error("NPC_MULTI_MEMORY_FOREIGN_NPC");
  const seen = current.seenReceipts.find((r) => r.receiptId === receipt.receiptId);
  if (seen) {
    if (seen.receiptSha256 !== receipt.receiptSha256) throw new Error("NPC_MULTI_MEMORY_RECEIPT_CONFLICT");
    return Object.freeze({ status: "duplicate", memory: current });
  }
  if (tick <= current.lastResolutionIndex) return Object.freeze({ status: "stale", memory: current });
  const source = { receiptId: receipt.receiptId, receiptSha256: receipt.receiptSha256, decisionHash: snapshot.decision.decisionHash, logicalIndex: tick, authority: receipt.authority };
  const episode = { logicalIndex: tick, regionId: snapshot.regionId, participants: [snapshot.npcId], outcome: "goal_selected", goal: snapshot.decision.goal, source, expiresAtIndex: tick + NPC_MULTI_MEMORY_LIMITS.horizon };
  const episodic = [{ ...episode, id: digest(episode) }, ...current.episodic].filter((e) => tick < e.expiresAtIndex).sort((a, b) => b.logicalIndex - a.logicalIndex || compare(a.id, b.id)).slice(0, NPC_MULTI_MEMORY_LIMITS.episodes);
  const values = [["selected_goal", snapshot.decision.goal]];
  if (snapshot.lifeState.economy) values.push(["current_hub", snapshot.lifeState.economy.currentHubId]);
  const addedFacts = values.map(([predicate, value]) => {
    const payload = { subjectId: snapshot.npcId, predicate, value, version: "wasd-npc-fact.v1", validFromIndex: tick, validUntilIndex: tick + NPC_MULTI_MEMORY_LIMITS.horizon, provenance: [source] };
    return { ...payload, id: digest(payload), status: "active", conflictsWith: [] };
  });
  const facts = [...current.semantic, ...addedFacts].sort((a, b) => b.validFromIndex - a.validFromIndex || compare(a.id, b.id)).slice(0, NPC_MULTI_MEMORY_LIMITS.facts);
  const procedural = ["utility_goal_selection", "bounded_goal_planning"].map((competencyId) => {
    const existing = current.procedural.find((c) => c.competencyId === competencyId && c.authority.sourceSha256 === receipt.authority.sourceSha256);
    return existing ?? { id: digest([WASD_NPC_MEMORY_RULESET, competencyId, receipt.authority]), competencyId, mode: "configured", rulesetVersion: WASD_NPC_MEMORY_RULESET, authority: receipt.authority, provenance: [source] };
  }).sort((a, b) => compare(a.id, b.id));
  const memory = seal({
    version: NPC_MULTI_MEMORY_VERSION,
    npcId: current.npcId,
    authority: receipt.authority,
    lastResolutionIndex: tick,
    lastReceiptId: receipt.receiptId,
    working: { goal: snapshot.decision.goal, plan: snapshot.lifeState.plan, reservations: [], confirmedEventIds: [receipt.receiptId] },
    episodic,
    semantic: classifyFacts(facts, tick),
    procedural,
    seenReceipts: [{ receiptId: receipt.receiptId, receiptSha256: receipt.receiptSha256, logicalIndex: tick }, ...current.seenReceipts].slice(0, NPC_MULTI_MEMORY_LIMITS.seenReceipts)
  });
  return Object.freeze({ status: "committed", memory: parseNpcMemoryV4(memory) });
}
function replayNpcMemoryV4(npcId, receipts) {
  if (receipts.length > NPC_MULTI_MEMORY_LIMITS.replayReceipts) throw new Error("NPC_MULTI_MEMORY_REPLAY_LIMIT");
  let memory = createNpcMemoryV4(npcId);
  for (const receipt of [...receipts].sort((a, b) => a.snapshot.decision.resolutionIndex - b.snapshot.decision.resolutionIndex || compare(a.receiptId, b.receiptId))) memory = commitNpcMemoryV4(memory, receipt).memory;
  return memory;
}
function npcMemoryReceiptIds(value) {
  const memory = parseNpcMemoryV4(value);
  return Object.freeze([.../* @__PURE__ */ new Set([
    ...memory.seenReceipts.map((r) => r.receiptId),
    ...memory.episodic.map((e) => e.source.receiptId),
    ...memory.semantic.flatMap((f) => f.provenance.map((p) => p.receiptId)),
    ...memory.procedural.flatMap((c) => c.provenance.map((p) => p.receiptId))
  ])].sort(compare));
}
function verifyNpcMemoryEvidence(value, receipts) {
  const memory = parseNpcMemoryV4(value), ids = npcMemoryReceiptIds(memory);
  if (receipts.length > NPC_MULTI_MEMORY_LIMITS.evidenceReceipts) throw new Error("NPC_MULTI_MEMORY_EVIDENCE_LIMIT");
  const byId = /* @__PURE__ */ new Map();
  for (const receipt of receipts) {
    if (!verifiedDecisions.has(receipt) || receipt.snapshot.npcId !== memory.npcId || byId.has(receipt.receiptId)) throw new Error("NPC_MULTI_MEMORY_EVIDENCE_INVALID");
    byId.set(receipt.receiptId, receipt);
  }
  if (byId.size !== ids.length || ids.some((id5) => !byId.has(id5))) throw new Error("NPC_MULTI_MEMORY_EVIDENCE_REQUIRED");
  for (const source of [...memory.episodic.map((e) => e.source), ...memory.semantic.flatMap((f) => f.provenance), ...memory.procedural.flatMap((c) => c.provenance)]) {
    const receipt = byId.get(source.receiptId);
    if (receipt.receiptSha256 !== source.receiptSha256 || receipt.snapshot.decision.decisionHash !== source.decisionHash || receipt.snapshot.decision.resolutionIndex !== source.logicalIndex) throw new Error("NPC_MULTI_MEMORY_EVIDENCE_MISMATCH");
  }
  for (const seen of memory.seenReceipts) {
    const receipt = byId.get(seen.receiptId);
    if (receipt.receiptSha256 !== seen.receiptSha256 || receipt.snapshot.decision.resolutionIndex !== seen.logicalIndex) throw new Error("NPC_MULTI_MEMORY_EVIDENCE_MISMATCH");
  }
  for (const episode of memory.episodic) {
    const snapshot = byId.get(episode.source.receiptId).snapshot;
    if (episode.goal !== snapshot.decision.goal || episode.regionId !== snapshot.regionId) throw new Error("NPC_MULTI_MEMORY_EVIDENCE_MISMATCH");
  }
  for (const fact of memory.semantic) {
    const snapshot = byId.get(fact.provenance[0].receiptId).snapshot;
    if (fact.value !== (fact.predicate === "selected_goal" ? snapshot.decision.goal : snapshot.lifeState.economy?.currentHubId)) throw new Error("NPC_MULTI_MEMORY_EVIDENCE_MISMATCH");
  }
  if (memory.lastReceiptId) {
    const latest = byId.get(memory.lastReceiptId).snapshot;
    if (memory.working.goal !== latest.decision.goal || stableCatalogStringify(memory.working.plan) !== stableCatalogStringify(latest.lifeState.plan)) throw new Error("NPC_MULTI_MEMORY_EVIDENCE_MISMATCH");
  }
  return memory;
}
function projectNpcMemoryV4(value) {
  const memory = parseNpcMemoryV4(value);
  return freeze({
    version: "wasd-npc-memory-public.v4",
    npcId: memory.npcId,
    resolutionIndex: memory.lastResolutionIndex,
    goal: memory.working.goal,
    planStatus: memory.working.plan?.status ?? null,
    memoryHash: memory.memoryHash,
    sourceRevision: memory.authority.sourceRevision,
    counts: { working: memory.working.confirmedEventIds.length, episodic: memory.episodic.length, semantic: memory.semantic.length, procedural: memory.procedural.length },
    conflictedFacts: memory.semantic.filter((f) => f.conflictsWith.length).length,
    expiredFacts: memory.semantic.filter((f) => f.status === "expired").length
  });
}

// server/src/aurion/npc/worldPolityRules.ts
import { createHash as createHash6 } from "node:crypto";
var AURION_WASD_RULESET_VERSION = "aurion-wasd-rules-v1";
var AURION_WASD_CONTENT_VERSION = "aurion-wasd-content-v1";
var worldSignalKinds = ["weather", "ecology", "hazard", "resonance", "economy", "politics", "war", "player_event"];
var polityGovernmentTypes = ["monarchy", "council", "theocracy", "trade_republic", "warband"];
var diplomacyTypes = ["alliance", "trade", "non_aggression", "tribute", "sanction"];
function clampUnit2(value) {
  return Math.max(0, Math.min(1, Math.round(value * 1e4) / 1e4));
}
function clampSigned2(value) {
  return Math.max(-1, Math.min(1, Math.round(value * 1e4) / 1e4));
}
function compareText3(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function canonicalHash2(parts) {
  return createHash6("sha256").update(parts.join(""), "utf8").digest("hex");
}
function canonicalSignalOrder(left, right) {
  return left.resolutionIndex - right.resolutionIndex || compareText3(left.regionId, right.regionId) || compareText3(left.kind, right.kind) || compareText3(left.id, right.id);
}
function buildWorldSeedDigest(input) {
  if (!input.worldSeed || !input.regionId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) {
    throw new Error("World seed inputs must be explicit and non-negative");
  }
  return canonicalHash2([AURION_WASD_RULESET_VERSION, AURION_WASD_CONTENT_VERSION, input.worldSeed, input.regionId, String(input.resolutionIndex)]);
}
function resolveWorldReaction(input) {
  const ordered = input.signals.filter((signal) => signal.regionId === input.regionId && signal.resolutionIndex <= input.resolutionIndex).slice().sort(canonicalSignalOrder);
  const totals = {
    weather: 0,
    ecology: 0,
    hazard: 0,
    resonance: 0,
    economy: 0,
    politics: 0,
    war: 0,
    player_event: 0
  };
  ordered.forEach((signal) => {
    totals[signal.kind] += clampSigned2(signal.magnitude);
  });
  const weatherTone = totals.war > 0.6 || totals.hazard > 0.8 ? "ashfall" : totals.weather > 0.55 ? "storm" : totals.weather > 0.15 ? "rain" : "clear";
  const threatDelta = clampSigned2(totals.hazard * 0.65 + totals.war * 0.55 - totals.resonance * 0.15);
  const resourceDelta = clampSigned2(totals.ecology * 0.55 + totals.economy * 0.3 - totals.hazard * 0.25 - totals.war * 0.2);
  const npcNeedDeltas = {
    safety: clampSigned2(-threatDelta * 0.4),
    resources: clampSigned2(resourceDelta * 0.3),
    belonging: clampSigned2(-(totals.war * 0.16) + totals.player_event * 0.08),
    status: clampSigned2(totals.politics * 0.15 + totals.resonance * 0.08),
    wealth: clampSigned2(resourceDelta * 0.25 + totals.economy * 0.2),
    power: clampSigned2(totals.politics * 0.2 + totals.war * 0.1)
  };
  const dialogueTone = threatDelta > 0.55 ? "urgent" : threatDelta > 0.2 || totals.politics > 0.3 ? "guarded" : "calm";
  const seedDigest = buildWorldSeedDigest(input);
  const signalIds = ordered.map((signal) => signal.id);
  const deterministicHash = canonicalHash2([
    seedDigest,
    ...signalIds,
    weatherTone,
    String(threatDelta),
    String(resourceDelta),
    dialogueTone
  ]);
  return {
    id: `wr_${deterministicHash.slice(0, 24)}`,
    regionId: input.regionId,
    ruleSetVersion: AURION_WASD_RULESET_VERSION,
    contentVersion: AURION_WASD_CONTENT_VERSION,
    resolutionIndex: input.resolutionIndex,
    signalIds,
    weatherTone,
    threatDelta,
    resourceDelta,
    npcNeedDeltas,
    dialogueTone,
    deterministicHash
  };
}
function resolvePolityState(input) {
  const territoryIds = input.territoryIds.slice().sort(compareText3);
  const activeDiplomacy = input.activeDiplomacy.slice().sort(compareText3);
  const warPressure = clampUnit2(input.warSignals.filter((signal) => signal.kind === "war" || signal.kind === "politics").reduce((total, signal) => total + Math.max(0, signal.magnitude), 0) / 4);
  const stability = clampUnit2(input.stability - warPressure * 0.2 + (activeDiplomacy.includes("alliance") ? 0.05 : 0) - (activeDiplomacy.includes("sanction") ? 0.05 : 0));
  const reactionHash = canonicalHash2([input.polityId, input.governmentType, ...territoryIds, ...activeDiplomacy, String(stability), String(warPressure)]);
  return { polityId: input.polityId, governmentType: input.governmentType, territoryIds, stability, activeDiplomacy, warPressure, reactionHash };
}

// server/src/aurion/npc/actionGateway.ts
import { createHash as createHash7 } from "node:crypto";
var NPC_ACTION_GATEWAY_VERSION = "wasd-npc-action-gateway.v1";
var NPC_ACTION_LEASE_VERSION = "wasd-npc-action-lease.v1";
var NPC_ACTION_RECEIPT_VERSION = "wasd-npc-action-receipt.v1";
var NPC_ACTION_GATEWAY_MAX_TARGETS = 16;
var NPC_ACTION_GATEWAY_MAX_CANDIDATES = 8;
var hubValues = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"];
var commodityValues = ["grain", "sandstone", "bronze", "aether", "salve", "rune_core"];
var actionValues = ["consume", "produce", "trade", "caravan", "patrol", "rest", "socialize"];
var id4 = external_exports.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
var hash642 = external_exports.string().regex(/^[a-f0-9]{64}$/);
var index4 = external_exports.number().int().min(0).max(2147483647);
var priorIndex = external_exports.number().int().min(-1).max(2147483647);
var hubSchema = external_exports.enum(hubValues);
var commoditySchema = external_exports.enum(commodityValues);
var authoritySchema2 = external_exports.object({ rulesetVersion: external_exports.string().min(1).max(96), sourceRevision: external_exports.string().regex(/^[a-f0-9]{40}$/), sourceSha256: hash642 }).strict();
var sourceDecisionSchema = external_exports.object({ receiptId: id4, receiptSha256: hash642, npcId: id4, resolutionIndex: index4, decisionHash: hash642, planHash: hash642, goal: external_exports.enum(["seek_safety", "gather_resources", "socialize", "gain_reputation", "trade", "expand_influence"]) }).strict();
var epochSchema = external_exports.object({ npcResolutionIndex: priorIndex, marketVersion: index4, polityVersion: index4 }).strict();
var marketEvidenceSchema = external_exports.object({ version: index4, stateHash: hash642 }).strict();
var targetEvidenceSchema = external_exports.object({ id: id4, kind: external_exports.literal("market"), market: external_exports.unknown(), version: index4, active: external_exports.boolean() }).strict();
var targetSchema = external_exports.object({ id: id4, kind: external_exports.literal("market"), hubId: hubSchema, version: index4, stateHash: hash642, active: external_exports.boolean() }).strict();
var inventoryEntrySchema = external_exports.object({ itemId: commoditySchema, quantity: index4, capacity: index4 }).strict();
var inventorySchema = external_exports.object({ ownerId: id4, stateHash: hash642, entries: external_exports.array(inventoryEntrySchema).length(commodityValues.length) }).strict();
var politySchema = external_exports.object({ polityId: id4, version: index4, stability: index4.max(100), stateHash: hash642 }).strict();
function canonicalHash3(value) {
  return createHash7("sha256").update(stableCatalogStringify(value), "utf8").digest("hex");
}
function textOrder(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function same(left, right) {
  return stableCatalogStringify(left) === stableCatalogStringify(right);
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function authority(value) {
  const parsed = authoritySchema2.parse(value);
  return Object.freeze({ rulesetVersion: parsed.rulesetVersion, sourceRevision: parsed.sourceRevision, sourceSha256: parsed.sourceSha256 });
}
function freezeSourceDecision(value) {
  const p = sourceDecisionSchema.parse(value);
  return Object.freeze({ receiptId: p.receiptId, receiptSha256: p.receiptSha256, npcId: p.npcId, resolutionIndex: p.resolutionIndex, decisionHash: p.decisionHash, planHash: p.planHash, goal: p.goal });
}
function freezeEpoch(value) {
  const p = epochSchema.parse(value);
  return Object.freeze({ npcResolutionIndex: p.npcResolutionIndex, marketVersion: p.marketVersion, polityVersion: p.polityVersion });
}
function freezeMarketEvidence(value) {
  const p = marketEvidenceSchema.parse(value);
  return Object.freeze({ version: p.version, stateHash: p.stateHash });
}
function freezeMarket(value) {
  if (!value || !hubSchema.safeParse(value.hubId).success || typeof value.controllingGuild !== "string" || !value.controllingGuild.trim() || value.controllingGuild.length > 256 || !Number.isSafeInteger(value.taxRateBasisPoints) || value.taxRateBasisPoints < 0 || value.taxRateBasisPoints > 1e4 || !Number.isSafeInteger(value.treasuryCopper) || value.treasuryCopper < 0 || value.treasuryCopper > 1e9 || !value.stock) throw new Error("NPC_ACTION_MARKET_INVALID");
  const stock = {};
  for (const commodity of commodityValues) {
    const amount = value.stock[commodity];
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1e6) throw new Error("NPC_ACTION_MARKET_INVALID");
    stock[commodity] = amount;
  }
  return deepFreeze({ hubId: value.hubId, controllingGuild: value.controllingGuild, taxRateBasisPoints: value.taxRateBasisPoints, treasuryCopper: value.treasuryCopper, stock });
}
function freezeNpc(value) {
  if (!value || !id4.safeParse(value.npcId).success || typeof value.name !== "string" || !value.name.trim() || value.name.length > 128 || !hubSchema.safeParse(value.currentHubId).success || !Number.isSafeInteger(value.wealthCopper) || value.wealthCopper < 0 || value.wealthCopper > 1e9 || !Number.isSafeInteger(value.hungerBps) || value.hungerBps < 0 || value.hungerBps > 1e4 || !Number.isSafeInteger(value.fatigueBps) || value.fatigueBps < 0 || value.fatigueBps > 1e4 || !Number.isSafeInteger(value.tradeProwessBps) || value.tradeProwessBps < 0 || value.tradeProwessBps > 2e4 || !Number.isSafeInteger(value.harvestYieldBps) || value.harvestYieldBps < 0 || value.harvestYieldBps > 2e4 || !Array.isArray(value.memory) || value.memory.length > 24 || value.memory.some((entry2) => typeof entry2 !== "string" || entry2.length > 256)) throw new Error("NPC_ACTION_NPC_INVALID");
  return deepFreeze({ npcId: value.npcId, name: value.name, currentHubId: value.currentHubId, wealthCopper: value.wealthCopper, hungerBps: value.hungerBps, fatigueBps: value.fatigueBps, tradeProwessBps: value.tradeProwessBps, harvestYieldBps: value.harvestYieldBps, memory: [...value.memory] });
}
function freezeTargetEvidence(value) {
  const parsed = targetEvidenceSchema.parse(value);
  const market = freezeMarket(parsed.market);
  return Object.freeze({ id: parsed.id, kind: parsed.kind, hubId: market.hubId, version: parsed.version, stateHash: merchantMarketStateHash(market), active: parsed.active });
}
function freezeInventory(value) {
  const p = inventorySchema.parse(value);
  const entries = p.entries.map((entry2) => Object.freeze({ itemId: entry2.itemId, quantity: entry2.quantity, capacity: entry2.capacity })).sort((a, b) => textOrder(a.itemId, b.itemId));
  if (new Set(entries.map((entry2) => entry2.itemId)).size !== commodityValues.length || entries.some((entry2) => entry2.quantity > entry2.capacity)) throw new Error("NPC_ACTION_INVENTORY_INVALID");
  return Object.freeze({ ownerId: p.ownerId, stateHash: p.stateHash, entries: Object.freeze(entries) });
}
function freezePolity(value) {
  const p = politySchema.parse(value);
  return Object.freeze({ polityId: p.polityId, version: p.version, stability: p.stability, stateHash: p.stateHash });
}
function merchantMarketStateHash(market) {
  return canonicalHash3({ hubId: market.hubId, controllingGuild: market.controllingGuild, taxRateBasisPoints: market.taxRateBasisPoints, treasuryCopper: market.treasuryCopper, stock: market.stock });
}
function merchantInventoryStateHash(input) {
  return canonicalHash3({ ownerId: input.ownerId, marketStateHash: merchantMarketStateHash(input.market), entries: [...input.entries].map((entry2) => ({ itemId: entry2.itemId, quantity: entry2.quantity, capacity: entry2.capacity })).sort((a, b) => textOrder(a.itemId, b.itemId)) });
}
function merchantPolityStateHash(input) {
  return canonicalHash3({ polityId: input.polityId, version: input.version, stability: input.stability });
}
function merchantActionEffectsHash(requests) {
  return canonicalHash3(requests);
}
function merchantActionReceiptHash(receipt) {
  return canonicalHash3(receipt);
}
function merchantActionReceiptId(receipt) {
  return `nar_${canonicalHash3(receipt).slice(0, 56)}`;
}
function npcStateHash(npc) {
  return canonicalHash3({ npcId: npc.npcId, currentHubId: npc.currentHubId, wealthCopper: npc.wealthCopper, hungerBps: npc.hungerBps, fatigueBps: npc.fatigueBps, tradeProwessBps: npc.tradeProwessBps, harvestYieldBps: npc.harvestYieldBps, memory: [...npc.memory] });
}
function worldSeedHash(worldSeed) {
  return createHash7("sha256").update(worldSeed, "utf8").digest("hex");
}
function sourceDecisionFrom(confirmed) {
  if (!isConfirmedNpcDecision(confirmed) || !same(confirmed.authority, npcAuthority()) || !("lifeState" in confirmed.snapshot)) throw new Error("NPC_ACTION_CONFIRMED_SOURCE_REQUIRED");
  const snapshot = confirmed.snapshot, plan = snapshot.lifeState.plan;
  if (plan.goal !== snapshot.decision.goal) throw new Error("NPC_ACTION_CONFIRMED_SOURCE_REQUIRED");
  return Object.freeze({ sourceDecision: freezeSourceDecision({ receiptId: confirmed.receiptId, receiptSha256: confirmed.receiptSha256, npcId: snapshot.npcId, resolutionIndex: snapshot.decision.resolutionIndex, decisionHash: snapshot.decision.decisionHash, planHash: plan.planHash, goal: snapshot.decision.goal }), planIsPlanned: plan.status === "planned" });
}
function normalizeContext(input) {
  if (!input || typeof input.worldSeed !== "string" || !input.worldSeed.trim() || input.worldSeed.length > 256 || !Number.isSafeInteger(input.logicalIndex) || input.logicalIndex < 0 || !hubSchema.safeParse(input.homeHubId).success) throw new Error("NPC_ACTION_CONTEXT_INVALID");
  const epoch = freezeEpoch(input.epoch);
  const source = sourceDecisionFrom(input.confirmedDecision);
  const npc = freezeNpc(input.npc), market = freezeMarket(input.market), marketEvidence = freezeMarketEvidence(input.marketEvidence), polity = freezePolity(input.polity), inventory = freezeInventory(input.inventory);
  if (source.sourceDecision.npcId !== npcIdentity(input.homeHubId) || npc.npcId !== source.sourceDecision.npcId || source.sourceDecision.resolutionIndex !== epoch.npcResolutionIndex || epoch.npcResolutionIndex >= 2147483647 || input.logicalIndex !== epoch.npcResolutionIndex + 1 || npc.currentHubId !== market.hubId) throw new Error("NPC_ACTION_CONTEXT_INVALID");
  if (input.confirmedDecision.snapshot.npcId !== npc.npcId || input.confirmedDecision.snapshot.decision.resolutionIndex !== epoch.npcResolutionIndex) throw new Error("NPC_ACTION_CONFIRMED_SOURCE_REQUIRED");
  const marketValid = marketEvidence.version === epoch.marketVersion && marketEvidence.stateHash === merchantMarketStateHash(market);
  const inventoryStateValid = inventory.ownerId === `market:${market.hubId}` && inventory.stateHash === merchantInventoryStateHash({ ownerId: inventory.ownerId, market, entries: inventory.entries }) && inventory.entries.every((entry2) => entry2.quantity === market.stock[entry2.itemId]);
  const targets = input.targets.map(freezeTargetEvidence).slice().sort((a, b) => textOrder(a.id, b.id) || textOrder(a.stateHash, b.stateHash));
  const targetIds = new Set(targets.map((target) => target.id));
  const targetsValid = targets.length <= NPC_ACTION_GATEWAY_MAX_TARGETS && targetIds.size === targets.length && targets.every((target) => target.id === `market:${target.hubId}` && target.version === epoch.marketVersion) && targets.filter((target) => target.hubId === market.hubId).every((target) => target.stateHash === marketEvidence.stateHash);
  const polityValid = polity.polityId === `polity:${market.hubId}` && polity.version === epoch.polityVersion && polity.stateHash === merchantPolityStateHash(polity);
  return Object.freeze({ worldSeed: input.worldSeed, homeHubId: input.homeHubId, logicalIndex: input.logicalIndex, confirmedDecision: input.confirmedDecision, sourceDecision: source.sourceDecision, sourcePlanIsPlanned: source.planIsPlanned, epoch, npc, market, marketEvidence, marketValid, polity, polityValid, inventory, inventoryStateValid, targets: Object.freeze(targets), targetsValid });
}
function resolutionFor(context) {
  return resolveLivingWorldTick({ worldSeed: context.worldSeed, resolutionIndex: context.logicalIndex, market: context.market, npc: context.npc, polityStability: context.polity.stability, preferredGoal: context.sourceDecision.goal });
}
function targetIdFor(resolution) {
  return `market:${resolution.action === "caravan" && resolution.caravan.destination ? resolution.caravan.destination : resolution.market.hubId}`;
}
function expectedTarget(context, resolution) {
  if (!context.targetsValid) return null;
  const expectedHubId = resolution.action === "caravan" ? resolution.caravan.destination : resolution.market.hubId;
  const target = context.targets.find((value) => value.id === targetIdFor(resolution)) ?? null;
  if (!expectedHubId || !target || !target.active || target.hubId !== expectedHubId) return null;
  return target;
}
function inventoryAvailable(context, resolution) {
  const entry2 = context.inventory.entries.find((item) => item.itemId === resolution.commodity);
  if (!entry2) return false;
  if (resolution.action === "produce") return entry2.quantity + resolution.quantity <= entry2.capacity;
  if (resolution.action === "consume") return entry2.quantity >= resolution.quantity && context.npc.wealthCopper >= resolution.unitPriceCopper;
  if (resolution.action === "trade" || resolution.action === "caravan") return entry2.quantity >= resolution.quantity;
  return true;
}
function blocked(context, resolution, code) {
  return Object.freeze({ status: "blocked", code, npcId: context.npc.npcId, resolutionIndex: resolution.resolutionIndex, action: resolution.action, replanHash: canonicalHash3({ version: NPC_ACTION_GATEWAY_VERSION, code, npcId: context.npc.npcId, sourceDecision: context.sourceDecision, resolutionIndex: resolution.resolutionIndex, action: resolution.action, epoch: context.epoch, marketHash: context.marketEvidence.stateHash, polityHash: context.polity.stateHash, inventoryHash: context.inventory.stateHash }) });
}
function intended(context, resolution, target) {
  const boundAuthority = npcAuthority();
  const unsigned = { version: NPC_ACTION_GATEWAY_VERSION, authority: boundAuthority, npcId: context.npc.npcId, sourceDecision: context.sourceDecision, resolutionIndex: resolution.resolutionIndex, worldSeedSha256: worldSeedHash(context.worldSeed), expectedEpoch: context.epoch, expectedNpcHash: npcStateHash(context.npc), expectedMarketHash: context.marketEvidence.stateHash, expectedPolityHash: context.polity.stateHash, expectedInventoryHash: context.inventory.stateHash, action: resolution.action, originHubId: context.market.hubId, target, commodity: resolution.commodity, quantity: resolution.quantity, unitPriceCopper: resolution.unitPriceCopper, resolutionHash: resolution.deterministicHash };
  const intentHash = canonicalHash3(unsigned);
  return Object.freeze({ ...unsigned, id: `npa_${intentHash.slice(0, 56)}`, intentHash });
}
function parseIntent(value) {
  try {
    if (value.version !== NPC_ACTION_GATEWAY_VERSION || !id4.safeParse(value.id).success || !hash642.safeParse(value.intentHash).success || !id4.safeParse(value.npcId).success || !index4.safeParse(value.resolutionIndex).success || !hash642.safeParse(value.worldSeedSha256).success || !hash642.safeParse(value.expectedNpcHash).success || !hash642.safeParse(value.expectedMarketHash).success || !hash642.safeParse(value.expectedPolityHash).success || !hash642.safeParse(value.expectedInventoryHash).success || !actionValues.includes(value.action) || !hubSchema.safeParse(value.originHubId).success || !commoditySchema.safeParse(value.commodity).success || !Number.isSafeInteger(value.quantity) || value.quantity < 1 || !Number.isSafeInteger(value.unitPriceCopper) || value.unitPriceCopper < 1 || !hash642.safeParse(value.resolutionHash).success) return null;
    const target = targetSchema.parse(value.target);
    if (target.id !== `market:${target.hubId}`) return null;
    return Object.freeze({ ...value, authority: authority(value.authority), sourceDecision: freezeSourceDecision(value.sourceDecision), expectedEpoch: freezeEpoch(value.expectedEpoch), target: Object.freeze({ id: target.id, kind: target.kind, hubId: target.hubId, version: target.version, stateHash: target.stateHash, active: target.active }) });
  } catch {
    return null;
  }
}
function parseLease(value) {
  try {
    if (value.version !== NPC_ACTION_LEASE_VERSION || !id4.safeParse(value.id).success || !id4.safeParse(value.npcId).success || !id4.safeParse(value.intentId).success || !id4.safeParse(value.targetId).success || !/^[a-f0-9]{40}$/.test(value.sourceRevision) || !hash642.safeParse(value.lockedStateHash).success || !index4.safeParse(value.issuedAtLogicalIndex).success || !index4.safeParse(value.expiresAtLogicalIndex).success || value.expiresAtLogicalIndex < value.issuedAtLogicalIndex || !["active", "revoked", "consumed"].includes(value.state)) return null;
    return Object.freeze({ ...value });
  } catch {
    return null;
  }
}
function proposedLeaseFor(context, intent, target) {
  return Object.freeze({ version: NPC_ACTION_LEASE_VERSION, id: `npl_${canonicalHash3({ version: NPC_ACTION_LEASE_VERSION, intentId: intent.id, index: context.logicalIndex }).slice(0, 56)}`, npcId: intent.npcId, intentId: intent.id, targetId: target.id, sourceRevision: intent.authority.sourceRevision, lockedStateHash: target.stateHash, issuedAtLogicalIndex: context.logicalIndex, expiresAtLogicalIndex: context.logicalIndex, state: "active" });
}
function planMerchantAction(input) {
  const context = normalizeContext(input);
  const resolution = resolutionFor(context);
  if (!context.sourcePlanIsPlanned) return blocked(context, resolution, "SOURCE_PLAN_BLOCKED");
  if (!context.marketValid) return blocked(context, resolution, "MARKET_STATE_MISMATCH");
  if (!context.polityValid) return blocked(context, resolution, "POLITY_STATE_MISMATCH");
  if (!context.inventoryStateValid) return blocked(context, resolution, "INVENTORY_STATE_MISMATCH");
  if (!context.targetsValid) return blocked(context, resolution, "TARGET_STATE_MISMATCH");
  const target = expectedTarget(context, resolution);
  if (!target) return blocked(context, resolution, "TARGET_MISSING");
  if (resolution.action === "caravan" ? !resolution.caravan.destination || !hasLivingWorldRoute(context.market.hubId, target.hubId) : target.hubId !== context.npc.currentHubId) return blocked(context, resolution, "TARGET_RANGE");
  if (!inventoryAvailable(context, resolution)) return blocked(context, resolution, "INVENTORY_UNAVAILABLE");
  const intent = intended(context, resolution, target);
  return Object.freeze({ status: "ready", intent, proposedLease: proposedLeaseFor(context, intent, target), resolution });
}
function invalid(context, resolution, intent, code) {
  return Object.freeze({ ...blocked(context, resolution, code), npcId: intent.npcId, resolutionIndex: intent.resolutionIndex, action: intent.action });
}
function lifeOpportunities(resolution, receiptId) {
  const riskBps = resolution.caravan.ambushed ? 9e3 : Math.max(0, (100 - resolution.caravan.securityIndex) * 100);
  const stock = resolution.market.stock[resolution.commodity];
  const values = [
    { id: `${receiptId}:safe`, kind: "safe_hub", regionId: resolution.market.hubId, targetId: `hub:${resolution.market.hubId}`, benefitBps: Math.max(2e3, 9e3 - riskBps), riskBps, distanceBps: 0, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:resource`, kind: "resource", regionId: resolution.market.hubId, targetId: `commodity:${resolution.commodity}`, benefitBps: Math.max(2e3, Math.min(1e4, 1e4 - Math.min(8e3, stock * 10))), riskBps: Math.floor(riskBps / 3), distanceBps: 500, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:social`, kind: "social", regionId: resolution.market.hubId, benefitBps: 6e3, riskBps: Math.floor(riskBps / 4), distanceBps: 250, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:reputation`, kind: "reputation", regionId: resolution.market.hubId, targetId: `polity:${resolution.market.hubId}`, benefitBps: 5500 + Math.max(0, resolution.stabilityDelta) * 500, riskBps: Math.floor(riskBps / 2), distanceBps: 500, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:market`, kind: "market", regionId: resolution.market.hubId, targetId: `market:${resolution.market.hubId}`, benefitBps: Math.min(1e4, 2500 + resolution.unitPriceCopper * 12), riskBps: Math.floor(riskBps / 3), distanceBps: 300, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:influence`, kind: "influence", regionId: resolution.caravan.destination ?? resolution.market.hubId, targetId: `polity:${resolution.caravan.destination ?? resolution.market.hubId}`, benefitBps: resolution.caravan.destination ? 8e3 : 4500, riskBps, distanceBps: resolution.caravan.destination ? 2500 : 800, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex }
  ];
  return deepFreeze(values);
}
function requestsFromValidatedAction(context, resolution, receiptId) {
  const needEvents = [
    { id: `${receiptId}:wealth`, need: "wealth", delta: resolution.action === "trade" || resolution.action === "caravan" ? 0.08 : resolution.action === "consume" ? -0.04 : 0, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:safety`, need: "safety", delta: resolution.caravan.ambushed ? -0.18 : resolution.action === "patrol" ? 0.05 : 0, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:resources`, need: "resources", delta: resolution.action === "produce" ? 0.07 : resolution.action === "consume" ? -0.04 : 0, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:belonging`, need: "belonging", delta: resolution.action === "socialize" ? 0.08 : 0, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:status`, need: "status", delta: resolution.action === "patrol" ? 0.03 : resolution.action === "caravan" && !resolution.caravan.ambushed ? 0.02 : 0, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:power`, need: "power", delta: resolution.action === "caravan" && !resolution.caravan.ambushed ? 0.02 : 0, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex }
  ];
  const economySignal = { id: `${receiptId}:economy`, kind: "economy", regionId: resolution.market.hubId, magnitude: Math.max(-1, Math.min(1, (resolution.taxCopper - (resolution.caravan.ambushed ? 100 : 0)) / 500)), sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex };
  const politicsSignal = { id: `${receiptId}:politics`, kind: resolution.caravan.ambushed ? "war" : "politics", regionId: resolution.market.hubId, magnitude: Math.max(-1, Math.min(1, resolution.stabilityDelta / 10)), sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex };
  const governmentType = resolution.market.hubId === "emberfall" ? "trade_republic" : resolution.market.hubId === "cinder_vault" ? "warband" : "council";
  const npcRequest = { npcId: resolution.npc.npcId, regionId: resolution.npc.currentHubId, resolutionIndex: resolution.resolutionIndex, roleId: "merchant", needEvents, observationIds: [receiptId, `market:${resolution.market.hubId}:${resolution.commodity}:${resolution.unitPriceCopper}`], memory: resolution.nextMemory.length ? [resolution.nextMemory[resolution.nextMemory.length - 1]] : [], opportunities: lifeOpportunities(resolution, receiptId), economy: { currentHubId: resolution.npc.currentHubId, wealthCopper: resolution.npc.wealthCopper, hungerBps: resolution.npc.hungerBps, fatigueBps: resolution.npc.fatigueBps, tradeProwessBps: resolution.npc.tradeProwessBps, harvestYieldBps: resolution.npc.harvestYieldBps } };
  return deepFreeze({ resolution, npcRequest, worldRequest: { worldSeed: context.worldSeed, regionId: resolution.market.hubId, resolutionIndex: resolution.resolutionIndex, signals: [economySignal, politicsSignal] }, polityRequest: { polityId: `polity:${resolution.market.hubId}`, governmentType, territoryIds: [resolution.market.hubId], stability: Math.max(0, Math.min(100, context.polity.stability + resolution.stabilityDelta)), activeDiplomacy: resolution.action === "caravan" ? ["trade"] : ["non_aggression"], warSignals: resolution.caravan.ambushed ? [politicsSignal] : [] }, receiptId });
}
function validateMerchantAction(input) {
  const context = normalizeContext(input.context);
  const resolution = resolutionFor(context);
  const intent = parseIntent(input.intent);
  if (!intent) return blocked(context, resolution, "INTENT_TAMPERED");
  if (!context.sourcePlanIsPlanned) return invalid(context, resolution, intent, "SOURCE_PLAN_BLOCKED");
  if (!context.marketValid) return invalid(context, resolution, intent, "MARKET_STATE_MISMATCH");
  if (!context.polityValid) return invalid(context, resolution, intent, "POLITY_STATE_MISMATCH");
  if (!context.inventoryStateValid) return invalid(context, resolution, intent, "INVENTORY_STATE_MISMATCH");
  if (!context.targetsValid) return invalid(context, resolution, intent, "TARGET_STATE_MISMATCH");
  const boundAuthority = npcAuthority();
  if (!same(intent.authority, boundAuthority)) return invalid(context, resolution, intent, "REVISION_MISMATCH");
  if (!same(intent.sourceDecision, context.sourceDecision)) return invalid(context, resolution, intent, "SOURCE_DECISION_MISMATCH");
  if (intent.npcId !== context.npc.npcId || intent.resolutionIndex !== resolution.resolutionIndex || !same(intent.expectedEpoch, context.epoch) || intent.worldSeedSha256 !== worldSeedHash(context.worldSeed) || intent.expectedNpcHash !== npcStateHash(context.npc) || intent.expectedMarketHash !== context.marketEvidence.stateHash) return invalid(context, resolution, intent, "EPOCH_MISMATCH");
  if (intent.expectedPolityHash !== context.polity.stateHash) return invalid(context, resolution, intent, "POLITY_STATE_MISMATCH");
  if (intent.expectedInventoryHash !== context.inventory.stateHash) return invalid(context, resolution, intent, "INVENTORY_STATE_MISMATCH");
  const target = expectedTarget(context, resolution);
  if (!target) return invalid(context, resolution, intent, "TARGET_MISSING");
  if (!same(intent.target, target)) return invalid(context, resolution, intent, "TARGET_STATE_MISMATCH");
  if (resolution.action === "caravan" ? !resolution.caravan.destination || !hasLivingWorldRoute(context.market.hubId, target.hubId) : target.hubId !== context.npc.currentHubId) return invalid(context, resolution, intent, "TARGET_RANGE");
  if (!inventoryAvailable(context, resolution)) return invalid(context, resolution, intent, "INVENTORY_UNAVAILABLE");
  if (!same(intent, intended(context, resolution, target))) return invalid(context, resolution, intent, "INTENT_TAMPERED");
  const lease = parseLease(input.lease);
  if (!lease) return invalid(context, resolution, intent, "LEASE_MISSING");
  if (lease.state === "revoked") return invalid(context, resolution, intent, "LEASE_REVOKED");
  if (lease.state !== "active") return invalid(context, resolution, intent, "LEASE_CONFLICT");
  if (context.logicalIndex < lease.issuedAtLogicalIndex || context.logicalIndex > lease.expiresAtLogicalIndex) return invalid(context, resolution, intent, "LEASE_EXPIRED");
  if (!same(lease, proposedLeaseFor(context, intent, target))) return invalid(context, resolution, intent, "LEASE_CONFLICT");
  const receiptCore = { version: NPC_ACTION_RECEIPT_VERSION, npcId: intent.npcId, sourceDecision: intent.sourceDecision, resolutionIndex: intent.resolutionIndex, intentId: intent.id, leaseId: lease.id, authority: boundAuthority, action: resolution.action, originHubId: intent.originHubId, target: intent.target, worldSeedSha256: intent.worldSeedSha256, resolutionHash: resolution.deterministicHash, expectedEpoch: intent.expectedEpoch, npcStateHash: intent.expectedNpcHash, marketStateHash: intent.expectedMarketHash, polityStateHash: intent.expectedPolityHash, inventoryStateHash: context.inventory.stateHash };
  const receiptId = merchantActionReceiptId(receiptCore);
  const requests = requestsFromValidatedAction(context, resolution, receiptId);
  const unsignedReceipt = { ...receiptCore, id: receiptId, effectsHash: merchantActionEffectsHash(requests) };
  const receipt = deepFreeze({ ...unsignedReceipt, receiptHash: merchantActionReceiptHash(unsignedReceipt) });
  return Object.freeze({ status: "validated", intent, lease, receipt, resolution, requests });
}

// server/src/aurion/npc/semanticMemoryGraph.ts
import { createHash as createHash8 } from "node:crypto";
var NPC_SEMANTIC_GRAPH_VERSION = "wasd-npc-semantic-graph.v2";
var NPC_SEMANTIC_RETRIEVAL_VERSION = "wasd-npc-semantic-retrieval.v1";
var NPC_SEMANTIC_GRAPH_LIMITS = Object.freeze({
  nodes: 160,
  edges: 384,
  provenanceRefs: 160,
  performedActions: 16,
  traversalDepth: 4,
  candidates: 64,
  results: 32,
  startKeys: 16,
  filterValues: 16,
  bytes: 524288
});
var hashPattern = /^[a-f0-9]{64}$/;
var revisionPattern = /^[a-f0-9]{40}$/;
var idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
var nodeKinds = Object.freeze([
  "actor",
  "location",
  "world_event",
  "goal",
  "action",
  "outcome",
  "polity",
  "item_resource",
  "semantic_fact",
  "procedural_competency"
]);
var edgeKinds = Object.freeze([
  "observed_at",
  "participated_in",
  "selected_goal",
  "performed_action",
  "affected",
  "related_to",
  "member_of",
  "located_in",
  "supports",
  "contradicts",
  "supersedes",
  "derived_from"
]);
var statuses = Object.freeze(["active", "expired", "contradicted", "superseded"]);
var provenanceKinds = Object.freeze(["decision_receipt", "action_receipt", "effect_readback", "memory_link"]);
var verifiedPerformedActions = /* @__PURE__ */ new WeakSet();
var verifiedGraphs = /* @__PURE__ */ new WeakSet();
var textOrder2 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var digest2 = (value) => createHash8("sha256").update(stableCatalogStringify(value), "utf8").digest("hex");
var same2 = (a, b) => stableCatalogStringify(a) === stableCatalogStringify(b);
function assertId(value, code) {
  if (typeof value !== "string" || !idPattern.test(value)) throw new Error(code);
}
function assertRelationKey(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new Error(code);
}
function assertHash(value, code) {
  if (typeof value !== "string" || !hashPattern.test(value)) throw new Error(code);
}
function assertRevision(value, code) {
  if (typeof value !== "string" || !revisionPattern.test(value)) throw new Error(code);
}
function assertIndex(value, code) {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw new Error(code);
}
function deepFreeze2(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze2(child);
    Object.freeze(value);
  }
  return value;
}
function uniqueSorted(values) {
  return [...new Set(values)].sort(textOrder2);
}
function provenanceOrder(a, b) {
  return textOrder2(a.kind, b.kind) || textOrder2(a.id, b.id) || textOrder2(a.hash, b.hash);
}
function mergeProvenance(...groups) {
  const map = /* @__PURE__ */ new Map();
  for (const ref of groups.flat()) {
    const key = `${ref.kind}:${ref.id}:${ref.hash}`;
    const prior = map.get(key);
    if (prior && !same2(prior, ref)) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT");
    map.set(key, ref);
  }
  const result = [...map.values()].sort(provenanceOrder);
  if (result.length > NPC_SEMANTIC_GRAPH_LIMITS.provenanceRefs) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_LIMIT");
  return deepFreeze2(result);
}
function decisionRef(source) {
  return deepFreeze2({
    kind: "decision_receipt",
    id: source.receiptId,
    hash: source.receiptSha256,
    logicalIndex: source.logicalIndex,
    sourceRevision: source.authority.sourceRevision,
    sourceSha256: source.authority.sourceSha256
  });
}
function confirmedDecisionRef(source) {
  return deepFreeze2({
    kind: "decision_receipt",
    id: source.receiptId,
    hash: source.receiptSha256,
    logicalIndex: source.snapshot.decision.resolutionIndex,
    sourceRevision: source.authority.sourceRevision,
    sourceSha256: source.authority.sourceSha256
  });
}
function actionRef(action) {
  return deepFreeze2({
    kind: "action_receipt",
    id: action.id,
    hash: action.receiptHash,
    logicalIndex: action.resolutionIndex,
    sourceRevision: action.authority.sourceRevision,
    sourceSha256: action.authority.sourceSha256
  });
}
function effectRef(effect, sourceSha256, logicalIndex) {
  return deepFreeze2({
    kind: "effect_readback",
    id: effect.id,
    hash: effect.readbackHash,
    logicalIndex,
    sourceRevision: effect.sourceRevision,
    sourceSha256
  });
}
function linkRef(link, authority2) {
  return deepFreeze2({
    kind: "memory_link",
    id: link.id,
    hash: link.linkHash,
    logicalIndex: link.resolutionIndex,
    sourceRevision: authority2.sourceRevision,
    sourceSha256: authority2.sourceSha256
  });
}
function graphNodeId(npcId, kind, key, provenance) {
  return `smn_${digest2([NPC_SEMANTIC_GRAPH_VERSION, npcId, kind, key, provenance]).slice(0, 60)}`;
}
function graphEdgeId(npcId, kind, relationKey, fromNodeId, toNodeId) {
  return `sme_${digest2([NPC_SEMANTIC_GRAPH_VERSION, npcId, kind, relationKey, fromNodeId, toNodeId]).slice(0, 60)}`;
}
function sealNode(input, npcId) {
  const normalized = {
    ...input,
    provenance: mergeProvenance(input.provenance)
  };
  const id5 = graphNodeId(npcId, normalized.kind, normalized.key, normalized.provenance);
  return deepFreeze2({ ...normalized, id: id5, payloadHash: digest2(normalized) });
}
function sealEdge(input, npcId) {
  const normalized = {
    ...input,
    provenance: mergeProvenance(input.provenance)
  };
  const id5 = graphEdgeId(npcId, normalized.kind, normalized.relationKey, normalized.fromNodeId, normalized.toNodeId);
  return deepFreeze2({ ...normalized, id: id5, payloadHash: digest2(normalized) });
}
function statusForFact(fact, superseded) {
  if (fact.status === "expired") return "expired";
  if (fact.status === "conflicted") return "contradicted";
  return superseded ? "superseded" : "active";
}
function statusPriority(status) {
  return status === "active" ? 0 : status === "contradicted" ? 1 : status === "superseded" ? 2 : 3;
}
function nodePriority(kind) {
  return kind === "actor" ? 0 : kind === "action" || kind === "outcome" ? 1 : kind === "semantic_fact" ? 2 : kind === "goal" || kind === "location" ? 3 : kind === "world_event" ? 4 : kind === "procedural_competency" ? 5 : 6;
}
function edgePriority(kind) {
  return kind === "performed_action" ? 0 : kind === "supersedes" || kind === "contradicts" ? 1 : kind === "selected_goal" || kind === "located_in" ? 2 : kind === "affected" || kind === "derived_from" ? 3 : 4;
}
function semanticFactProvenance(fact) {
  return mergeProvenance(fact.provenance.map(decisionRef));
}
function episodeProvenance(episode) {
  return mergeProvenance([decisionRef(episode.source)]);
}
function competencyProvenance(competency) {
  return mergeProvenance(competency.provenance.map(decisionRef));
}
function verifyPerformedActionEvidence(input) {
  if (!isConfirmedNpcDecision(input.sourceDecision) || !isConfirmedNpcDecision(input.successorDecision)) {
    throw new Error("NPC_SEMANTIC_GRAPH_CONFIRMED_DECISION_REQUIRED");
  }
  const authority2 = npcAuthority();
  const action = input.actionReceipt;
  if (action.version !== NPC_ACTION_RECEIPT_VERSION || !same2(action.authority, authority2)) throw new Error("NPC_SEMANTIC_GRAPH_ACTION_REVISION_MISMATCH");
  assertId(action.id, "NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_INVALID");
  assertHash(action.receiptHash, "NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_INVALID");
  assertHash(action.effectsHash, "NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_INVALID");
  const { receiptHash, ...unsignedAction } = action;
  if (receiptHash !== merchantActionReceiptHash(unsignedAction)) throw new Error("NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_HASH_INVALID");
  const { id: _id, effectsHash: _effectsHash, receiptHash: _receiptHash, ...receiptCore } = action;
  if (action.id !== merchantActionReceiptId(receiptCore)) throw new Error("NPC_SEMANTIC_GRAPH_ACTION_RECEIPT_ID_INVALID");
  const source = input.sourceDecision;
  const sourcePlan = source.snapshot.lifeState.plan;
  if (!sourcePlan || sourcePlan.status !== "planned" || action.sourceDecision.receiptId !== source.receiptId || action.sourceDecision.receiptSha256 !== source.receiptSha256 || action.sourceDecision.npcId !== source.snapshot.npcId || action.sourceDecision.resolutionIndex !== source.snapshot.decision.resolutionIndex || action.sourceDecision.decisionHash !== source.snapshot.decision.decisionHash || action.sourceDecision.planHash !== sourcePlan.planHash || action.sourceDecision.goal !== source.snapshot.decision.goal) {
    throw new Error("NPC_SEMANTIC_GRAPH_ACTION_SOURCE_MISMATCH");
  }
  const successor = input.successorDecision;
  if (successor.snapshot.npcId !== action.npcId || successor.snapshot.decision.resolutionIndex !== action.resolutionIndex) {
    throw new Error("NPC_SEMANTIC_GRAPH_ACTION_SUCCESSOR_MISMATCH");
  }
  const effect = input.effectReadback;
  for (const value of [effect.id, effect.actionReceiptId, effect.npcReceiptId, effect.worldReceiptId, effect.polityId]) assertId(value, "NPC_SEMANTIC_GRAPH_EFFECT_READBACK_INVALID");
  for (const value of [effect.effectsHash, effect.npcDecisionHash, effect.worldReactionHash, effect.polityStateHash, effect.marketStateHash, effect.inventoryStateHash, effect.readbackHash]) assertHash(value, "NPC_SEMANTIC_GRAPH_EFFECT_READBACK_INVALID");
  assertRevision(effect.sourceRevision, "NPC_SEMANTIC_GRAPH_EFFECT_READBACK_INVALID");
  if (effect.actionReceiptId !== action.id || effect.effectsHash !== action.effectsHash || effect.npcReceiptId !== successor.receiptId || effect.npcDecisionHash !== successor.snapshot.decision.decisionHash || effect.sourceRevision !== authority2.sourceRevision) {
    throw new Error("NPC_SEMANTIC_GRAPH_EFFECT_READBACK_MISMATCH");
  }
  const link = input.memoryLink;
  for (const value of [link.id, link.actionReceiptId, link.effectReadbackId, link.memoryReceiptId, link.npcId]) assertId(value, "NPC_SEMANTIC_GRAPH_MEMORY_LINK_INVALID");
  assertHash(link.linkHash, "NPC_SEMANTIC_GRAPH_MEMORY_LINK_INVALID");
  assertIndex(link.resolutionIndex, "NPC_SEMANTIC_GRAPH_MEMORY_LINK_INVALID");
  if (link.actionReceiptId !== action.id || link.effectReadbackId !== effect.id || link.npcId !== action.npcId || link.resolutionIndex !== action.resolutionIndex) {
    throw new Error("NPC_SEMANTIC_GRAPH_MEMORY_LINK_MISMATCH");
  }
  const result = deepFreeze2({
    sourceDecision: source,
    successorDecision: successor,
    actionReceipt: action,
    effectReadback: effect,
    memoryLink: link
  });
  verifiedPerformedActions.add(result);
  return result;
}
function isVerifiedPerformedActionEvidence(value) {
  return !!value && typeof value === "object" && verifiedPerformedActions.has(value);
}
function buildNpcSemanticMemoryGraph(input) {
  const memory = verifyNpcMemoryEvidence(parseNpcMemoryV4(input.memory), input.memoryReceipts);
  if (memory.lastResolutionIndex < 0 || !memory.lastReceiptId) throw new Error("NPC_SEMANTIC_GRAPH_SOURCE_MEMORY_REQUIRED");
  const authority2 = npcAuthority();
  const performed = [...input.performedActions ?? []];
  if (performed.length > NPC_SEMANTIC_GRAPH_LIMITS.performedActions) throw new Error("NPC_SEMANTIC_GRAPH_ACTION_LIMIT");
  if (performed.some((action) => !isVerifiedPerformedActionEvidence(action))) throw new Error("NPC_SEMANTIC_GRAPH_PERFORMED_ACTION_EVIDENCE_REQUIRED");
  if (performed.some((action) => action.actionReceipt.npcId !== memory.npcId || action.actionReceipt.resolutionIndex > memory.lastResolutionIndex)) {
    throw new Error("NPC_SEMANTIC_GRAPH_ACTION_GENERATION_MISMATCH");
  }
  const previous = input.previousGraph ?? null;
  if (previous) {
    if (!verifiedGraphs.has(previous) || previous.npcId !== memory.npcId) throw new Error("NPC_SEMANTIC_GRAPH_PREDECESSOR_VERIFICATION_REQUIRED");
    if (previous.generation >= memory.lastResolutionIndex) throw new Error("NPC_SEMANTIC_GRAPH_GENERATION_REGRESSION");
  }
  const nodes = [];
  const edges = [];
  const nodeByIdentity = /* @__PURE__ */ new Map();
  const allMemoryProvenance = mergeProvenance([
    ...memory.episodic.map((e) => decisionRef(e.source)),
    ...memory.semantic.flatMap((f) => f.provenance.map(decisionRef)),
    ...memory.procedural.flatMap((c) => c.provenance.map(decisionRef))
  ]);
  const ensureIdentityNode = (kind, key, provenance, validFromIndex, validUntilIndex) => {
    const identity = `${kind}:${key}`;
    const existing = nodeByIdentity.get(identity);
    if (existing) return existing;
    const node = sealNode({ version: NPC_SEMANTIC_GRAPH_VERSION, kind, key, status: "active", validFromIndex, validUntilIndex, provenance }, memory.npcId);
    nodeByIdentity.set(identity, node);
    nodes.push(node);
    return node;
  };
  const actor = ensureIdentityNode("actor", memory.npcId, allMemoryProvenance, 0, null);
  const semantic = [...memory.semantic].sort((a, b) => b.validFromIndex - a.validFromIndex || textOrder2(a.id, b.id));
  const newestEquivalent = /* @__PURE__ */ new Map();
  const factStatus = /* @__PURE__ */ new Map();
  for (const fact of semantic) {
    const key = `${fact.subjectId}:${fact.predicate}:${fact.value}`;
    const newer = newestEquivalent.get(key);
    const status = statusForFact(fact, !!newer);
    factStatus.set(fact.id, status);
    if (!newer && status !== "expired" && status !== "contradicted") newestEquivalent.set(key, fact.id);
  }
  const factNodes = /* @__PURE__ */ new Map();
  for (const fact of semantic) {
    const provenance = semanticFactProvenance(fact), status = factStatus.get(fact.id);
    const factNode = sealNode({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "semantic_fact", key: fact.id, status, validFromIndex: fact.validFromIndex, validUntilIndex: fact.validUntilIndex, provenance }, memory.npcId);
    nodes.push(factNode);
    factNodes.set(fact.id, factNode);
    const kind = fact.predicate === "current_hub" ? "location" : "goal";
    const entity = ensureIdentityNode(kind, fact.value, provenance, fact.validFromIndex, fact.validUntilIndex);
    const relation = fact.predicate === "current_hub" ? "located_in" : "selected_goal";
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: relation, relationKey: fact.id, fromNodeId: actor.id, toNodeId: entity.id, status, validFromIndex: fact.validFromIndex, validUntilIndex: fact.validUntilIndex, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "derived_from", relationKey: fact.id, fromNodeId: factNode.id, toNodeId: entity.id, status, validFromIndex: fact.validFromIndex, validUntilIndex: fact.validUntilIndex, provenance }, memory.npcId));
  }
  const conflictPairs = /* @__PURE__ */ new Set();
  for (const fact of semantic) {
    const from = factNodes.get(fact.id);
    for (const otherId of fact.conflictsWith) {
      const to = factNodes.get(otherId);
      if (!to) continue;
      const ids = [from.id, to.id].sort(textOrder2), pair = `${ids[0]}:${ids[1]}`;
      if (conflictPairs.has(pair)) continue;
      conflictPairs.add(pair);
      const other = semantic.find((value) => value.id === otherId);
      const validFrom = Math.max(fact.validFromIndex, other.validFromIndex);
      const validUntil = Math.min(fact.validUntilIndex, other.validUntilIndex);
      edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "contradicts", relationKey: pair, fromNodeId: ids[0], toNodeId: ids[1], status: "active", validFromIndex: validFrom, validUntilIndex: validUntil, provenance: mergeProvenance(semanticFactProvenance(fact), semanticFactProvenance(other)) }, memory.npcId));
    }
  }
  for (const latestId of newestEquivalent.values()) {
    const latest = semantic.find((f) => f.id === latestId);
    if (!latest) continue;
    for (const older of semantic.filter((f) => f.id !== latest.id && f.subjectId === latest.subjectId && f.predicate === latest.predicate && f.value === latest.value && factStatus.get(f.id) === "superseded")) {
      edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "supersedes", relationKey: `${latest.id}:${older.id}`, fromNodeId: factNodes.get(latest.id).id, toNodeId: factNodes.get(older.id).id, status: "active", validFromIndex: latest.validFromIndex, validUntilIndex: null, provenance: mergeProvenance(semanticFactProvenance(latest), semanticFactProvenance(older)) }, memory.npcId));
    }
  }
  for (const episode of memory.episodic) {
    const provenance = episodeProvenance(episode);
    const event = ensureIdentityNode("world_event", episode.id, provenance, episode.logicalIndex, episode.expiresAtIndex);
    const location = ensureIdentityNode("location", episode.regionId, provenance, episode.logicalIndex, episode.expiresAtIndex);
    const goal = ensureIdentityNode("goal", episode.goal, provenance, episode.logicalIndex, episode.expiresAtIndex);
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "participated_in", relationKey: episode.id, fromNodeId: actor.id, toNodeId: event.id, status: "active", validFromIndex: episode.logicalIndex, validUntilIndex: episode.expiresAtIndex, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "observed_at", relationKey: episode.id, fromNodeId: event.id, toNodeId: location.id, status: "active", validFromIndex: episode.logicalIndex, validUntilIndex: episode.expiresAtIndex, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "selected_goal", relationKey: `episode:${episode.id}`, fromNodeId: event.id, toNodeId: goal.id, status: "active", validFromIndex: episode.logicalIndex, validUntilIndex: episode.expiresAtIndex, provenance }, memory.npcId));
  }
  for (const competency of memory.procedural) {
    const provenance = competencyProvenance(competency);
    const node = ensureIdentityNode("procedural_competency", competency.competencyId, provenance, competency.provenance[0].logicalIndex, null);
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "supports", relationKey: competency.id, fromNodeId: actor.id, toNodeId: node.id, status: "active", validFromIndex: competency.provenance[0].logicalIndex, validUntilIndex: null, provenance }, memory.npcId));
  }
  for (const performedAction of performed.sort((a, b) => a.actionReceipt.resolutionIndex - b.actionReceipt.resolutionIndex || textOrder2(a.actionReceipt.id, b.actionReceipt.id))) {
    const action = performedAction.actionReceipt;
    const provenance = mergeProvenance(
      [confirmedDecisionRef(performedAction.sourceDecision)],
      [actionRef(action)],
      [effectRef(performedAction.effectReadback, authority2.sourceSha256, action.resolutionIndex)],
      [linkRef(performedAction.memoryLink, authority2)],
      [confirmedDecisionRef(performedAction.successorDecision)]
    );
    const actionNode = ensureIdentityNode("action", action.id, provenance, action.resolutionIndex, null);
    const outcomeNode = ensureIdentityNode("outcome", `${action.id}:committed`, provenance, action.resolutionIndex, null);
    const targetNode = ensureIdentityNode("location", action.target.hubId, provenance, action.resolutionIndex, null);
    const polityNode = ensureIdentityNode("polity", performedAction.effectReadback.polityId, provenance, action.resolutionIndex, null);
    const goalNode = ensureIdentityNode("goal", action.sourceDecision.goal, provenance, action.sourceDecision.resolutionIndex, null);
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "performed_action", relationKey: action.id, fromNodeId: actor.id, toNodeId: actionNode.id, status: "active", validFromIndex: action.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "affected", relationKey: action.id, fromNodeId: actionNode.id, toNodeId: outcomeNode.id, status: "active", validFromIndex: action.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "affected", relationKey: `${action.id}:target`, fromNodeId: actionNode.id, toNodeId: targetNode.id, status: "active", validFromIndex: action.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "affected", relationKey: `${action.id}:polity`, fromNodeId: actionNode.id, toNodeId: polityNode.id, status: "active", validFromIndex: action.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
    edges.push(sealEdge({ version: NPC_SEMANTIC_GRAPH_VERSION, kind: "derived_from", relationKey: `${action.id}:goal`, fromNodeId: actionNode.id, toNodeId: goalNode.id, status: "active", validFromIndex: action.resolutionIndex, validUntilIndex: null, provenance }, memory.npcId));
  }
  const retainedNodes = [...nodes].sort((a, b) => nodePriority(a.kind) - nodePriority(b.kind) || statusPriority(a.status) - statusPriority(b.status) || b.validFromIndex - a.validFromIndex || textOrder2(a.id, b.id)).slice(0, NPC_SEMANTIC_GRAPH_LIMITS.nodes);
  const retainedIds = new Set(retainedNodes.map((node) => node.id));
  const retainedEdges = edges.filter((edge) => retainedIds.has(edge.fromNodeId) && retainedIds.has(edge.toNodeId)).sort((a, b) => edgePriority(a.kind) - edgePriority(b.kind) || statusPriority(a.status) - statusPriority(b.status) || b.validFromIndex - a.validFromIndex || textOrder2(a.id, b.id)).slice(0, NPC_SEMANTIC_GRAPH_LIMITS.edges);
  const sealGraph = (edgePrefix) => {
    const canonicalNodes = [...retainedNodes].sort((a, b) => textOrder2(a.id, b.id));
    const canonicalEdges = [...edgePrefix].sort((a, b) => textOrder2(a.id, b.id));
    const unsigned = {
      version: NPC_SEMANTIC_GRAPH_VERSION,
      retrievalVersion: NPC_SEMANTIC_RETRIEVAL_VERSION,
      npcId: memory.npcId,
      generation: memory.lastResolutionIndex,
      authority: authority2,
      memoryHash: memory.memoryHash,
      previousGraphHash: previous?.graphHash ?? null,
      nodes: canonicalNodes,
      edges: canonicalEdges
    };
    const graph = deepFreeze2({ ...unsigned, graphHash: digest2(unsigned) });
    return { graph, bytes: Buffer.byteLength(stableCatalogStringify(graph), "utf8") };
  };
  let sealed = sealGraph(retainedEdges);
  if (sealed.bytes > NPC_SEMANTIC_GRAPH_LIMITS.bytes) {
    let low = 0, high = retainedEdges.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2), trial = sealGraph(retainedEdges.slice(0, mid));
      if (trial.bytes <= NPC_SEMANTIC_GRAPH_LIMITS.bytes) low = mid;
      else high = mid - 1;
    }
    sealed = sealGraph(retainedEdges.slice(0, low));
  }
  if (sealed.bytes > NPC_SEMANTIC_GRAPH_LIMITS.bytes) throw new Error("NPC_SEMANTIC_GRAPH_BYTE_LIMIT");
  verifiedGraphs.add(sealed.graph);
  return sealed.graph;
}
function compileNpcSemanticMemoryGraph(input) {
  return buildNpcSemanticMemoryGraph(input);
}
function validateProvenance(ref) {
  if (!ref || typeof ref !== "object") throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  const value = ref;
  if (!provenanceKinds.includes(value.kind)) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertId(value.id, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertHash(value.hash, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertIndex(value.logicalIndex, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertRevision(value.sourceRevision, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  assertHash(value.sourceSha256, "NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
}
function parseNode(raw, npcId) {
  if (!raw || typeof raw !== "object") throw new Error("NPC_SEMANTIC_GRAPH_NODE_INVALID");
  const node = raw;
  if (node.version !== NPC_SEMANTIC_GRAPH_VERSION || !nodeKinds.includes(node.kind) || !statuses.includes(node.status)) throw new Error("NPC_SEMANTIC_GRAPH_NODE_INVALID");
  assertId(node.id, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
  assertId(node.key, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
  assertIndex(node.validFromIndex, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
  if (node.validUntilIndex !== null) {
    assertIndex(node.validUntilIndex, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
    if (node.validUntilIndex <= node.validFromIndex) throw new Error("NPC_SEMANTIC_GRAPH_NODE_INVALID");
  }
  if (!Array.isArray(node.provenance) || !node.provenance.length || node.provenance.length > NPC_SEMANTIC_GRAPH_LIMITS.provenanceRefs) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  node.provenance.forEach(validateProvenance);
  if (!same2(node.provenance, [...node.provenance].sort(provenanceOrder)) || new Set(node.provenance.map((ref) => `${ref.kind}:${ref.id}:${ref.hash}`)).size !== node.provenance.length) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_ORDER");
  assertHash(node.payloadHash, "NPC_SEMANTIC_GRAPH_NODE_INVALID");
  const { id: id5, payloadHash, ...payload } = node;
  if (id5 !== graphNodeId(npcId, node.kind, node.key, node.provenance) || payloadHash !== digest2(payload)) throw new Error("NPC_SEMANTIC_GRAPH_NODE_HASH_INVALID");
  return node;
}
function parseEdge(raw, npcId) {
  if (!raw || typeof raw !== "object") throw new Error("NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  const edge = raw;
  if (edge.version !== NPC_SEMANTIC_GRAPH_VERSION || !edgeKinds.includes(edge.kind) || !statuses.includes(edge.status)) throw new Error("NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertId(edge.id, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertRelationKey(edge.relationKey, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertId(edge.fromNodeId, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertId(edge.toNodeId, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  assertIndex(edge.validFromIndex, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  if (edge.validUntilIndex !== null) {
    assertIndex(edge.validUntilIndex, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
    if (edge.validUntilIndex <= edge.validFromIndex) throw new Error("NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  }
  if (!Array.isArray(edge.provenance) || !edge.provenance.length || edge.provenance.length > NPC_SEMANTIC_GRAPH_LIMITS.provenanceRefs) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_INVALID");
  edge.provenance.forEach(validateProvenance);
  if (!same2(edge.provenance, [...edge.provenance].sort(provenanceOrder)) || new Set(edge.provenance.map((ref) => `${ref.kind}:${ref.id}:${ref.hash}`)).size !== edge.provenance.length) throw new Error("NPC_SEMANTIC_GRAPH_PROVENANCE_ORDER");
  assertHash(edge.payloadHash, "NPC_SEMANTIC_GRAPH_EDGE_INVALID");
  const { id: id5, payloadHash, ...payload } = edge;
  if (id5 !== graphEdgeId(npcId, edge.kind, edge.relationKey, edge.fromNodeId, edge.toNodeId) || payloadHash !== digest2(payload)) throw new Error("NPC_SEMANTIC_GRAPH_EDGE_HASH_INVALID");
  return edge;
}
function parseNpcSemanticMemoryGraph(value) {
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > NPC_SEMANTIC_GRAPH_LIMITS.bytes) throw new Error("NPC_SEMANTIC_GRAPH_BYTE_LIMIT");
    value = JSON.parse(value);
  }
  if (!value || typeof value !== "object") throw new Error("NPC_SEMANTIC_GRAPH_INVALID");
  const graph = value;
  if (graph.version !== NPC_SEMANTIC_GRAPH_VERSION || graph.retrievalVersion !== NPC_SEMANTIC_RETRIEVAL_VERSION) throw new Error("NPC_SEMANTIC_GRAPH_VERSION_INVALID");
  assertId(graph.npcId, "NPC_SEMANTIC_GRAPH_INVALID");
  assertIndex(graph.generation, "NPC_SEMANTIC_GRAPH_INVALID");
  if (!same2(graph.authority, npcAuthority())) throw new Error("NPC_SEMANTIC_GRAPH_REVISION_MISMATCH");
  assertHash(graph.memoryHash, "NPC_SEMANTIC_GRAPH_INVALID");
  if (graph.previousGraphHash !== null) assertHash(graph.previousGraphHash, "NPC_SEMANTIC_GRAPH_INVALID");
  if (!Array.isArray(graph.nodes) || graph.nodes.length > NPC_SEMANTIC_GRAPH_LIMITS.nodes || !Array.isArray(graph.edges) || graph.edges.length > NPC_SEMANTIC_GRAPH_LIMITS.edges) throw new Error("NPC_SEMANTIC_GRAPH_LIMIT");
  const nodes = graph.nodes.map((node) => parseNode(node, graph.npcId));
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length || !same2(nodes, [...nodes].sort((a, b) => textOrder2(a.id, b.id)))) throw new Error("NPC_SEMANTIC_GRAPH_NODE_ORDER");
  const edges = graph.edges.map((edge) => parseEdge(edge, graph.npcId));
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length || !same2(edges, [...edges].sort((a, b) => textOrder2(a.id, b.id))) || edges.some((edge) => !ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId))) throw new Error("NPC_SEMANTIC_GRAPH_EDGE_ORDER");
  assertHash(graph.graphHash, "NPC_SEMANTIC_GRAPH_HASH_INVALID");
  const { graphHash, ...unsigned } = graph;
  if (graphHash !== digest2(unsigned)) throw new Error("NPC_SEMANTIC_GRAPH_HASH_INVALID");
  if (Buffer.byteLength(stableCatalogStringify(graph), "utf8") > NPC_SEMANTIC_GRAPH_LIMITS.bytes) throw new Error("NPC_SEMANTIC_GRAPH_BYTE_LIMIT");
  return deepFreeze2(graph);
}
function verifyNpcSemanticMemoryGraph(value, evidence) {
  const candidate = parseNpcSemanticMemoryGraph(value);
  const rebuilt = buildNpcSemanticMemoryGraph(evidence);
  if (!same2(candidate, rebuilt)) throw new Error("NPC_SEMANTIC_GRAPH_SOURCE_EVIDENCE_MISMATCH");
  verifiedGraphs.add(candidate);
  return candidate;
}
function isVerifiedNpcSemanticMemoryGraph(value) {
  return !!value && typeof value === "object" && verifiedGraphs.has(value);
}
function normalizeQuery(query) {
  assertIndex(query.logicalIndex, "NPC_SEMANTIC_RETRIEVAL_QUERY_INVALID");
  const startKeys = uniqueSorted(query.startKeys ?? []);
  const kinds = uniqueSorted(query.nodeKinds ?? []);
  const relations = uniqueSorted(query.edgeKinds ?? []);
  if (startKeys.length > NPC_SEMANTIC_GRAPH_LIMITS.startKeys || kinds.length > NPC_SEMANTIC_GRAPH_LIMITS.filterValues || relations.length > NPC_SEMANTIC_GRAPH_LIMITS.filterValues || startKeys.some((value) => !idPattern.test(value)) || kinds.some((value) => !nodeKinds.includes(value)) || relations.some((value) => !edgeKinds.includes(value))) throw new Error("NPC_SEMANTIC_RETRIEVAL_QUERY_INVALID");
  const maxDepth = query.maxDepth ?? NPC_SEMANTIC_GRAPH_LIMITS.traversalDepth;
  const maxCandidates = query.maxCandidates ?? NPC_SEMANTIC_GRAPH_LIMITS.candidates;
  const maxResults = query.maxResults ?? NPC_SEMANTIC_GRAPH_LIMITS.results;
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > NPC_SEMANTIC_GRAPH_LIMITS.traversalDepth || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > NPC_SEMANTIC_GRAPH_LIMITS.candidates || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > NPC_SEMANTIC_GRAPH_LIMITS.results || maxResults > maxCandidates) throw new Error("NPC_SEMANTIC_RETRIEVAL_BOUNDS_INVALID");
  return deepFreeze2({ logicalIndex: query.logicalIndex, startKeys, nodeKinds: kinds, edgeKinds: relations, maxDepth, maxCandidates, maxResults });
}
function activeAt(status, from, until, index5) {
  return status === "active" && index5 >= from && (until === null || index5 < until);
}
function retrieveNpcSemanticMemoryGraph(graphValue, queryValue) {
  if (!verifiedGraphs.has(graphValue)) throw new Error("NPC_SEMANTIC_GRAPH_VERIFIED_SOURCE_REQUIRED");
  const graph = parseNpcSemanticMemoryGraph(graphValue), query = normalizeQuery(queryValue);
  if (query.logicalIndex > graph.generation) throw new Error("NPC_SEMANTIC_RETRIEVAL_QUERY_AFTER_GRAPH_GENERATION");
  const activeNodes = graph.nodes.filter((node) => activeAt(node.status, node.validFromIndex, node.validUntilIndex, query.logicalIndex));
  const activeById = new Map(activeNodes.map((node) => [node.id, node]));
  const allowedEdges = graph.edges.filter((edge) => activeAt(edge.status, edge.validFromIndex, edge.validUntilIndex, query.logicalIndex) && activeById.has(edge.fromNodeId) && activeById.has(edge.toNodeId) && (!query.edgeKinds.length || query.edgeKinds.includes(edge.kind)));
  const outgoing = /* @__PURE__ */ new Map();
  for (const edge of allowedEdges) {
    const list = outgoing.get(edge.fromNodeId) ?? [];
    list.push(edge);
    outgoing.set(edge.fromNodeId, list);
  }
  for (const list of outgoing.values()) list.sort((a, b) => textOrder2(a.toNodeId, b.toNodeId) || textOrder2(a.id, b.id));
  const depths = /* @__PURE__ */ new Map();
  const seeds = (query.startKeys.length ? activeNodes.filter((node) => query.startKeys.includes(node.key)) : activeNodes).sort((a, b) => textOrder2(a.id, b.id)).slice(0, query.maxCandidates);
  let frontier = seeds.map((node) => node.id);
  for (const id5 of frontier) depths.set(id5, 0);
  for (let depth = 0; depth < query.maxDepth && frontier.length && depths.size < query.maxCandidates; depth++) {
    const next2 = [];
    for (const nodeId of [...frontier].sort(textOrder2)) {
      for (const edge of outgoing.get(nodeId) ?? []) {
        if (depths.has(edge.toNodeId)) continue;
        depths.set(edge.toNodeId, depth + 1);
        next2.push(edge.toNodeId);
        if (depths.size >= query.maxCandidates) break;
      }
      if (depths.size >= query.maxCandidates) break;
    }
    frontier = uniqueSorted(next2);
  }
  const results = [...depths.entries()].map(([nodeId, depth]) => {
    const node = activeById.get(nodeId);
    const age = Math.max(0, query.logicalIndex - node.validFromIndex);
    const recency = Math.max(0, 999 - Math.min(999, age));
    const score = (query.startKeys.includes(node.key) ? 1e4 : 0) + (query.nodeKinds.includes(node.kind) ? 1e3 : 0) + Math.max(0, 500 - depth * 100) + recency + Math.min(99, node.provenance.length);
    return { nodeId: node.id, kind: node.kind, key: node.key, status: "active", depth, score, payloadHash: node.payloadHash };
  }).filter((result) => !query.nodeKinds.length || query.nodeKinds.includes(result.kind)).sort((a, b) => b.score - a.score || a.depth - b.depth || textOrder2(a.nodeId, b.nodeId)).slice(0, query.maxResults);
  const unsigned = { version: NPC_SEMANTIC_RETRIEVAL_VERSION, graphHash: graph.graphHash, query, results };
  return deepFreeze2({ ...unsigned, resultHash: digest2(unsigned) });
}
export {
  AURION_WASD_CONTENT_VERSION,
  AURION_WASD_RULESET_VERSION,
  AX1_LIVING_WORLD_RULESET,
  NPC_ACTION_GATEWAY_MAX_CANDIDATES,
  NPC_ACTION_GATEWAY_MAX_TARGETS,
  NPC_ACTION_GATEWAY_VERSION,
  NPC_ACTION_LEASE_VERSION,
  NPC_ACTION_RECEIPT_VERSION,
  NPC_LIFE_MAX_OPPORTUNITIES,
  NPC_LIFE_MAX_PLAN_STEPS,
  NPC_LIFE_MAX_RELATIONSHIPS,
  NPC_LIFE_MEMORY_HORIZON,
  NPC_LIFE_RECEIPT_VERSION,
  NPC_LIFE_VERSION,
  NPC_MEMORY_AGE_TICKS,
  NPC_MEMORY_CAPACITY,
  NPC_MEMORY_VERSION,
  NPC_MULTI_MEMORY_LIMITS,
  NPC_MULTI_MEMORY_VERSION,
  NPC_RECEIPT_VERSION,
  NPC_SEMANTIC_GRAPH_LIMITS,
  NPC_SEMANTIC_GRAPH_VERSION,
  NPC_SEMANTIC_RETRIEVAL_VERSION,
  WASD_NPC_MEMORY_RULESET,
  advanceNpcMemory,
  buildWorldSeedDigest,
  caravanSecurityIndex,
  commitNpcMemoryV4,
  compileNpcSemanticMemoryGraph,
  confirmedNpcEconomy,
  createNpcLifeSnapshot,
  createNpcMemoryV4,
  createNpcSnapshot,
  decideNpcGoal,
  decodeNpcReceipt,
  deriveNpcPersonality,
  diplomacyTypes,
  encodeNpcLifeReceipt,
  encodeNpcReceipt,
  hasLivingWorldRoute,
  isConfirmedNpcDecision,
  isVerifiedNpcSemanticMemoryGraph,
  isVerifiedPerformedActionEvidence,
  livingWorldSocialActions,
  marketPriceCopper,
  merchantActionEffectsHash,
  merchantActionReceiptHash,
  merchantActionReceiptId,
  merchantBootstrapMarkets,
  merchantInventoryStateHash,
  merchantMarketStateHash,
  merchantPolityStateHash,
  normalizeNpcRequest,
  npcAuthority,
  npcEconomyLifeStateSchema,
  npcHash,
  npcIdentity,
  npcLifeDecisionHash,
  npcLifeGoals,
  npcLifeOpportunityKinds,
  npcLifeOpportunitySchema,
  npcLifePlanActions,
  planSchema as npcLifePlanSchema,
  npcMemoryReceiptIds,
  npcNeedKeys,
  npcNeedsSchema,
  npcReceiptVersion,
  npcRelationshipEventSchema,
  npcRequestHash,
  npcRequestSchema,
  parseNpcEconomyLifeState,
  parseNpcJson,
  parseNpcLifeOpportunity,
  parseNpcLifeState,
  parseNpcMemory,
  parseNpcMemoryV4,
  parseNpcNeeds,
  parseNpcRelationshipEvent,
  parseNpcSemanticMemoryGraph,
  planMerchantAction,
  polityGovernmentTypes,
  projectNpcMemoryV4,
  replayNpcMemoryV4,
  resolveLivingWorldTick,
  resolveNpcLife,
  resolveNpcNeeds,
  resolvePolityState,
  resolveWorldReaction,
  retrieveNpcSemanticMemoryGraph,
  socialMasteryEvidence,
  stableCatalogStringify,
  validateMerchantAction,
  verifyConfirmedNpcDecision,
  verifyNpcMemoryEvidence,
  verifyNpcSemanticMemoryGraph,
  verifyPerformedActionEvidence,
  worldSignalKinds
};
