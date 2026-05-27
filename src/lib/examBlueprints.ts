export interface BlueprintQuestion {
  id: string;
  categoryId?: string;
  difficulty?: string;
}

export interface ExamBlueprintLike {
  questionCount?: number;
  categoryDistribution?: Record<string, number>;
  sectionDistribution?: Record<string, number>;
  difficultyMix?: Record<string, number>;
}

export const shuffleItems = <T,>(items: T[]) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

export function getDistributionTargets(distribution: Record<string, number> | undefined, count: number) {
  const entries = Object.entries(distribution || {})
    .map(([key, value]) => [key, Math.max(0, Number(value) || 0)] as const)
    .filter(([, value]) => value > 0);

  if (entries.length === 0 || count <= 0) return [] as { key: string; count: number }[];

  const totalWeight = entries.reduce((sum, [, value]) => sum + value, 0);
  const rows = entries.map(([key, value]) => {
    const exact = (value / totalWeight) * count;
    return {
      key,
      count: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });

  let assigned = rows.reduce((sum, row) => sum + row.count, 0);
  const byRemainder = [...rows].sort((a, b) => b.remainder - a.remainder);
  for (const row of byRemainder) {
    if (assigned >= count) break;
    row.count += 1;
    assigned += 1;
  }

  return rows.filter((row) => row.count > 0).map(({ key, count: target }) => ({ key, count: target }));
}

function takeWithDifficultyMix<T extends BlueprintQuestion>(
  pool: T[],
  targetCount: number,
  difficultyMix: Record<string, number> | undefined,
) {
  if (!difficultyMix || Object.keys(difficultyMix).length === 0) {
    return shuffleItems(pool).slice(0, targetCount);
  }

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const targets = getDistributionTargets(difficultyMix, targetCount);

  targets.forEach(({ key, count }) => {
    const difficultyPool = shuffleItems(pool.filter((question) => (
      !selectedIds.has(question.id) &&
      String(question.difficulty || 'medium').toLowerCase() === key.toLowerCase()
    )));
    difficultyPool.slice(0, count).forEach((question) => {
      selected.push(question);
      selectedIds.add(question.id);
    });
  });

  if (selected.length < targetCount) {
    shuffleItems(pool.filter((question) => !selectedIds.has(question.id)))
      .slice(0, targetCount - selected.length)
      .forEach((question) => {
        selected.push(question);
        selectedIds.add(question.id);
      });
  }

  return selected;
}

export function pickBalancedQuestionsFromBlueprint<T extends BlueprintQuestion>(
  pool: T[],
  blueprint: ExamBlueprintLike,
  options: {
    count: number;
    categoryId?: string | null;
    requireFullCount?: boolean;
  },
) {
  const count = Math.max(1, Number(blueprint.questionCount || options.count || 1));
  const filteredPool = options.categoryId
    ? pool.filter((question) => question.categoryId === options.categoryId)
    : pool;

  if (options.requireFullCount && filteredPool.length < count) {
    throw new Error(`Full mock needs ${count} approved questions, but only ${filteredPool.length} are available.`);
  }

  if (filteredPool.length === 0) {
    throw new Error('No approved questions are available for this assessment yet.');
  }

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const categoryDistribution = blueprint.categoryDistribution || blueprint.sectionDistribution || {};
  const categoryTargets = options.categoryId ? [] : getDistributionTargets(categoryDistribution, count);

  categoryTargets.forEach(({ key, count: target }) => {
    const categoryPool = filteredPool.filter((question) => question.categoryId === key && !selectedIds.has(question.id));
    if (options.requireFullCount && categoryPool.length < target) {
      throw new Error(`Full mock needs ${target} approved questions for ${key}, but only ${categoryPool.length} are available.`);
    }
    takeWithDifficultyMix(categoryPool, target, blueprint.difficultyMix).forEach((question) => {
      selected.push(question);
      selectedIds.add(question.id);
    });
  });

  if (selected.length < count) {
    takeWithDifficultyMix(
      filteredPool.filter((question) => !selectedIds.has(question.id)),
      count - selected.length,
      blueprint.difficultyMix,
    ).forEach((question) => {
      selected.push(question);
      selectedIds.add(question.id);
    });
  }

  if (options.requireFullCount && selected.length < count) {
    throw new Error(`Full mock needs ${count} approved questions, but only ${selected.length} could be selected from the configured blueprint.`);
  }

  return shuffleItems(selected).slice(0, options.requireFullCount ? count : Math.min(count, selected.length));
}
