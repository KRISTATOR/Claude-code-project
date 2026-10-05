import { parseNumber } from '../format';
import { fold } from '../text';
import type { CsvTable } from './csv';

/**
 * Post-game survey import (the retrospective). Columns that identify people,
 * and the Google Forms timestamp, are left out unless the organizer keeps them.
 */
const IDENTIFYING =
  /(jmeno|prijmeni|e-?mail|telefon|mobil|adres|casova znacka|timestamp|\bname\b|phone)/;

export function identifyingColumns(headers: readonly string[]): number[] {
  return headers.flatMap((header, index) => (IDENTIFYING.test(fold(header)) ? [index] : []));
}

/** The kept columns as questions, and each response as the kept answers. */
export function surveyData(
  table: CsvTable,
  keep: readonly number[],
): { questions: string[]; responses: string[][] } {
  const columns = [...keep].sort((a, b) => a - b);
  return {
    questions: columns.map((index) => table.headers[index] ?? ''),
    responses: table.rows
      .map((row) => columns.map((index) => row[index] ?? ''))
      .filter((answers) => answers.some((answer) => answer.trim() !== '')),
  };
}

export type QuestionSummary =
  | { type: 'scale'; count: number; average: number; min: number; max: number }
  | { type: 'choice'; count: number; options: { value: string; count: number }[] }
  | { type: 'text'; count: number; answers: string[] };

/**
 * How to show one question: numbers as a scale with an average, a handful of
 * repeated answers as counts, anything else as the list of answers.
 */
export function summarizeQuestion(values: readonly string[]): QuestionSummary {
  const answers = values.map((value) => value.trim()).filter(Boolean);
  const numbers = answers.map((value) => parseNumber(value));
  if (answers.length > 0 && numbers.every((value) => value !== null)) {
    const list = numbers;
    const sum = list.reduce((total, value) => total + value, 0);
    return {
      type: 'scale',
      count: list.length,
      average: Math.round((sum / list.length) * 100) / 100,
      min: Math.min(...list),
      max: Math.max(...list),
    };
  }
  const counts = new Map<string, number>();
  for (const answer of answers) counts.set(answer, (counts.get(answer) ?? 0) + 1);
  if (answers.length >= 3 && counts.size <= 8 && counts.size <= answers.length / 2) {
    return {
      type: 'choice',
      count: answers.length,
      options: [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
  return { type: 'text', count: answers.length, answers };
}
