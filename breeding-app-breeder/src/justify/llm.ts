import { Animal, Outcome, Demand, Goal } from "../types/pairing";

export const RATIONALE_SCHEMA = {
  type: "object",
  properties: {
    why_good: { type: "string" },
    watchouts: {
      type: "array",
      items: { type: "string" },
    },
    sources: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["why_good", "watchouts", "sources"],
} as const;

type Rationale = {
  why_good: string;
  watchouts: string[];
  sources: string[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const validateArrayOfStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of strings");
  }
  value.forEach((entry) => {
    if (typeof entry !== "string") {
      throw new Error("Expected all array items to be strings");
    }
  });
  return value;
};

export const validateJson = <T>(raw: string, schema: Record<string, unknown>): T => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("Response was not valid JSON");
  }

  if (!isPlainObject(schema)) {
    throw new Error("Schema must be an object");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Parsed JSON is not an object");
  }

  if (Array.isArray(schema.required)) {
    schema.required.forEach((key) => {
      if (!(key in parsed)) {
        throw new Error(`Missing required property: ${key}`);
      }
    });
  }

  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  Object.entries(properties).forEach(([key, definition]) => {
    const value = parsed[key];
    if (!isPlainObject(definition)) return;
    const expectedType = definition.type;
    if (expectedType === "string" && typeof value !== "string") {
      throw new Error(`Expected property '${key}' to be a string`);
    }
    if (expectedType === "array") {
      validateArrayOfStrings(value);
    }
  });

  return parsed as T;
};

const callLLM = async (_payload: unknown): Promise<string> => {
  throw new Error("No LLM provider configured for justification");
};

export const justify = async (input: {
  a: Animal;
  b: Animal;
  outcomes: Outcome[];
  demand: Demand;
  risks: string[];
  goals: Goal[];
}): Promise<Rationale> => {
  const prompt = {
    schema: RATIONALE_SCHEMA,
    data: input,
  };
  const response = await callLLM(prompt);
  return validateJson<Rationale>(response, RATIONALE_SCHEMA);
};
