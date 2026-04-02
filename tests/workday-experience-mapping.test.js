/** @jest-environment jsdom */

function makeInput(id, value = "") {
  const el = document.createElement("input");
  el.type = "text";
  el.id = id;
  el.value = value;
  document.body.appendChild(el);
  return el;
}

describe("content/fields/mapper Workday experience mapping", () => {
  test("maps repeating blocks by existing company/title instead of pure DOM order", async () => {
    const { buildFillPlan } = await import("../src/content/fields/mapper.js");

    // DOM order is: block-2 first, then block-1 (intentionally reversed).
    // block-2 already has company "Beta" filled, missing title.
    const b2Company = makeInput("workExperience-2--companyName", "Beta LLC");
    const b2Title = makeInput("workExperience-2--jobTitle", "");

    // block-1 already has title "Engineer" filled, missing company.
    const b1Title = makeInput("workExperience-1--jobTitle", "Engineer");
    const b1Company = makeInput("workExperience-1--companyName", "");

    const profile = {
      experience: [
        { company: "Alpha Inc", title: "Engineer" },
        { company: "Beta LLC", title: "Manager" },
      ],
    };

    const plan = buildFillPlan([b2Company, b2Title, b1Title, b1Company], profile, {}, { overrideFilled: false });

    const known = plan.knownFields.map((f) => ({ id: f.element.id, value: f.value, type: f.fieldType }));

    // It should fill missing title in block-2 using Beta LLC (Manager).
    expect(known).toContainEqual({ id: "workExperience-2--jobTitle", value: "Manager", type: "workday_exp" });

    // It should fill missing company in block-1 using Engineer (Alpha Inc).
    expect(known).toContainEqual({ id: "workExperience-1--companyName", value: "Alpha Inc", type: "workday_exp" });
  });

  test("falls back to sequence when there is no existing signal in blocks", async () => {
    const { buildFillPlan } = await import("../src/content/fields/mapper.js");

    const aCompany = makeInput("workExperience-1--companyName", "");
    const aTitle = makeInput("workExperience-1--jobTitle", "");
    const bCompany = makeInput("workExperience-2--companyName", "");
    const bTitle = makeInput("workExperience-2--jobTitle", "");

    const profile = {
      experience: [
        { company: "First Co", title: "First Title" },
        { company: "Second Co", title: "Second Title" },
      ],
    };

    const plan = buildFillPlan([aCompany, aTitle, bCompany, bTitle], profile, {}, { overrideFilled: false });
    const knownById = new Map(plan.knownFields.map((f) => [f.element.id, f.value]));

    expect(knownById.get("workExperience-1--companyName")).toBe("First Co");
    expect(knownById.get("workExperience-2--companyName")).toBe("Second Co");
  });
});

