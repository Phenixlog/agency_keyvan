import assert from "node:assert/strict";
import { test } from "node:test";
import { BRAND_OS_SCHEMA, IMAGE_PROMPT_SCHEMA, RULES_SCHEMA } from "../brand-os/model.ts";
import { CAPTION_SCHEMA } from "../calendar/model.ts";

// Strict structured outputs reject a schema where an object allows extra keys or leaves a property optional.
function assertStrict(schema, path) {
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false, `${path}: additionalProperties doit être false`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${path}: toutes les propriétés doivent être requises`);
    for (const [key, child] of Object.entries(schema.properties)) assertStrict(child, `${path}.${key}`);
  }
  if (schema.type === "array") assertStrict(schema.items, `${path}[]`);
}

test("tous les schémas envoyés au LLM sont stricts", () => {
  const schemas = { BRAND_OS_SCHEMA, IMAGE_PROMPT_SCHEMA, RULES_SCHEMA, CAPTION_SCHEMA };
  for (const [name, schema] of Object.entries(schemas)) assertStrict(schema, name);
});

