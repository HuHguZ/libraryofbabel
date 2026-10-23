import type { Locale } from "@/i18n/locales";
import { PLAYER_COLORS } from "@/lib/online/protocol";
const WORDS: Record<Locale, [string[], string[]]> = {
  ru: [["Тихий", "Седой", "Ночной", "Пыльный", "Бледный", "Усталый", "Зоркий", "Забытый"], ["читатель", "библиотекарь", "паломник", "переплётчик", "толкователь", "странник", "искатель", "хранитель", "писец", "путник"]],
  en: [["Quiet", "Grey", "Nocturnal", "Dusty", "Pale", "Wandering", "Silent", "Weary", "Keen", "Forgotten"], ["reader", "librarian", "pilgrim", "binder", "exegete", "wanderer", "seeker", "keeper", "scribe", "traveller"]],
};
const pick = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)];
export function randomNick(lang: Locale, random: () => number = Math.random): string { const [adjectives, nouns] = WORDS[lang]; return `${pick(adjectives, random)} ${pick(nouns, random)}`; }
export const randomColor = (random: () => number = Math.random): string => pick(PLAYER_COLORS, random);
