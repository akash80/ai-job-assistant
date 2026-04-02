import { isHoneypotTrapField } from "../src/content/fields/field-trap.js";

describe("isHoneypotTrapField", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("detects robots-only / human disclaimer copy", () => {
    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.setAttribute("for", "hp-url");
    label.textContent =
      "What is your enter website. this input is for robots only, do not enter if you're human.";
    const input = document.createElement("input");
    input.id = "hp-url";
    input.type = "text";
    input.name = "url";
    wrap.appendChild(label);
    wrap.appendChild(input);
    document.body.appendChild(wrap);
    expect(isHoneypotTrapField(input)).toBe(true);
  });

  test("does not flag a normal portfolio / website field", () => {
    const label = document.createElement("label");
    label.setAttribute("for", "portfolio");
    label.textContent = "Portfolio or website";
    const input = document.createElement("input");
    input.id = "portfolio";
    input.type = "url";
    wrapAppend(label, input);
    expect(isHoneypotTrapField(input)).toBe(false);
  });
});

function wrapAppend(label, input) {
  const wrap = document.createElement("div");
  wrap.appendChild(label);
  wrap.appendChild(input);
  document.body.appendChild(wrap);
}
