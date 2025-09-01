import {
  type AnyColumn,
  and,
  between,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";
import { categoriesTable } from "@/db/schema";

// Types for filter operations
export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "in"
  | "notIn"
  | "between"
  | "isNull"
  | "isNotNull";

export type FilterCondition<T = unknown> = {
  column: AnyColumn;
  operator: FilterOperator;
  value?: T | T[];
  caseSensitive?: boolean;
};

export type WhereClauseOptions = {
  combineWith?: "and" | "or";
  conditions?: FilterCondition[];
};

// Base utility class for building where clauses
export class WhereClauseBuilder {
  private conditions: SQL[] = [];
  private readonly combineOperator: "and" | "or" = "and";

  constructor(combineWith: "and" | "or" = "and") {
    this.combineOperator = combineWith;
  }

  // Add a single condition
  addCondition<T>(
    column: AnyColumn,
    operator: FilterOperator,
    value?: T | T[]
  ): this {
    const condition = this.buildCondition({ column, operator, value });
    if (condition) {
      this.conditions.push(condition);
    }
    return this;
  }

  // Add multiple conditions
  addConditions(conditions: FilterCondition[]): this {
    for (const condition of conditions) {
      const builtCondition = this.buildCondition(condition);
      if (builtCondition) {
        this.conditions.push(builtCondition);
      }
    }
    return this;
  }

  // Add raw SQL condition
  addRawCondition(condition: SQL): this {
    this.conditions.push(condition);
    return this;
  }

  // Build the final where clause
  build(): SQL | undefined {
    if (this.conditions.length === 0) {
      return;
    }
    if (this.conditions.length === 1) {
      return this.conditions[0];
    }

    return this.combineOperator === "and"
      ? and(...this.conditions)
      : or(...this.conditions);
  }

  // Reset builder
  reset(): this {
    this.conditions = [];
    return this;
  }

  // Get conditions count
  getConditionsCount(): number {
    return this.conditions.length;
  }

  private buildCondition(condition: FilterCondition): SQL | null {
    const { column, operator, value } = condition;

    switch (operator) {
      case "eq":
        return value !== undefined ? eq(column, value) : null;

      case "ne":
        return value !== undefined ? ne(column, value) : null;

      case "gt":
        return value !== undefined ? gt(column, value) : null;

      case "gte":
        return value !== undefined ? gte(column, value) : null;

      case "lt":
        return value !== undefined ? lt(column, value) : null;

      case "lte":
        return value !== undefined ? lte(column, value) : null;

      case "like":
        return value !== undefined ? like(column, `%${value}%`) : null;

      case "ilike":
        return value !== undefined ? ilike(column, `%${value}%`) : null;

      case "in":
        return Array.isArray(value) && value.length > 0
          ? inArray(column, value)
          : null;

      case "notIn":
        return Array.isArray(value) && value.length > 0
          ? notInArray(column, value)
          : null;

      case "between":
        return Array.isArray(value) && value.length === 2
          ? between(column, value[0], value[1])
          : null;

      case "isNull":
        return isNull(column);

      case "isNotNull":
        return isNotNull(column);

      default:
        return null;
    }
  }
}

// Specialized builders for common use cases
export class CategoryWhereBuilder extends WhereClauseBuilder {
  constructor(combineWith?: "and" | "or") {
    super(combineWith ?? "and");
  }

  private readonly table = categoriesTable;

  isActive(value?: boolean): this {
    if (value !== undefined) {
      this.addCondition(this.table.is_active, "eq", value);
    }
    return this;
  }

  withIds(ids?: number[]): this {
    if (ids !== undefined && ids.length > 0) {
      this.addCondition(this.table.id, "in", ids);
    }
    return this;
  }
}
