import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("top page returns 200 and contains sr-only h1", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const html = await res.text();
    // sr-only h1 from src/app/page.tsx — 全国心霊マップ Explorer
    expect(html).toContain("全国心霊マップ");
    // html lang and title exist
    expect(html).toContain("<html");
  });

  test("api/spots returns 200 with features", async ({ request }) => {
    const res = await request.get("/api/spots?limit=2");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("features");
    expect(Array.isArray(json.features)).toBe(true);
  });
});
