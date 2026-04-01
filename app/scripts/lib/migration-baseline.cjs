const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getLatestJournalEntry(drizzleDir) {
  const journalPath = resolve(drizzleDir, "meta", "_journal.json");
  const journal = readJson(journalPath);
  const latestEntry = journal.entries?.[journal.entries.length - 1];

  if (!latestEntry) {
    throw new Error(`No migration entries found in ${journalPath}`);
  }

  return latestEntry;
}

function buildExpectedSchema(snapshot) {
  const tables = {};
  const enums = {};

  for (const [tableKey, table] of Object.entries(snapshot.tables ?? {})) {
    const columns = {};
    const primaryKey = [];

    for (const [columnKey, column] of Object.entries(table.columns ?? {})) {
      columns[columnKey] = {
        type: column.type,
        notNull: Boolean(column.notNull),
        primaryKey: Boolean(column.primaryKey),
      };

      if (column.primaryKey) {
        primaryKey.push(column.name);
      }
    }

    tables[tableKey] = {
      schema: table.schema,
      name: table.name,
      columns,
      primaryKey: primaryKey.sort(),
      uniqueConstraints: Object.fromEntries(
        Object.entries(table.uniqueConstraints ?? {}).map(([name, constraint]) => [
          name,
          {
            columns: [...(constraint.columns ?? [])].sort(),
          },
        ])
      ),
      foreignKeys: Object.fromEntries(
        Object.entries(table.foreignKeys ?? {}).map(([name, constraint]) => [
          name,
          {
            columnsFrom: [...(constraint.columnsFrom ?? [])].sort(),
            tableTo:
              constraint.schemaTo && constraint.schemaTo !== "public"
                ? `${constraint.schemaTo}.${constraint.tableTo}`
                : `public.${constraint.tableTo}`,
            columnsTo: [...(constraint.columnsTo ?? [])].sort(),
            onDelete: (constraint.onDelete ?? "").toLowerCase(),
            onUpdate: (constraint.onUpdate ?? "").toLowerCase(),
          },
        ])
      ),
    };
  }

  for (const [enumKey, enumValue] of Object.entries(snapshot.enums ?? {})) {
    enums[enumKey] = {
      schema: enumValue.schema,
      name: enumValue.name,
      values: [...(enumValue.values ?? [])],
    };
  }

  return { tables, enums };
}

function normalizeActualColumnType(column) {
  if (column.data_type === "USER-DEFINED") {
    return column.udt_name;
  }

  if (
    column.data_type === "timestamp without time zone" ||
    column.data_type === "timestamp with time zone"
  ) {
    return "timestamp";
  }

  if (column.data_type === "integer" || column.udt_name === "int4") {
    return "integer";
  }

  if (column.data_type === "boolean" || column.udt_name === "bool") {
    return "boolean";
  }

  if (column.data_type === "jsonb" || column.udt_name === "jsonb") {
    return "jsonb";
  }

  if (column.data_type === "text" || column.udt_name === "text") {
    return "text";
  }

  return column.udt_name ?? column.data_type;
}

function normalizeArrayValue(value) {
  if (Array.isArray(value)) {
    return [...value].filter(Boolean).sort();
  }

  if (typeof value === "string") {
    if (value.startsWith("{") && value.endsWith("}")) {
      const inner = value.slice(1, -1).trim();
      if (!inner) {
        return [];
      }

      return inner
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .sort();
    }

    return [value].sort();
  }

  return [];
}

function buildActualSchema({ tables = [], columns = [], enums = [], constraints = [] }) {
  const actual = {
    tables: {},
    enums: {},
  };

  for (const table of tables) {
    const key = `${table.table_schema}.${table.table_name}`;
    actual.tables[key] = {
      schema: table.table_schema,
      name: table.table_name,
      columns: {},
      primaryKey: [],
      uniqueConstraints: {},
      foreignKeys: {},
    };
  }

  for (const column of columns) {
    const tableKey = `${column.table_schema}.${column.table_name}`;
    const table = actual.tables[tableKey];

    if (!table) {
      continue;
    }

    table.columns[column.column_name] = {
      type: normalizeActualColumnType(column),
      notNull: column.is_nullable === "NO",
      primaryKey: false,
    };
  }

  for (const enumValue of enums) {
    const enumKey = `${enumValue.enum_schema}.${enumValue.enum_name}`;
    if (!actual.enums[enumKey]) {
      actual.enums[enumKey] = {
        schema: enumValue.enum_schema,
        name: enumValue.enum_name,
        values: [],
      };
    }

    actual.enums[enumKey].values.push(enumValue.enum_value);
  }

  for (const constraint of constraints) {
    const tableKey = `${constraint.table_schema}.${constraint.table_name}`;
    const table = actual.tables[tableKey];

    if (!table) {
      continue;
    }

    const columnsList = normalizeArrayValue(constraint.columns);

    if (constraint.constraint_type === "PRIMARY KEY") {
      table.primaryKey = columnsList;

      for (const columnName of columnsList) {
        if (table.columns[columnName]) {
          table.columns[columnName].primaryKey = true;
        }
      }

      continue;
    }

    if (constraint.constraint_type === "UNIQUE") {
      table.uniqueConstraints[constraint.constraint_name] = {
        columns: columnsList,
      };
      continue;
    }

    if (constraint.constraint_type === "FOREIGN KEY") {
      table.foreignKeys[constraint.constraint_name] = {
        columnsFrom: columnsList,
        tableTo: `${constraint.foreign_table_schema}.${constraint.foreign_table_name}`,
        columnsTo: normalizeArrayValue(constraint.foreign_columns),
        onDelete: (constraint.on_delete ?? "").toLowerCase(),
        onUpdate: (constraint.on_update ?? "").toLowerCase(),
      };
    }
  }

  return actual;
}

function formatList(value) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function compareSchemaBaseline(expected, actual) {
  const issues = [];

  for (const [tableKey, expectedTable] of Object.entries(expected.tables)) {
    const actualTable = actual.tables[tableKey];
    if (!actualTable) {
      issues.push(`Missing table ${tableKey}`);
      continue;
    }

    for (const [columnName, expectedColumn] of Object.entries(expectedTable.columns)) {
      const actualColumn = actualTable.columns[columnName];
      if (!actualColumn) {
        issues.push(`Missing column ${tableKey}.${columnName}`);
        continue;
      }

      if (actualColumn.type !== expectedColumn.type) {
        issues.push(
          `Type mismatch for ${tableKey}.${columnName}: expected ${expectedColumn.type}, found ${actualColumn.type}`
        );
      }

      if (actualColumn.notNull !== expectedColumn.notNull) {
        issues.push(
          `Nullability mismatch for ${tableKey}.${columnName}: expected ${expectedColumn.notNull ? "NOT NULL" : "NULLABLE"}, found ${actualColumn.notNull ? "NOT NULL" : "NULLABLE"}`
        );
      }
    }

    if (formatList(actualTable.primaryKey) !== formatList(expectedTable.primaryKey)) {
      issues.push(
        `Primary key mismatch for ${tableKey}: expected [${formatList(expectedTable.primaryKey)}], found [${formatList(actualTable.primaryKey)}]`
      );
    }

    for (const [constraintName, expectedConstraint] of Object.entries(
      expectedTable.uniqueConstraints
    )) {
      const actualConstraint = actualTable.uniqueConstraints[constraintName];
      if (!actualConstraint) {
        issues.push(`Missing unique constraint ${constraintName} on ${tableKey}`);
        continue;
      }

      if (formatList(actualConstraint.columns) !== formatList(expectedConstraint.columns)) {
        issues.push(
          `Unique constraint mismatch for ${constraintName} on ${tableKey}: expected [${formatList(expectedConstraint.columns)}], found [${formatList(actualConstraint.columns)}]`
        );
      }
    }

    for (const [constraintName, expectedConstraint] of Object.entries(
      expectedTable.foreignKeys
    )) {
      const actualConstraint = actualTable.foreignKeys[constraintName];
      if (!actualConstraint) {
        issues.push(`Missing foreign key ${constraintName} on ${tableKey}`);
        continue;
      }

      if (
        formatList(actualConstraint.columnsFrom) !== formatList(expectedConstraint.columnsFrom) ||
        formatList(actualConstraint.columnsTo) !== formatList(expectedConstraint.columnsTo) ||
        actualConstraint.tableTo !== expectedConstraint.tableTo ||
        actualConstraint.onDelete !== expectedConstraint.onDelete ||
        actualConstraint.onUpdate !== expectedConstraint.onUpdate
      ) {
        issues.push(
          `Foreign key mismatch for ${constraintName} on ${tableKey}: expected ${JSON.stringify(
            expectedConstraint
          )}, found ${JSON.stringify(actualConstraint)}`
        );
      }
    }
  }

  for (const [enumKey, expectedEnum] of Object.entries(expected.enums)) {
    const actualEnum = actual.enums[enumKey];
    if (!actualEnum) {
      issues.push(`Missing enum ${enumKey}`);
      continue;
    }

    if (formatList(actualEnum.values) !== formatList(expectedEnum.values)) {
      issues.push(
        `Enum mismatch for ${enumKey}: expected [${formatList(expectedEnum.values)}], found [${formatList(actualEnum.values)}]`
      );
    }
  }

  return issues;
}

function loadLatestBaseline(drizzleDir) {
  const latestEntry = getLatestJournalEntry(drizzleDir);
  const sqlPath = resolve(drizzleDir, `${latestEntry.tag}.sql`);
  const snapshotPrefix = latestEntry.tag.split("_")[0];
  const snapshotPath = resolve(drizzleDir, "meta", `${snapshotPrefix}_snapshot.json`);

  if (!existsSync(sqlPath)) {
    throw new Error(`Missing migration SQL file: ${sqlPath}`);
  }

  if (!existsSync(snapshotPath)) {
    throw new Error(`Missing migration snapshot file: ${snapshotPath}`);
  }

  const sql = readFileSync(sqlPath, "utf8");
  const snapshot = readJson(snapshotPath);

  return {
    tag: latestEntry.tag,
    createdAt: latestEntry.when,
    hash: createHash("sha256").update(sql).digest("hex"),
    expected: buildExpectedSchema(snapshot),
  };
}

module.exports = {
  buildActualSchema,
  buildExpectedSchema,
  compareSchemaBaseline,
  loadLatestBaseline,
  normalizeArrayValue,
  normalizeActualColumnType,
};
