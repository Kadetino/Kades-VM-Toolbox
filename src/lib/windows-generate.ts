import { escapeXml, type AuthoringIssue, type Severity } from "./generate.ts";

export type RegistryHive =
  | "HKEY_LOCAL_MACHINE"
  | "HKEY_CURRENT_USER"
  | "HKEY_USERS"
  | "HKEY_CLASSES_ROOT";
export type RegistryDatatype = "string" | "int" | "boolean";
export type RegistryOperation = "equals" | "not equal" | "pattern match";

export interface WindowsRule {
  id: number;
  title: string;
  description: string;
  severity: Severity;
  selected: boolean;
  hive: RegistryHive;
  key: string;
  name: string;
  datatype: RegistryDatatype;
  operation: RegistryOperation;
  value: string;
}

export interface WindowsProject {
  namespace: string;
  title: string;
  profileTitle: string;
  description: string;
  version: string;
  rules: WindowsRule[];
}

export const blankWindowsRule = (id: number): WindowsRule => ({
  id,
  title: "",
  description: "",
  severity: "medium",
  selected: true,
  hive: "HKEY_LOCAL_MACHINE",
  key: "",
  name: "",
  datatype: "int",
  operation: "equals",
  value: "",
});

export const windowsExample: WindowsProject = {
  namespace: "org.example.windows",
  title: "Windows security baseline",
  profileTitle: "Windows workstation hardening profile",
  description: "Experimental registry checks for managed Windows systems.",
  version: "1.0.0",
  rules: [
    {
      ...blankWindowsRule(1),
      title: "Disable SMBv1 server support",
      description: "Require the SMB1 registry value to be disabled.",
      key: String.raw`SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters`,
      name: "SMB1",
      value: "0",
      severity: "high",
    },
  ],
};

const validNamespace = /^[a-zA-Z0-9]+(?:[.\-][a-zA-Z0-9]+)*$/;

export function windowsAuthoringIssues(
  project: WindowsProject,
): AuthoringIssue[] {
  const result: AuthoringIssue[] = [];
  if (!validNamespace.test(project.namespace)) {
    result.push({
      message: "Namespace: use letters, numbers, dots or hyphens.",
    });
  }

  for (const [name, value] of [
    ["title", project.title],
    ["profile name", project.profileTitle],
    ["description", project.description],
    ["version", project.version],
  ]) {
    if (!value.trim()) {
      result.push({
        message: `Benchmark: add a ${name} in the XCCDF profile tab.`,
      });
    }
  }

  if (!project.rules.length) result.push({ message: "Add at least one rule." });
  for (const rule of project.rules) {
    const title = rule.title.trim() || "Untitled rule";
    const missing = [
      ["name", rule.title],
      ["description", rule.description],
      ["registry key", rule.key],
      ["value name", rule.name],
      ["required value", rule.value],
    ]
      .filter(([, value]) => !value.trim())
      .map(([label]) => label);
    if (missing.length) {
      result.push({
        ruleId: rule.id,
        message: `“${title}”: add ${missing.join(", ")}.`,
      });
    }
    if (rule.operation === "pattern match" && rule.datatype !== "string") {
      result.push({
        ruleId: rule.id,
        message: `“${title}”: pattern matching requires the string datatype.`,
      });
    }
  }
  return result;
}

const ovalId = (project: WindowsProject, type: string, id: number) =>
  `oval:${project.namespace}:${type}:${id}`;

export function windowsOval(
  project: WindowsProject,
  time = new Date().toISOString(),
): string {
  const e = escapeXml;
  return `<?xml version="1.0" encoding="UTF-8"?>
<oval_definitions xmlns="http://oval.mitre.org/XMLSchema/oval-definitions-5" xmlns:oval="http://oval.mitre.org/XMLSchema/oval-common-5" xmlns:win="http://oval.mitre.org/XMLSchema/oval-definitions-5#windows">
  <generator><oval:product_name>Kade's VM Toolbox</oval:product_name><oval:product_version>1.1.0</oval:product_version><oval:schema_version>5.11</oval:schema_version><oval:timestamp>${e(time)}</oval:timestamp></generator>
  <definitions>
${project.rules.map((rule) => `    <definition id="${e(ovalId(project, "def", rule.id))}" version="1" class="compliance"><metadata><title>${e(rule.title)}</title><description>${e(rule.description)}</description></metadata><criteria operator="AND"><criterion test_ref="${e(ovalId(project, "tst", rule.id))}" comment="${e(rule.title)}"/></criteria></definition>`).join("\n")}
  </definitions>
  <tests>
${project.rules.map((rule) => `    <win:registry_test id="${e(ovalId(project, "tst", rule.id))}" version="1" check="all" check_existence="at_least_one_exists" comment="${e(rule.title)}"><win:object object_ref="${e(ovalId(project, "obj", rule.id))}"/><win:state state_ref="${e(ovalId(project, "ste", rule.id))}"/></win:registry_test>`).join("\n")}
  </tests>
  <objects>
${project.rules.map((rule) => `    <win:registry_object id="${e(ovalId(project, "obj", rule.id))}" version="1"><win:hive>${e(rule.hive)}</win:hive><win:key>${e(rule.key)}</win:key><win:name>${e(rule.name)}</win:name></win:registry_object>`).join("\n")}
  </objects>
  <states>
${project.rules.map((rule) => `    <win:registry_state id="${e(ovalId(project, "ste", rule.id))}" version="1"><win:value datatype="${e(rule.datatype)}" operation="${e(rule.operation)}">${e(rule.value)}</win:value></win:registry_state>`).join("\n")}
  </states>
</oval_definitions>`;
}

export function windowsXccdf(
  project: WindowsProject,
  date = new Date().toISOString().slice(0, 10),
): string {
  const e = escapeXml;
  const id = (type: string, value: string | number) =>
    `xccdf_${project.namespace}_${type}_${value}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Benchmark xmlns="http://checklists.nist.gov/xccdf/1.2" id="${e(id("benchmark", "baseline"))}" xml:lang="en-US">
  <status date="${e(date)}">draft</status>
  <title>${e(project.title)}</title>
  <description>${e(project.description)}</description>
  <version>${e(project.version)}</version>
  <Profile id="${e(id("profile", "custom"))}">
    <title>${e(project.profileTitle)}</title>
${project.rules.map((rule) => `    <select idref="${e(id("rule", rule.id))}" selected="${rule.selected}"/>`).join("\n")}
  </Profile>
${project.rules
  .map(
    (
      rule,
    ) => `  <Rule id="${e(id("rule", rule.id))}" severity="${rule.severity}">
    <title>${e(rule.title)}</title>
    <description>${e(rule.description)}</description>
    <check system="http://oval.mitre.org/XMLSchema/oval-definitions-5">
      <check-content-ref href="oval.xml" name="${e(ovalId(project, "def", rule.id))}"/>
    </check>
  </Rule>`,
  )
  .join("\n")}
</Benchmark>`;
}

export function readWindowsProject(raw: string): WindowsProject {
  const input = JSON.parse(raw) as Record<string, unknown>;
  if (
    !input ||
    !["namespace", "title", "profileTitle", "description", "version"].every(
      (key) => typeof input[key] === "string",
    ) ||
    !Array.isArray(input.rules) ||
    input.rules.length > 1000
  ) {
    throw new Error("This file is not a Windows Kade's VM Toolbox project.");
  }

  const ids = new Set<number>();
  const rules = input.rules.map((candidate): WindowsRule => {
    const rule = candidate as Record<string, unknown>;
    if (
      !rule ||
      !Number.isSafeInteger(rule.id) ||
      (rule.id as number) < 1 ||
      ids.has(rule.id as number) ||
      !["title", "description", "key", "name", "value"].every(
        (key) => typeof rule[key] === "string",
      ) ||
      !["low", "medium", "high"].includes(rule.severity as string) ||
      ![
        "HKEY_LOCAL_MACHINE",
        "HKEY_CURRENT_USER",
        "HKEY_USERS",
        "HKEY_CLASSES_ROOT",
      ].includes(rule.hive as string) ||
      !["string", "int", "boolean"].includes(rule.datatype as string) ||
      !["equals", "not equal", "pattern match"].includes(
        rule.operation as string,
      )
    ) {
      throw new Error("The project contains an invalid Windows rule.");
    }
    ids.add(rule.id as number);
    return {
      id: rule.id as number,
      title: rule.title as string,
      description: rule.description as string,
      severity: rule.severity as Severity,
      selected: rule.selected !== false,
      hive: rule.hive as RegistryHive,
      key: rule.key as string,
      name: rule.name as string,
      datatype: rule.datatype as RegistryDatatype,
      operation: rule.operation as RegistryOperation,
      value: rule.value as string,
    };
  });

  return {
    namespace: input.namespace as string,
    title: input.title as string,
    profileTitle: input.profileTitle as string,
    description: input.description as string,
    version: input.version as string,
    rules,
  };
}
