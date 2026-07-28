import quizJson from "../data/wedding-quiz.json";
import type {
  HiddenPersonalityId,
  MainPersonalityId,
  WeddingQuizData,
  WeddingQuizQuestion,
} from "../types/wedding-quiz";

export const QUIZ_VERSION = "five-story-v1";

export const MAIN_PERSONALITY_IDS: MainPersonalityId[] = [
  "moonlight-poet",
  "starlight-star",
  "forest-collector",
  "royal-curator",
  "urban-dreamer",
  "gentle-gatherer",
];

export const HIDDEN_PERSONALITY_IDS: HiddenPersonalityId[] = [
  "ceremony-dreamer",
  "celebration-director",
];

const quizData = quizJson as WeddingQuizData;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateScoreMap(
  value: unknown,
  allowedIds: readonly string[],
  prefix: string,
  errors: string[],
) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${prefix} 必須是物件`);
    return;
  }
  for (const [id, score] of Object.entries(value)) {
    if (!allowedIds.includes(id)) errors.push(`${prefix} 包含未知人格 ${id}`);
    if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > 2) {
      errors.push(`${prefix}.${id} 必須是 0 至 2 的整數`);
    }
  }
}

export function validateQuizData(data: unknown = quizJson): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) return ["題庫資料最外層必須是物件"];
  const root = data as Record<string, unknown>;
  if (root.version !== QUIZ_VERSION) errors.push(`version 必須是 ${QUIZ_VERSION}`);
  if (!Array.isArray(root.questions)) return [...errors, "questions 必須是陣列"];

  const questionIds = new Set<string>();
  const orders = new Set<number>();
  root.questions.forEach((value, questionIndex) => {
    const prefix = `questions[${questionIndex}]`;
    if (typeof value !== "object" || value === null) {
      errors.push(`${prefix} 必須是物件`);
      return;
    }
    const question = value as Record<string, unknown>;
    if (!isNonEmptyString(question.id)) errors.push(`${prefix}.id 無效`);
    else if (questionIds.has(question.id)) errors.push(`${prefix}.id 重複：${question.id}`);
    else questionIds.add(question.id);
    if (!Number.isInteger(question.order) || (question.order as number) <= 0) {
      errors.push(`${prefix}.order 必須是正整數`);
    } else if (orders.has(question.order as number)) {
      errors.push(`${prefix}.order 重複：${String(question.order)}`);
    } else orders.add(question.order as number);
    if (!isNonEmptyString(question.title)) errors.push(`${prefix}.title 無效`);
    if (question.selectionType !== "single") errors.push(`${prefix}.selectionType 必須是 single`);
    if (question.status !== "active" && question.status !== "inactive") {
      errors.push(`${prefix}.status 必須是 active 或 inactive`);
    }
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      errors.push(`${prefix}.options 必須固定為 4 個選項`);
      return;
    }

    const optionIds = new Set<string>();
    question.options.forEach((optionValue, optionIndex) => {
      const optionPrefix = `${prefix}.options[${optionIndex}]`;
      if (typeof optionValue !== "object" || optionValue === null) {
        errors.push(`${optionPrefix} 必須是物件`);
        return;
      }
      const option = optionValue as Record<string, unknown>;
      if (option.questionId !== question.id) errors.push(`${optionPrefix}.questionId 必須等於題目 id`);
      if (!isNonEmptyString(option.optionId)) errors.push(`${optionPrefix}.optionId 無效`);
      else if (optionIds.has(option.optionId)) errors.push(`${optionPrefix}.optionId 重複：${option.optionId}`);
      else optionIds.add(option.optionId);
      if (!isNonEmptyString(option.text)) errors.push(`${optionPrefix}.text 無效`);
      validateScoreMap(option.personalityScores, MAIN_PERSONALITY_IDS, `${optionPrefix}.personalityScores`, errors);
      validateScoreMap(option.hiddenPersonalityScores, HIDDEN_PERSONALITY_IDS, `${optionPrefix}.hiddenPersonalityScores`, errors);
      if (!Array.isArray(option.traits) || !option.traits.every(isNonEmptyString)) {
        errors.push(`${optionPrefix}.traits 必須是字串陣列`);
      }
      if (!Array.isArray(option.experienceTags) || !option.experienceTags.every(isNonEmptyString)) {
        errors.push(`${optionPrefix}.experienceTags 必須是字串陣列`);
      }
    });
  });

  const activeQuestions = root.questions.filter(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).status === "active",
  );
  if (activeQuestions.length !== 5) {
    errors.push(`active 題目必須為 5 題，目前為 ${activeQuestions.length} 題`);
  }
  return errors;
}

const validationErrors = validateQuizData();
if (validationErrors.length) {
  throw new Error(`婚禮人格題庫驗證失敗：\n${validationErrors.join("\n")}`);
}

export function getAllQuizQuestions(): WeddingQuizQuestion[] {
  return [...quizData.questions].sort((a, b) => a.order - b.order);
}

export function getActiveQuizQuestions(): WeddingQuizQuestion[] {
  return getAllQuizQuestions().filter((question) => question.status === "active");
}

export function getQuizQuestionById(id: string): WeddingQuizQuestion | null {
  return quizData.questions.find((question) => question.id === id) ?? null;
}
