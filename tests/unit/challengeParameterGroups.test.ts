import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChallengePlayer } from "@/components/ChallengePlayer";
import { createEmptyChallenge, exportChallengePackage, importChallengePackage } from "@/lib/challengeLibrary";
import { groupChallengeParameters, joinChallengeParameterGroups, normalizeChallengeParameters, type ChallengeParameter } from "@/lib/challengeParameters";

const radius = { label: "Radius", value: "10 mm" };
const height = { label: "Height", value: "20 mm" };
const position = { label: "Position X", value: "5 mm" };
const rotation = { label: "Rotation Z", value: "45 °" };
const separator = { type: "separator" } as const;

describe("challenge parameter groups", () => {
  it("renders legacy parameters as one contiguous group", () => {
    expect(groupChallengeParameters([radius, height])).toEqual([[radius, height]]);
    const challenge = createEmptyChallenge();
    challenge.steps[0].values = [radius, height];
    const markup = renderToStaticMarkup(createElement(ChallengePlayer, { challenge, dock: "left", onDockChange: () => {}, onClose: () => {} }));
    expect(markup.match(/<dl/g)).toHaveLength(1);
    expect(markup.match(/<dt>/g)).toHaveLength(2);
  });

  it("separates sections without empty groups, including leading and trailing markers", () => {
    const values = [separator, radius, height, separator, separator, position, separator, rotation, separator];
    expect(groupChallengeParameters(values)).toEqual([[radius, height], [position], [rotation]]);
    const challenge = createEmptyChallenge();
    challenge.steps[0].values = values;
    const markup = renderToStaticMarkup(createElement(ChallengePlayer, { challenge, dock: "right", onDockChange: () => {}, onClose: () => {} }));
    expect(markup.match(/<dl/g)).toHaveLength(3);
    expect(markup.match(/<dt>/g)).toHaveLength(4);
  });

  it("appends captures as a new group without merging manually authored values", () => {
    const manual = { label: "Instruction", value: "Keep this" };
    const captured = [radius, height, separator, position, separator, rotation];
    expect(joinChallengeParameterGroups([[manual, separator], [], captured])).toEqual([
      manual, separator, radius, height, separator, position, separator, rotation,
    ]);
    expect(joinChallengeParameterGroups([[], [separator], []])).toEqual([]);
  });

  it("keeps separators during ZIP export/import, alongside old-format challenges", async () => {
    const challenge = createEmptyChallenge();
    const values: ChallengeParameter[] = [radius, height, separator, position, separator, rotation];
    challenge.steps[0].values = values;
    const restored = await importChallengePackage(new File([exportChallengePackage(challenge)], "groups.zip"));
    expect(restored.steps[0].values).toEqual(values);
    challenge.steps[0].values = [radius, height];
    const legacy = await importChallengePackage(new File([exportChallengePackage(challenge)], "legacy.zip"));
    expect(legacy.steps[0].values).toEqual([radius, height]);
    expect(normalizeChallengeParameters([null, {}, separator, { label: "Count", value: 3 }])).toEqual([separator, { label: "Count", value: "3" }]);
  });
});
