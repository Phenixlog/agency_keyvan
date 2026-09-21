import assert from "node:assert/strict";
import { test } from "node:test";
import { BRAND_OS_SCHEMA, IMAGE_PROMPT_SCHEMA, RULES_SCHEMA } from "../brand-os/model.ts";
import { CAPTION_SCHEMA } from "../calendar/model.ts";
import { PLAYBOOKS_SCHEMA, isPlaybooks, playbooksUserMessage } from "../playbooks/model.ts";

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
  const schemas = { BRAND_OS_SCHEMA, IMAGE_PROMPT_SCHEMA, RULES_SCHEMA, CAPTION_SCHEMA, PLAYBOOKS_SCHEMA };
  for (const [name, schema] of Object.entries(schemas)) assertStrict(schema, name);
});

test("le schéma des playbooks décrit bien les trois guides", () => {
  assert.deepEqual(Object.keys(PLAYBOOKS_SCHEMA.properties), ["editorial", "voice", "visual"]);
  assert.deepEqual(PLAYBOOKS_SCHEMA.properties.visual.properties.shots.items.required, ["title", "brief"]);
});

test("isPlaybooks tolère un contenu stocké incomplet", () => {
  assert.equal(isPlaybooks(null), false);
  assert.equal(isPlaybooks({ editorial: { pillars: [] } }), false);
  assert.equal(
    isPlaybooks({ editorial: { pillars: [], rhythm: "" }, voice: { principles: [], captions: [] }, visual: { shots: [] } }),
    true
  );
});

test("le message des playbooks donne la priorité au résumé et rend les règles impératives", () => {
  const message = playbooksUserMessage({ name: "Atelier Lune", summary: "Ton : espiègle", canon: { tone: ["calme"] }, rules: ["pas de fleurs"] });
  assert.match(message, /^Marque : Atelier Lune/);
  assert.match(message, /prioritaire/);
  assert.match(message, /impératives\) :\n- pas de fleurs/);
  assert.doesNotMatch(playbooksUserMessage({ name: "X", summary: "s", canon: null, rules: [] }), /Règles apprises|Brand OS structuré/);
});
