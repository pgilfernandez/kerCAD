export type ChallengeParameterValue = { type?: "parameter"; label: string; value: string };
export type ChallengeParameterSeparator = { type: "separator"; label?: never; value?: never };
export type ChallengeParameter = ChallengeParameterValue | ChallengeParameterSeparator;

/** Older challenges have only label/value entries and form one group. */
export function groupChallengeParameters(values: readonly ChallengeParameter[] = []): ChallengeParameterValue[][] {
  const groups: ChallengeParameterValue[][] = [];
  let group: ChallengeParameterValue[] = [];
  for (const value of values) {
    if (value.type === "separator") {
      if (group.length) groups.push(group);
      group = [];
    } else group.push(value);
  }
  if (group.length) groups.push(group);
  return groups;
}

/** Join captures without empty groups or consecutive/leading/trailing separators. */
export function joinChallengeParameterGroups(sections: readonly (readonly ChallengeParameter[])[]): ChallengeParameter[] {
  const values: ChallengeParameter[] = [];
  for (const section of sections) for (const group of groupChallengeParameters(section)) {
    if (values.length) values.push({ type: "separator" });
    values.push(...group);
  }
  return values;
}

export function normalizeChallengeParameters(values: unknown): ChallengeParameter[] | undefined {
  if (!Array.isArray(values)) return undefined;
  return values.flatMap((entry): ChallengeParameter[] => {
    if (!entry || typeof entry !== "object") return [];
    if (entry.type === "separator") return [{ type: "separator" }];
    return entry.label && entry.value ? [{ label: String(entry.label), value: String(entry.value) }] : [];
  });
}
