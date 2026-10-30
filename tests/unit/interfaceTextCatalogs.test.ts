import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import english from "@/locales/en.json";

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

it("keeps visible JSX text and static accessibility labels in language catalogs", () => {
  const failures: string[] = [];
  const source = path.resolve(__dirname, "../../apps/web/src");
  const invariant = /^(?:[XYZxyz]|kerCAD|CAD|SVG|STEP|STL|OBJ|Ctrl\/Cmd|mm|cm|m|in|ft|px|edu)$/;
  for (const file of files(source).filter((file) => file.endsWith(".tsx"))) {
    const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const report = (node: ts.Node, text: string) => failures.push(`${path.relative(source, file)}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: ${text}`);
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        const text = node.text.trim();
        if (/[A-Za-zÀ-ÿ]{2}/.test(text) && !invariant.test(text)) report(node, text);
      }
      if (ts.isJsxAttribute(node) && ["title", "aria-label", "placeholder", "alt", "label"].includes(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer)) {
        const text = node.initializer.text;
        if (/[A-Za-zÀ-ÿ]{2}/.test(text) && !invariant.test(text)) report(node, text);
      }
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "uiText" && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && !(node.arguments[0].text in english.messages)) report(node, `Missing catalog key ${node.arguments[0].text}`);
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  expect(failures).toEqual([]);
}, 15000);
