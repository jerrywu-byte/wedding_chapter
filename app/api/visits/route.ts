import { getDb } from "../../../db";
import { visits } from "../../../db/schema";

const validAxes = new Set(["story", "spectacle", "grandeur", "nature"]);

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const name = String(payload.name ?? "").trim();
    const phone = String(payload.phone ?? "").trim();
    const session = String(payload.session ?? "").trim();
    const tables = Number(payload.tables ?? 0);
    const personality = String(payload.personality ?? "");
    const answers = Array.isArray(payload.answers) ? payload.answers.map(String) : [];

    if (!name || !phone || !session || !Number.isInteger(tables) || tables < 1 || !validAxes.has(personality) || answers.length !== 7 || answers.some((answer) => !validAxes.has(answer))) {
      return Response.json({ error: "invalid visit payload" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await getDb().insert(visits).values({
      id,
      name,
      phone,
      weddingDate: payload.dateUndecided ? null : String(payload.weddingDate ?? "") || null,
      dateUndecided: Boolean(payload.dateUndecided),
      session,
      tables,
      personality,
      answersJson: JSON.stringify(answers),
      scoresJson: JSON.stringify(payload.scores ?? {}),
      createdAt,
    });

    return Response.json({ id, createdAt }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "save failed" }, { status: 500 });
  }
}
