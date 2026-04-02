import { buildSmartFormSchema } from "../src/content/fields/schema.js";

function makeInput({ id = "", name = "", type = "text", labelText = "" } = {}) {
  const wrap = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");
  if (id) input.id = id;
  if (name) input.name = name;
  input.type = type;
  if (labelText) {
    label.textContent = labelText;
    if (id) label.setAttribute("for", id);
  }
  wrap.appendChild(label);
  wrap.appendChild(input);
  document.body.appendChild(wrap);
  return input;
}

describe("buildSmartFormSchema", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("uses id-based fieldId when id exists", () => {
    const email = makeInput({ id: "email", type: "email", labelText: "Email" });
    const { schema, indexById } = buildSmartFormSchema([email]);
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0].fieldId).toBe("id:email");
    expect(indexById["id:email"]).toBe(email);
  });

  test("groups radio buttons by name into a single schema field", () => {
    const r1 = makeInput({ name: "auth", type: "radio", labelText: "Yes" });
    r1.value = "yes";
    const r2 = makeInput({ name: "auth", type: "radio", labelText: "No" });
    r2.value = "no";

    const { schema, indexById } = buildSmartFormSchema([r1, r2]);
    expect(schema.fields).toHaveLength(1);
    const f = schema.fields[0];
    expect(f.kind).toBe("radio_group");
    expect(f.name).toBe("auth");
    expect(Array.isArray(f.options)).toBe(true);
    expect(indexById[f.fieldId]).toHaveLength(2);
  });

  test("captures select options", () => {
    const select = document.createElement("select");
    select.id = "workAuth";
    const opt1 = document.createElement("option");
    opt1.value = "citizen";
    opt1.textContent = "Citizen";
    const opt2 = document.createElement("option");
    opt2.value = "visa";
    opt2.textContent = "Visa";
    select.appendChild(opt1);
    select.appendChild(opt2);
    document.body.appendChild(select);

    const { schema } = buildSmartFormSchema([select]);
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0].options.map((o) => o.value)).toEqual(["citizen", "visa"]);
  });
});

