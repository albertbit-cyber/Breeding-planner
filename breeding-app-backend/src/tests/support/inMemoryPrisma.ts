import fs from "fs";
import path from "path";

/**
 * A stateful, in-memory stand-in for the Prisma client, for tests that walk a
 * whole flow through the live Express stack.
 *
 * The per-call `vi.fn()` mocks the other suites use are right for one route at
 * a time, but a flow test needs each step to see what the previous one wrote:
 * the organization an invitation created is the one the order is routed to.
 * Hand-scripting every read for that would test the script, not the code.
 *
 * Column defaults and relations are read from `prisma/schema.prisma` rather
 * than restated here, so `include`, relation filters and `@default` behave the
 * way the real client would for whatever models the code under test touches.
 * Deliberately not covered: raw SQL, unique-constraint errors, and anything
 * beyond the query shapes the services use. Unsupported operators throw, so a
 * gap shows up as a failing test rather than a silently wrong answer.
 */

type Row = Record<string, any>;

type FieldDef = {
  name: string;
  type: string;
  isList: boolean;
  isOptional: boolean;
  defaultValue?: () => unknown;
  isUpdatedAt: boolean;
  relation?: { name: string | null; fields: string[]; references: string[] };
};

type RelationDef = {
  model: string;
  kind: "one" | "many";
  localFields: string[];
  foreignFields: string[];
};

type ModelDef = {
  name: string;
  scalars: FieldDef[];
  relations: Record<string, RelationDef>;
};

const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

let idCounter = 0;
const nextId = () => `mem_${(++idCounter).toString(36)}_${Date.now().toString(36)}`;

const parseDefault = (raw: string, enumNames: Set<string>, type: string): (() => unknown) | undefined => {
  const value = raw.trim();
  if (value === "now()") return () => new Date();
  if (value === "cuid()" || value === "uuid()" || value.startsWith("dbgenerated")) return () => nextId();
  if (value === "autoincrement()") return () => ++idCounter;
  if (value === "true" || value === "false") return () => value === "true";
  if (/^-?\d+(\.\d+)?$/.test(value)) return () => Number(value);
  if (/^".*"$/.test(value)) return () => JSON.parse(value);
  if (value.startsWith("[")) {
    const inner = value.slice(1, -1).trim();
    return () => (inner ? inner.split(",").map((part) => JSON.parse(part.trim())) : []);
  }
  if (value.startsWith("\"") || enumNames.has(type) || /^[A-Za-z_]+$/.test(value)) return () => value;
  return undefined;
};

/** Pulls the balanced argument list out of `@name(...)`. */
const attributeArgs = (line: string, attribute: string): string | null => {
  const start = line.indexOf(`@${attribute}(`);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + attribute.length + 1; i < line.length; i += 1) {
    if (line[i] === "(") depth += 1;
    if (line[i] === ")") {
      depth -= 1;
      if (depth === 0) return line.slice(start + attribute.length + 2, i);
    }
  }
  return null;
};

const parseSchema = (schemaText: string): Record<string, ModelDef> => {
  const enumNames = new Set(Array.from(schemaText.matchAll(/^enum\s+(\w+)/gm)).map((m) => m[1]));
  const modelBlocks = Array.from(schemaText.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm));
  const modelNames = new Set(modelBlocks.map((m) => m[1]));
  const rawFields: Record<string, FieldDef[]> = {};

  for (const [, modelName, body] of modelBlocks) {
    const fields: FieldDef[] = [];
    for (const rawLine of body.split("\n")) {
      const line = rawLine.replace(/\/\/.*$/, "").trim();
      if (!line || line.startsWith("@@") || line.startsWith("/*") || line.startsWith("*")) continue;
      const match = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!match) continue;
      const [, name, type, list, optional] = match;
      const defaultArgs = attributeArgs(line, "default");
      const relationArgs = attributeArgs(line, "relation");
      let relation: FieldDef["relation"];
      if (modelNames.has(type)) {
        const nameMatch = relationArgs?.match(/^\s*"([^"]+)"/) || relationArgs?.match(/name:\s*"([^"]+)"/);
        const fieldsMatch = relationArgs?.match(/fields:\s*\[([^\]]*)\]/);
        const refsMatch = relationArgs?.match(/references:\s*\[([^\]]*)\]/);
        const split = (text?: string) => (text ? text.split(",").map((part) => part.trim()).filter(Boolean) : []);
        relation = { name: nameMatch ? nameMatch[1] : null, fields: split(fieldsMatch?.[1]), references: split(refsMatch?.[1]) };
      }
      fields.push({
        name,
        type,
        isList: Boolean(list),
        isOptional: Boolean(optional),
        defaultValue: defaultArgs !== null ? parseDefault(defaultArgs, enumNames, type) : undefined,
        isUpdatedAt: /@updatedAt\b/.test(line),
        relation,
      });
    }
    rawFields[modelName] = fields;
  }

  const models: Record<string, ModelDef> = {};
  for (const [modelName, fields] of Object.entries(rawFields)) {
    const relations: Record<string, RelationDef> = {};
    for (const field of fields) {
      if (!field.relation) continue;
      const target = field.type;
      if (field.relation.fields.length) {
        relations[field.name] = {
          model: target,
          kind: "one",
          localFields: field.relation.fields,
          foreignFields: field.relation.references,
        };
        continue;
      }
      // Back-relation: the foreign keys live on the other side.
      const inverse = rawFields[target].find(
        (other) =>
          other.type === modelName &&
          other.relation &&
          other.relation.fields.length > 0 &&
          (other.relation.name || null) === (field.relation!.name || null)
      );
      if (!inverse?.relation) continue;
      relations[field.name] = {
        model: target,
        kind: field.isList ? "many" : "one",
        localFields: inverse.relation.references,
        foreignFields: inverse.relation.fields,
      };
    }
    models[modelName] = { name: modelName, scalars: fields.filter((field) => !field.relation), relations };
  }
  return models;
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value);

const comparable = (value: unknown) => (value instanceof Date ? value.getTime() : value);

const SCALAR_OPERATORS = new Set([
  "equals", "not", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith",
  "mode", "has", "hasSome", "hasEvery", "isEmpty",
]);

const matchScalar = (actual: unknown, condition: unknown): boolean => {
  if (!isPlainObject(condition)) {
    if (condition === null) return actual === null || actual === undefined;
    return comparable(actual) === comparable(condition);
  }
  const insensitive = condition.mode === "insensitive";
  const text = (value: unknown) => (insensitive ? String(value ?? "").toLowerCase() : String(value ?? ""));
  return Object.entries(condition).every(([operator, expected]) => {
    if (!SCALAR_OPERATORS.has(operator)) {
      throw new Error(`inMemoryPrisma: unsupported filter operator "${operator}"`);
    }
    switch (operator) {
      case "mode":
        return true;
      case "equals":
        return matchScalar(actual, expected);
      case "not":
        return !matchScalar(actual, expected);
      case "in":
        return (expected as unknown[]).some((entry) => comparable(entry) === comparable(actual));
      case "notIn":
        return !(expected as unknown[]).some((entry) => comparable(entry) === comparable(actual));
      case "lt":
        return actual !== null && actual !== undefined && (comparable(actual) as any) < (comparable(expected) as any);
      case "lte":
        return actual !== null && actual !== undefined && (comparable(actual) as any) <= (comparable(expected) as any);
      case "gt":
        return actual !== null && actual !== undefined && (comparable(actual) as any) > (comparable(expected) as any);
      case "gte":
        return actual !== null && actual !== undefined && (comparable(actual) as any) >= (comparable(expected) as any);
      case "contains":
        return actual !== null && actual !== undefined && text(actual).includes(text(expected));
      case "startsWith":
        return actual !== null && actual !== undefined && text(actual).startsWith(text(expected));
      case "endsWith":
        return actual !== null && actual !== undefined && text(actual).endsWith(text(expected));
      case "has":
        return Array.isArray(actual) && actual.includes(expected);
      case "hasSome":
        return Array.isArray(actual) && (expected as unknown[]).some((entry) => actual.includes(entry));
      case "hasEvery":
        return Array.isArray(actual) && (expected as unknown[]).every((entry) => actual.includes(entry));
      case "isEmpty":
        return Array.isArray(actual) && (actual.length === 0) === Boolean(expected);
      default:
        return false;
    }
  });
};

export type InMemoryPrisma = any & {
  /** Direct access to the stored rows, for assertions. */
  $tables: Record<string, Row[]>;
  $reset: () => void;
};

export const createInMemoryPrisma = (
  schemaPath = path.resolve(__dirname, "../../../prisma/schema.prisma")
): InMemoryPrisma => {
  const models = parseSchema(fs.readFileSync(schemaPath, "utf8"));
  const modelByDelegate: Record<string, ModelDef> = {};
  for (const model of Object.values(models)) modelByDelegate[lowerFirst(model.name)] = model;

  const tables: Record<string, Row[]> = {};
  const table = (modelName: string) => (tables[modelName] ||= []);

  const related = (model: ModelDef, row: Row, relationName: string): Row | Row[] | null => {
    const relation = model.relations[relationName];
    const candidates = table(relation.model).filter((other) =>
      relation.foreignFields.every((foreign, index) => {
        const local = row[relation.localFields[index]];
        return local !== null && local !== undefined && other[foreign] === local;
      })
    );
    return relation.kind === "many" ? candidates : candidates[0] || null;
  };

  const matches = (model: ModelDef, row: Row, where: Record<string, any> | undefined): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, condition]) => {
      if (condition === undefined) return true;
      if (key === "AND") return (Array.isArray(condition) ? condition : [condition]).every((c) => matches(model, row, c));
      if (key === "OR") return (condition as any[]).some((c) => matches(model, row, c));
      if (key === "NOT") return !(Array.isArray(condition) ? condition : [condition]).every((c) => matches(model, row, c));

      const relation = model.relations[key];
      if (relation) {
        const target = models[relation.model];
        const value = related(model, row, key);
        if (relation.kind === "many") {
          const rows = value as Row[];
          if (condition.some) return rows.some((r) => matches(target, r, condition.some));
          if (condition.every) return rows.every((r) => matches(target, r, condition.every));
          if (condition.none) return !rows.some((r) => matches(target, r, condition.none));
          throw new Error(`inMemoryPrisma: unsupported list-relation filter on ${model.name}.${key}`);
        }
        if (condition === null) return value === null;
        if (isPlainObject(condition) && ("is" in condition || "isNot" in condition)) {
          if ("is" in condition) return condition.is === null ? value === null : Boolean(value) && matches(target, value as Row, condition.is);
          return condition.isNot === null ? value !== null : !value || !matches(target, value as Row, condition.isNot);
        }
        return Boolean(value) && matches(target, value as Row, condition);
      }

      const isColumn = model.scalars.some((field) => field.name === key);
      // Compound unique selectors (`organizationId_name: { ... }`) spread into their parts.
      if (!isColumn && isPlainObject(condition) && key.includes("_")) return matches(model, row, condition);
      return matchScalar(row[key], condition);
    });
  };

  const project = (model: ModelDef, row: Row, args: { include?: any; select?: any } = {}): Row => {
    const shape = args.select || null;
    const include = args.include || null;
    const result: Row = {};

    if (shape) {
      for (const [key, spec] of Object.entries(shape)) {
        if (!spec) continue;
        if (key === "_count") result[key] = countRelations(model, row, spec);
        else if (model.relations[key]) result[key] = projectRelation(model, row, key, spec);
        else result[key] = row[key];
      }
      return result;
    }

    Object.assign(result, row);
    if (include) {
      for (const [key, spec] of Object.entries(include)) {
        if (!spec) continue;
        if (key === "_count") {
          result[key] = countRelations(model, row, spec);
          continue;
        }
        if (!model.relations[key]) throw new Error(`inMemoryPrisma: ${model.name} has no relation "${key}"`);
        result[key] = projectRelation(model, row, key, spec);
      }
    }
    return result;
  };

  const countRelations = (model: ModelDef, row: Row, spec: any) => {
    const counted = spec === true ? Object.keys(model.relations).filter((k) => model.relations[k].kind === "many") : Object.keys(spec.select || {});
    const out: Record<string, number> = {};
    for (const key of counted) {
      const relation = model.relations[key];
      if (!relation) throw new Error(`inMemoryPrisma: ${model.name} has no relation "${key}" to count`);
      const where = isPlainObject(spec.select?.[key]) ? spec.select[key].where : undefined;
      out[key] = (related(model, row, key) as Row[]).filter((r) => matches(models[relation.model], r, where)).length;
    }
    return out;
  };

  const projectRelation = (model: ModelDef, row: Row, key: string, spec: any) => {
    const relation = model.relations[key];
    const target = models[relation.model];
    const value = related(model, row, key);
    const nested = spec === true ? {} : spec;
    if (relation.kind === "many") {
      const rows = sortAndPage(target, (value as Row[]).filter((r) => matches(target, r, nested.where)), nested);
      return rows.map((r) => project(target, r, nested));
    }
    return value ? project(target, value as Row, nested) : null;
  };

  const sortAndPage = (model: ModelDef, rows: Row[], args: { orderBy?: any; take?: number; skip?: number }) => {
    let out = [...rows];
    const orderBy = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
    if (orderBy.length) {
      out.sort((a, b) => {
        for (const clause of orderBy) {
          const [key, direction] = Object.entries(clause)[0] as [string, any];
          const dir = (typeof direction === "string" ? direction : direction?.sort) === "desc" ? -1 : 1;
          const left = comparable(a[key]) as any;
          const right = comparable(b[key]) as any;
          if (left === right) continue;
          if (left === null || left === undefined) return 1;
          if (right === null || right === undefined) return -1;
          return left < right ? -dir : dir;
        }
        return 0;
      });
    }
    if (args.skip) out = out.slice(args.skip);
    if (typeof args.take === "number") out = args.take >= 0 ? out.slice(0, args.take) : out.slice(args.take);
    return out;
  };

  const applyData = (model: ModelDef, row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (model.relations[key]) {
        const relation = model.relations[key];
        if (isPlainObject(value) && value.connect && relation.kind === "one") {
          const target = models[relation.model];
          const other = table(target.name).find((r) => matches(target, r, value.connect));
          relation.localFields.forEach((local, index) => {
            row[local] = other ? other[relation.foreignFields[index]] : null;
          });
          continue;
        }
        if (isPlainObject(value) && value.disconnect && relation.kind === "one") {
          relation.localFields.forEach((local) => (row[local] = null));
          continue;
        }
        throw new Error(`inMemoryPrisma: nested write "${key}" on ${model.name} is not supported`);
      }
      if (isPlainObject(value) && ("increment" in value || "decrement" in value || "set" in value || "push" in value)) {
        if ("set" in value) row[key] = value.set;
        if ("increment" in value) row[key] = Number(row[key] || 0) + Number(value.increment);
        if ("decrement" in value) row[key] = Number(row[key] || 0) - Number(value.decrement);
        if ("push" in value) row[key] = [...(row[key] || []), ...(Array.isArray(value.push) ? value.push : [value.push])];
        continue;
      }
      row[key] = value;
    }
    for (const field of model.scalars) if (field.isUpdatedAt) row[field.name] = new Date();
  };

  const createRow = (model: ModelDef, data: Row): Row => {
    const row: Row = {};
    for (const field of model.scalars) {
      if (field.defaultValue) row[field.name] = field.defaultValue();
      else if (field.isList) row[field.name] = [];
      else row[field.name] = null;
      if (field.isUpdatedAt) row[field.name] = new Date();
    }
    applyData(model, row, data);
    table(model.name).push(row);
    return row;
  };

  const findOne = (model: ModelDef, where: any) => table(model.name).find((row) => matches(model, row, where)) || null;

  const delegate = (model: ModelDef) => ({
    findUnique: async (args: any) => {
      const row = findOne(model, args.where);
      return row ? project(model, row, args) : null;
    },
    findUniqueOrThrow: async (args: any) => {
      const row = findOne(model, args.where);
      if (!row) throw Object.assign(new Error(`${model.name} not found`), { code: "P2025" });
      return project(model, row, args);
    },
    findFirst: async (args: any = {}) => {
      const rows = sortAndPage(model, table(model.name).filter((row) => matches(model, row, args.where)), args);
      return rows[0] ? project(model, rows[0], args) : null;
    },
    findMany: async (args: any = {}) => {
      const rows = sortAndPage(model, table(model.name).filter((row) => matches(model, row, args.where)), args);
      return rows.map((row) => project(model, row, args));
    },
    count: async (args: any = {}) => table(model.name).filter((row) => matches(model, row, args.where)).length,
    create: async (args: any) => project(model, createRow(model, args.data), args),
    createMany: async (args: any) => {
      const list = Array.isArray(args.data) ? args.data : [args.data];
      list.forEach((data: Row) => createRow(model, data));
      return { count: list.length };
    },
    createManyAndReturn: async (args: any) => {
      const list = Array.isArray(args.data) ? args.data : [args.data];
      return list.map((data: Row) => project(model, createRow(model, data), args));
    },
    update: async (args: any) => {
      const row = findOne(model, args.where);
      if (!row) throw Object.assign(new Error(`${model.name} to update not found`), { code: "P2025" });
      applyData(model, row, args.data);
      return project(model, row, args);
    },
    updateMany: async (args: any) => {
      const rows = table(model.name).filter((row) => matches(model, row, args.where));
      rows.forEach((row) => applyData(model, row, args.data));
      return { count: rows.length };
    },
    upsert: async (args: any) => {
      const row = findOne(model, args.where);
      if (row) {
        applyData(model, row, args.update);
        return project(model, row, args);
      }
      return project(model, createRow(model, args.create), args);
    },
    delete: async (args: any) => {
      const rows = table(model.name);
      const index = rows.findIndex((row) => matches(model, row, args.where));
      if (index < 0) throw Object.assign(new Error(`${model.name} to delete not found`), { code: "P2025" });
      const [removed] = rows.splice(index, 1);
      return removed;
    },
    deleteMany: async (args: any = {}) => {
      const rows = table(model.name);
      const keep = rows.filter((row) => !matches(model, row, args.where));
      const count = rows.length - keep.length;
      tables[model.name] = keep;
      return { count };
    },
  });

  const delegates: Record<string, any> = {};
  const client: any = new Proxy(
    {
      $tables: tables,
      $reset: () => {
        for (const key of Object.keys(tables)) delete tables[key];
      },
      $transaction: async (input: any) => (typeof input === "function" ? input(client) : Promise.all(input)),
      $connect: async () => undefined,
      $disconnect: async () => undefined,
      $queryRaw: async () => [],
      $executeRaw: async () => 0,
      $queryRawUnsafe: async () => [],
      $executeRawUnsafe: async () => 0,
    },
    {
      get(target: any, prop: string | symbol) {
        if (typeof prop !== "string" || prop in target) return target[prop as any];
        const model = modelByDelegate[prop];
        if (!model) return undefined;
        return (delegates[prop] ||= delegate(model));
      },
    }
  );
  // Rows live in `tables` keyed by model name; expose them by delegate name too.
  Object.defineProperty(client, "$rows", {
    value: (delegateName: string) => table(modelByDelegate[delegateName].name),
  });
  return client;
};
