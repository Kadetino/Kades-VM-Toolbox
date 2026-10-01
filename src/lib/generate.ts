export type Severity = "low" | "medium" | "high";
export type XccdfStatus =
  "incomplete" | "draft" | "interim" | "accepted" | "deprecated";
export type RuleKind =
  "textfile" | "systemd" | "dpkg" | "rpm" | "file" | "sysctl";

export interface Rule {
  id: number;
  title: string;
  description: string;
  severity: Severity;
  selected: boolean;
  kind: RuleKind;
  path: string;
  pattern: string;
  unit: string;
  property: string;
  expectedValue: string;
  packageName: string;
  ownerId: string;
  groupId: string;
  fileMode: string;
  sysctlName: string;
  datatype: "string" | "int" | "boolean";
  operation: "equals" | "not equal" | "greater than" | "less than";
}
export interface Project {
  namespace: string;
  title: string;
  profileTitle: string;
  description: string;
  version: string;
  status: XccdfStatus;
  rules: Rule[];
}
export interface AuthoringIssue {
  message: string;
  ruleId?: number;
}

export const blankRule = (id: number): Rule => ({
  id,
  title: "",
  description: "",
  severity: "medium",
  selected: true,
  kind: "textfile",
  path: "",
  pattern: "",
  unit: "",
  property: "ActiveState",
  expectedValue: "",
  packageName: "",
  ownerId: "0",
  groupId: "0",
  fileMode: "0644",
  sysctlName: "",
  datatype: "string",
  operation: "equals",
});
export const example: Project = {
  namespace: "org.example",
  title: "Linux security baseline",
  profileTitle: "Linux server hardening profile",
  description: "Custom configuration checks for managed Linux systems.",
  version: "1.0.0",
  status: "draft",
  rules: [
    {
      ...blankRule(1),
      title: "Disable SSH root login",
      description: "Ensure direct root login over SSH is disabled.",
      path: "/etc/ssh/sshd_config",
      pattern: "^[\\t ]*PermitRootLogin[\\t ]+no[\\t ]*$",
    },
  ],
};
export const escapeXml = (value: unknown): string =>
  String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );

/** Escape a user value before placing it in an OVAL regular expression. */
const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const requiredFields = (rule: Rule): [string, string][] => {
  const fields: Record<RuleKind, [string, string][]> = {
    textfile: [
      ["file path", rule.path],
      ["required pattern", rule.pattern],
    ],
    systemd: [
      ["systemd unit", rule.unit],
      ["property", rule.property],
      ["required value", rule.expectedValue],
    ],
    dpkg: [["DEB package name", rule.packageName]],
    rpm: [["RPM package name", rule.packageName]],
    file: [
      ["file path", rule.path],
      ["owner UID", rule.ownerId],
      ["group GID", rule.groupId],
      ["file mode", rule.fileMode],
    ],
    sysctl: [
      ["sysctl name", rule.sysctlName],
      ["required value", rule.expectedValue],
    ],
  };
  return [
    ["name", rule.title],
    ["description", rule.description],
    ...fields[rule.kind],
  ];
};
export function authoringIssues(project: Project): AuthoringIssue[] {
  const result: AuthoringIssue[] = [];
  const invalidXml = (v: string) =>
    /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(
      v,
    );
  if (!/^[a-zA-Z0-9]+(?:[.\-][a-zA-Z0-9]+)*$/.test(project.namespace))
    result.push({
      message: "Namespace: use letters, numbers, dots or hyphens.",
    });
  for (const [name, value] of [
    ["title", project.title],
    ["profile name", project.profileTitle],
    ["description", project.description],
    ["version", project.version],
  ])
    if (!value.trim())
      result.push({
        message: `Benchmark: add a ${name} in the XCCDF profile tab.`,
      });
  if (!project.rules.length)
    result.push({ message: "Add at least one OVAL definition." });
  for (const [index, rule] of project.rules.entries()) {
    const title = rule.title.trim() || "Untitled rule";
    const duplicate =
      project.rules.filter(
        (candidate) => (candidate.title.trim() || "Untitled rule") === title,
      ).length > 1;
    const name = `“${title}”${duplicate ? ` (rule ${index + 1} in the list)` : ""}`;
    const missing = requiredFields(rule)
      .filter(([, value]) => !value.trim())
      .map(([label]) => label);
    if (missing.length)
      result.push({
        ruleId: rule.id,
        message: `${name}: add ${missing.join(", ")}.`,
      });
    if (
      ["textfile", "file"].includes(rule.kind) &&
      rule.path &&
      !rule.path.startsWith("/")
    )
      result.push({
        ruleId: rule.id,
        message: `${name}: file path must be an absolute Linux path.`,
      });
    if (rule.kind === "file" && !/^[0-7]{3,4}$/.test(rule.fileMode))
      result.push({
        ruleId: rule.id,
        message: `${name}: file mode must be three or four octal digits.`,
      });
    if (
      rule.kind === "file" &&
      ![rule.ownerId, rule.groupId].every((v) => /^\d+$/.test(v))
    )
      result.push({
        ruleId: rule.id,
        message: `${name}: owner UID and group GID must be non-negative integers.`,
      });
    if (
      Object.values(rule)
        .filter((v): v is string => typeof v === "string")
        .some(invalidXml)
    )
      result.push({
        ruleId: rule.id,
        message: `${name}: remove characters that XML 1.0 cannot represent.`,
      });
  }
  return result;
}
export const issues = (project: Project): string[] =>
  authoringIssues(project).map((issue) => issue.message);
const ovalId = (project: Project, type: string, id: number) =>
  `oval:${project.namespace}:${type}:${id}`;
const ref = (project: Project, type: string, rule: Rule) =>
  escapeXml(ovalId(project, type, rule.id));
function definition(project: Project, rule: Rule): string {
  return `    <definition id="${ref(project, "def", rule)}" version="1" class="compliance"><metadata><title>${escapeXml(rule.title)}</title><description>${escapeXml(rule.description)}</description></metadata><criteria operator="AND"><criterion test_ref="${ref(project, "tst", rule)}" comment="${escapeXml(rule.title)}"/></criteria></definition>`;
}
function test(project: Project, rule: Rule): string {
  const prefix =
    rule.kind === "textfile" || rule.kind === "sysctl"
      ? "ind"
      : rule.kind === "file"
        ? "unix"
        : "linux";
  const type: Record<RuleKind, string> = {
    textfile: "textfilecontent54",
    systemd: "systemdunitproperty",
    dpkg: "dpkginfo",
    rpm: "rpminfo",
    file: "file",
    sysctl: "textfilecontent54",
  };
  const state = !["textfile", "sysctl", "dpkg", "rpm"].includes(rule.kind)
    ? `<${prefix}:state state_ref="${ref(project, "ste", rule)}"/>`
    : "";
  return `    <${prefix}:${type[rule.kind]}_test id="${ref(project, "tst", rule)}" version="1" check="all" check_existence="at_least_one_exists" comment="${escapeXml(rule.title)}"><${prefix}:object object_ref="${ref(project, "obj", rule)}"/>${state}</${prefix}:${type[rule.kind]}_test>`;
}
function permissions(mode: string): string {
  const digits = mode.padStart(4, "0").slice(-4).split("").map(Number);
  const names = [
    "suid",
    "sgid",
    "sticky",
    "uread",
    "uwrite",
    "uexec",
    "gread",
    "gwrite",
    "gexec",
    "oread",
    "owrite",
    "oexec",
  ];
  const values = [
    digits[0] & 4,
    digits[0] & 2,
    digits[0] & 1,
    digits[1] & 4,
    digits[1] & 2,
    digits[1] & 1,
    digits[2] & 4,
    digits[2] & 2,
    digits[2] & 1,
    digits[3] & 4,
    digits[3] & 2,
    digits[3] & 1,
  ];
  return names
    .map(
      (name, i) =>
        `<unix:${name} datatype="boolean" operation="equals">${Boolean(values[i])}</unix:${name}>`,
    )
    .join("");
}
function object(project: Project, rule: Rule): string {
  const e = escapeXml,
    id = ref(project, "obj", rule);
  switch (rule.kind) {
    case "systemd":
      return `    <linux:systemdunitproperty_object id="${id}" version="1"><linux:unit>${e(rule.unit)}</linux:unit><linux:property>${e(rule.property)}</linux:property></linux:systemdunitproperty_object>`;
    case "dpkg":
      return `    <linux:dpkginfo_object id="${id}" version="1"><linux:name>${e(rule.packageName)}</linux:name></linux:dpkginfo_object>`;
    case "rpm":
      return `    <linux:rpminfo_object id="${id}" version="1"><linux:name>${e(rule.packageName)}</linux:name></linux:rpminfo_object>`;
    case "file":
      return `    <unix:file_object id="${id}" version="1"><unix:filepath>${e(rule.path)}</unix:filepath></unix:file_object>`;
    case "sysctl":
      return `    <ind:textfilecontent54_object id="${id}" version="1"><ind:behaviors multiline="true"/><ind:filepath>${e(`/proc/sys/${rule.sysctlName.replaceAll(".", "/")}`)}</ind:filepath><ind:pattern operation="pattern match">^[\\t ]*${e(escapeRegex(rule.expectedValue))}[\\t ]*$</ind:pattern><ind:instance datatype="int" operation="greater than or equal">1</ind:instance></ind:textfilecontent54_object>`;
    default:
      return `    <ind:textfilecontent54_object id="${id}" version="1"><ind:behaviors multiline="true"/><ind:filepath>${e(rule.path)}</ind:filepath><ind:pattern operation="pattern match">${e(rule.pattern)}</ind:pattern><ind:instance datatype="int" operation="greater than or equal">1</ind:instance></ind:textfilecontent54_object>`;
  }
}
function state(project: Project, rule: Rule): string {
  const e = escapeXml,
    id = ref(project, "ste", rule);
  if (rule.kind === "systemd")
    return `    <linux:systemdunitproperty_state id="${id}" version="1"><linux:value operation="equals">${e(rule.expectedValue)}</linux:value></linux:systemdunitproperty_state>`;
  if (rule.kind === "file")
    return `    <unix:file_state id="${id}" version="1"><unix:group_id datatype="int" operation="equals">${e(rule.groupId)}</unix:group_id><unix:user_id datatype="int" operation="equals">${e(rule.ownerId)}</unix:user_id>${permissions(rule.fileMode)}</unix:file_state>`;
  return "";
}
export function oval(
  project: Project,
  time = new Date().toISOString(),
): string {
  const states = project.rules
    .map((rule) => state(project, rule))
    .filter(Boolean);
  return `<?xml version="1.0" encoding="UTF-8"?>
<oval_definitions xmlns="http://oval.mitre.org/XMLSchema/oval-definitions-5" xmlns:oval="http://oval.mitre.org/XMLSchema/oval-common-5" xmlns:ind="http://oval.mitre.org/XMLSchema/oval-definitions-5#independent" xmlns:linux="http://oval.mitre.org/XMLSchema/oval-definitions-5#linux" xmlns:unix="http://oval.mitre.org/XMLSchema/oval-definitions-5#unix">
  <generator><oval:product_name>Kade's VM Toolbox</oval:product_name><oval:product_version>1.2.0</oval:product_version><oval:schema_version>5.11</oval:schema_version><oval:timestamp>${escapeXml(time)}</oval:timestamp></generator>
  <definitions>
${project.rules.map((rule) => definition(project, rule)).join("\n")}
  </definitions>
  <tests>
${project.rules.map((rule) => test(project, rule)).join("\n")}
  </tests>
  <objects>
${project.rules.map((rule) => object(project, rule)).join("\n")}
  </objects>${states.length ? `\n  <states>\n${states.join("\n")}\n  </states>` : ""}
</oval_definitions>`;
}
export function xccdf(
  project: Project,
  date = new Date().toISOString().slice(0, 10),
): string {
  const e = escapeXml,
    id = (type: string, value: string | number) =>
      `xccdf_${project.namespace}_${type}_${value}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Benchmark xmlns="http://checklists.nist.gov/xccdf/1.2" xmlns:dc="http://purl.org/dc/elements/1.1/" id="${e(id("benchmark", "baseline"))}" xml:lang="en-US">
  <status date="${e(date)}">${e(project.status)}</status>
  <title>${e(project.title)}</title>
  <description>${e(project.description)}</description>
  <version>${e(project.version)}</version>
  <metadata><dc:publisher>Kade's VM Toolbox</dc:publisher></metadata>
  <Profile id="${e(id("profile", "custom"))}">
    <title>${e(project.profileTitle)}</title>
${project.rules.map((rule) => `    <select idref="${e(id("rule", rule.id))}" selected="${rule.selected}"/>`).join("\n")}
  </Profile>
${project.rules
  .map(
    (
      rule,
    ) => `  <Rule id="${e(id("rule", rule.id))}" selected="${rule.selected}" severity="${rule.severity}">
    <title>${e(rule.title)}</title>
    <description>${e(rule.description)}</description>
    <check system="http://oval.mitre.org/XMLSchema/oval-definitions-5">
      <check-content-ref href="oval.xml" name="oval:${e(project.namespace)}:def:${rule.id}"/>
    </check>
  </Rule>`,
  )
  .join("\n")}
</Benchmark>`;
}
export function readProject(raw: string): Project {
  const input = JSON.parse(raw);
  if (
    !input ||
    !["namespace", "title", "description", "version"].every(
      (key) => typeof input[key] === "string",
    ) ||
    !Array.isArray(input.rules) ||
    input.rules.length > 1000
  )
    throw new Error("This file is not a Kade's VM Toolbox project.");
  const ids = new Set<number>();
  const rules = input.rules.map((candidate: unknown): Rule => {
    const rule = candidate as Record<string, unknown>,
      kind = (rule.kind ?? "textfile") as RuleKind;
    if (
      !rule ||
      !Number.isSafeInteger(rule.id) ||
      (rule.id as number) < 1 ||
      ids.has(rule.id as number) ||
      !["textfile", "systemd", "dpkg", "rpm", "file", "sysctl"].includes(
        kind,
      ) ||
      !["title", "description"].every((key) => typeof rule[key] === "string") ||
      !["low", "medium", "high"].includes(rule.severity as string)
    )
      throw new Error("The project contains an invalid Linux rule.");
    const id = rule.id as number;
    ids.add(id);
    const base = blankRule(id);
    for (const key of Object.keys(base) as (keyof Rule)[])
      if (
        typeof base[key] === "string" &&
        rule[key] !== undefined &&
        typeof rule[key] !== "string"
      )
        throw new Error("The project contains an invalid Linux rule.");
    return {
      ...base,
      ...rule,
      id,
      kind,
      severity: rule.severity as Severity,
      selected: rule.selected !== false,
    } as Rule;
  });
  const status = [
    "incomplete",
    "draft",
    "interim",
    "accepted",
    "deprecated",
  ].includes(input.status)
    ? (input.status as XccdfStatus)
    : "draft";
  return {
    namespace: input.namespace,
    title: input.title,
    profileTitle:
      typeof input.profileTitle === "string" ? input.profileTitle : input.title,
    description: input.description,
    version: input.version,
    status,
    rules,
  };
}
