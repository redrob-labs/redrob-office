import { describe, expect, it } from "vitest";

import {
  FieldFillGrammarCache,
  grammarCacheKey,
  hashDocument,
} from "./inference/grammar-cache.js";
import type { FillableField } from "./field-fill-grammar.js";

describe("grammarCacheKey", () => {
  const docHash = hashDocument("hello doc");

  it("keys static score enums by type+bounds+enum, not path", () => {
    const a: FillableField = {
      path: "/A/score",
      type: "integer",
      required: false,
      enumValues: [1, 2, 3, 4, 5],
    };
    const b: FillableField = {
      path: "/B/score",
      type: "integer",
      required: false,
      enumValues: [1, 2, 3, 4, 5],
    };
    expect(grammarCacheKey(a, docHash)).toBe(grammarCacheKey(b, docHash));
    expect(grammarCacheKey(a, docHash)).toMatch(/^static\|/);
  });

  it("separates dynamic quote grammars by choices + document hash", () => {
    const q1: FillableField = {
      path: "/A/quote",
      type: "string",
      required: false,
      stringChoices: ["foo", "bar"],
    };
    const q2: FillableField = {
      path: "/B/quote",
      type: "string",
      required: false,
      stringChoices: ["foo", "bar"],
    };
    const q3: FillableField = {
      path: "/C/quote",
      type: "string",
      required: false,
      stringChoices: ["other"],
    };
    expect(grammarCacheKey(q1, docHash)).toBe(grammarCacheKey(q2, docHash));
    expect(grammarCacheKey(q1, docHash)).not.toBe(grammarCacheKey(q3, docHash));
    expect(grammarCacheKey(q1, docHash)).not.toBe(
      grammarCacheKey(q1, hashDocument("other doc")),
    );
    expect(grammarCacheKey(q1, docHash)).toMatch(/^dyn\|/);
  });
});

describe("FieldFillGrammarCache", () => {
  it("reuses compiled grammar for same static key", async () => {
    const cache = new FieldFillGrammarCache("doc");
    let creates = 0;
    const create = async () => {
      creates += 1;
      return { id: creates };
    };
    const field: FillableField = {
      path: "/x",
      type: "integer",
      required: false,
      enumValues: [1, 2, 3],
    };
    const a = await cache.getOrCreate(field, create);
    const b = await cache.getOrCreate({ ...field, path: "/y" }, create);
    expect(a).toBe(b);
    expect(creates).toBe(1);
    expect(cache.stats).toEqual({ hits: 1, misses: 1, size: 1 });
  });

  it("precompileAll throws when createGrammar fails", async () => {
    const cache = new FieldFillGrammarCache("doc");
    await expect(
      cache.precompileAll(
        [{ path: "/phone", type: "string", required: false, semanticType: "phone" }],
        async () => {
          throw new Error("unknown escape at \\-()");
        },
      ),
    ).rejects.toThrow(/grammar compile failed for \/phone/);
  });
});
