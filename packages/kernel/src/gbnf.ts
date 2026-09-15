export interface SchemaField {
  path: string;
  type: "string" | "integer" | "number" | "boolean";
  required: boolean;
}

function fieldName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 1) {
    throw new Error(`GBNF Phase 1 supports top-level field paths only: ${path}`);
  }
  return segments[0]!.replaceAll("~1", "/").replaceAll("~0", "~");
}

function grammarQuoted(value: string): string {
  return JSON.stringify(value).replaceAll("\\", "\\\\");
}

function property(field: SchemaField): string {
  return `${grammarQuoted(fieldName(field.path))} ws ":" ws ${field.type}`;
}

function optionalSubsets<T>(values: readonly T[]): T[][] {
  return values.reduce<T[][]>(
    (subsets, value) => [...subsets, ...subsets.map((subset) => [...subset, value])],
    [[]],
  );
}

/** Creates a deterministic JSON-object grammar for a flat schema. */
export function schemaFieldsToGbnf(fields: readonly SchemaField[]): string {
  const names = fields.map((field) => fieldName(field.path));
  if (new Set(names).size !== names.length) {
    throw new Error("Schema field paths must be unique");
  }

  const required = fields.filter((field) => field.required);
  const optional = fields.filter((field) => !field.required);
  const alternatives = optionalSubsets(optional).map((selection) => {
    const properties = [...required, ...selection].map(property);
    return properties.length === 0 ? '""' : properties.join(' ws "," ws ');
  });

  return [
    `root ::= ws "{" ws (${alternatives.join(" | ")}) ws "}" ws`,
    'ws ::= [ \\t\\n\\r]*',
    'string ::= "\\"" char* "\\""',
    'char ::= [^"\\\\] | "\\\\" (["\\\\/bfnrt] | "u" hex hex hex hex)',
    'hex ::= [0-9a-fA-F]',
    'integer ::= "-"? [0-9]+',
    'number ::= integer ("." [0-9]+)? ([eE] [+-]? [0-9]+)?',
    'boolean ::= "true" | "false"',
  ].join("\n");
}
