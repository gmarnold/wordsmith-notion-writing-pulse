import { describe, expect, it } from "vitest";
import { countRichTextWords, countWords, extractCountableText } from "./wordCount.js";

describe("countWords", () => {
  it.each([
    ["I don't know.", 3],
    ["mother-in-law", 1],
    ["hello-world", 1],
    ["hello—world", 2],
    ["I don’t know.", 3],
    ["  multiple\tspaces\nhere  ", 3],
    ["", 0],
    ["Draft 2 has 1,200 words.", 5]
  ])("counts %s", (input, expected) => {
    expect(countWords(input)).toBe(expected);
  });

  it("counts multiple rich text spans as one prose stream", () => {
    expect(countRichTextWords([{ plain_text: "The first " }, { plain_text: "line." }])).toBe(3);
  });
});

describe("extractCountableText", () => {
  it("includes prose blocks and excludes unsupported content", () => {
    expect(
      extractCountableText({
        type: "paragraph",
        paragraph: { rich_text: [{ plain_text: "Count me." }] }
      }),
    ).toBe("Count me.");

    expect(
      extractCountableText({
        type: "code",
        code: { rich_text: [{ plain_text: "const nope = true;" }] }
      }),
    ).toBe("");
  });
});
