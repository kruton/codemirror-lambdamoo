import { expect, test } from "@playwright/test";

test("runs the published LambdaMOO server in a shared worker session", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".cm-editor")).toHaveCount(2);
  await expect(page.locator(".cm-lineNumbers")).toHaveCount(2);
  await expect(page.locator(".cm-foldGutter")).toHaveCount(2);
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(1);

  const result = await page.evaluate(() => ({
    semanticTokenCount: window.lambdaMOOTest.semanticTokenCount,
    formattingEditCount: window.lambdaMOOTest.formattingEditCount,
    diagnosticCount: window.lambdaMOOTest.diagnosticCount,
  }));
  expect(result.semanticTokenCount).toBeGreaterThan(0);
  expect(result.formattingEditCount).toBeGreaterThan(0);
  expect(result.diagnosticCount).toBeGreaterThan(0);

  await page.evaluate(() => {
    const view = window.lambdaMOOTest.second;
    const readyReference = view.state.doc.toString().lastIndexOf("ready");
    view.dispatch({ selection: { anchor: readyReference } });
  });
  await expect(page.locator(".cm-lsp-documentHighlight")).toHaveCount(2);

  await page.evaluate(() => window.lambdaMOOTest.destroy());
  await expect(page.locator("body")).toHaveAttribute("data-destroyed", "true");
  expect(pageErrors).toEqual([]);
});
