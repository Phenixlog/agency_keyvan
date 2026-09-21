import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { LlmError, chatJson, extractJson, isLlmConfigured } from "./openrouter.ts";

const realFetch = globalThis.fetch;
const ARGS = {
  model: "test/model",
  system: "s",
  user: "u",
  schemaName: "t",
  schema: { type: "object" },
};

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.OPENROUTER_API_KEY;
});

test("sans clé : non configuré, et aucun appel réseau", async () => {
  const calls = mockFetch(() => new Response("{}"));
  assert.equal(isLlmConfigured(), false);
  await assert.rejects(chatJson(ARGS), LlmError);
  assert.equal(calls.length, 0);
});

test("envoie un schéma JSON strict et parse la réponse", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  const calls = mockFetch(() =>
    Response.json({ choices: [{ message: { content: '{"ok":true}' } }] })
  );
  assert.deepEqual(await chatJson(ARGS), { ok: true });

  const { url, init } = calls[0];
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(init.headers.Authorization, "Bearer test-key");
  const body = JSON.parse(init.body);
  assert.equal(body.model, "test/model");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  // Reasoning models think inside max_tokens: the request must leave headroom above the caller's budget.
  assert.ok(body.max_tokens >= 2000 + 2000, `max_tokens=${body.max_tokens}`);
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.deepEqual(body.messages.map((m) => m.role), ["system", "user"]);
});

test("accepte un JSON entouré d'une balise markdown", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  mockFetch(() =>
    Response.json({ choices: [{ message: { content: '```json\n{"a":1}\n```' } }] })
  );
  assert.deepEqual(await chatJson(ARGS), { a: 1 });
  assert.equal(extractJson('  {"b":2} '), '{"b":2}');
  assert.equal(extractJson('Voici le résultat : {"c":{"d":3}} — terminé.'), '{"c":{"d":3}}');
  assert.equal(extractJson("pas de json"), "pas de json");
});

test("erreurs HTTP, erreurs applicatives et réponses invalides → LlmError", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  mockFetch(() => new Response("quota", { status: 402 }));
  await assert.rejects(chatJson(ARGS), /OpenRouter 402: quota/);

  mockFetch(() => Response.json({ error: { message: "model not found" } }));
  await assert.rejects(chatJson(ARGS), /model not found/);

  mockFetch(() => Response.json({ choices: [{ message: { content: "pas du json" } }] }));
  await assert.rejects(chatJson(ARGS), /non JSON/);

  mockFetch(() => Response.json({ choices: [] }));
  await assert.rejects(chatJson(ARGS), /Réponse vide/);

  // What a reasoning model returns when thinking used the whole budget: empty content, finish "length".
  mockFetch(() => Response.json({ choices: [{ finish_reason: "length", message: { content: "" } }] }));
  await assert.rejects(chatJson(ARGS), /tronquée/);
});

test("une réponse malformée est retentée une fois, pas une erreur HTTP", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  let n = 0;
  let calls = mockFetch(() => Response.json({ choices: [{ message: { content: ++n === 1 ? "oups" : '{"ok":1}' } }] }));
  assert.deepEqual(await chatJson(ARGS), { ok: 1 });
  assert.equal(calls.length, 2);

  calls = mockFetch(() => Response.json({ choices: [{ message: { content: "toujours pas" } }] }));
  await assert.rejects(chatJson(ARGS), /non JSON/);
  assert.equal(calls.length, 2);

  calls = mockFetch(() => new Response("quota", { status: 402 }));
  await assert.rejects(chatJson(ARGS), /402/);
  assert.equal(calls.length, 1);
});
