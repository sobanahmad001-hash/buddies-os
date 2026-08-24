import { detectIntent } from "@/lib/command-parser/detectIntent";

describe("detectIntent", () => {
  test.each([
    ["Create project: Website", "create_project"],
    ["I finished the dashboard", "project_update"],
    ["Decision Alpha: use Supabase", "decision"],
    ["Always require approval", "rule"],
    ["Daily check: slept 8 hours", "daily_check"],
    ["hello there", "unknown"],
  ])("classifies %s", (input, expected) => {
    expect(detectIntent(input)).toBe(expected);
  });
});
