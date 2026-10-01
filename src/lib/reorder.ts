import type { Rule } from "./generate";
export function reorderRules(
  rules: Rule[],
  movedId: number,
  targetId: number,
  after = false,
): Rule[] {
  if (
    movedId === targetId ||
    !rules.some((r) => r.id === movedId) ||
    !rules.some((r) => r.id === targetId)
  )
    return rules;
  const moved = rules.find((r) => r.id === movedId)!;
  const result = rules.filter((r) => r.id !== movedId);
  result.splice(
    result.findIndex((r) => r.id === targetId) + (after ? 1 : 0),
    0,
    moved,
  );
  return result;
}
