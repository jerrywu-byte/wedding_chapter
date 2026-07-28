import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const visits = sqliteTable("visits", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  weddingDate: text("wedding_date"),
  dateUndecided: integer("date_undecided", { mode: "boolean" }).notNull().default(false),
  session: text("session").notNull(),
  tables: integer("tables").notNull(),
  personality: text("personality").notNull(),
  answersJson: text("answers_json").notNull(),
  scoresJson: text("scores_json").notNull(),
  createdAt: text("created_at").notNull(),
});
