import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { strToU8, unzipSync, zipSync } from "fflate";
import { blankRule, example, oval, xccdf } from "../src/lib/generate.ts";
import { profileArchive } from "../src/lib/archive.ts";
import { importProfileZip } from "../src/lib/import-zip.ts";
import {
  readWindowsProject,
  windowsExample,
  windowsOval,
  windowsXccdf,
} from "../src/lib/windows-generate.ts";
globalThis.DOMParser = class extends DOMParser {
  constructor() {
    super({
      onError(_level, message) {
        throw Error("Malformed XML: " + message);
      },
    });
  }
};
const project = structuredClone(example);
project.title = "Ubuntu benchmark";
project.profileTitle = "Production server profile";
project.rules = [
  { ...project.rules[0], id: 7, title: "SSH & café <policy>" },
  { ...project.rules[0], id: 2 },
];
const o = oval(project),
  x = xccdf(project);
assert.match(x, /<title>Ubuntu benchmark<\/title>/);
assert.match(x, /<title>Production server profile<\/title>/);
assert.doesNotMatch(x, /<platform\b/);
assert.ok(
  x.split("\n").length > 15,
  "XCCDF preview should be formatted across readable lines",
);
const zip = (ov = o, xc = x) =>
  zipSync({ "oval.xml": strToU8(ov), "xccdf.xml": strToU8(xc) });
assert.deepEqual(importProfileZip(zip()), project);
assert.deepEqual(
  importProfileZip(
    zipSync({ "folder/oval.xml": strToU8(o), "folder/xccdf.xml": strToU8(x) }),
  ),
  project,
);
const reject = (bytes, pattern) =>
  assert.throws(() => importProfileZip(bytes), pattern);
reject(strToU8("not a zip"), /Cannot import ZIP/);
reject(zipSync({ "oval.xml": strToU8(o) }), /exactly two files/);
reject(
  zip(o, "<not-xccdf/>"),
  /expected an OVAL definitions document or an XCCDF Benchmark document/,
);
reject(
  zip(o, x.replace("xccdf/1.2", "xccdf/1.1")),
  /expected an OVAL definitions document or an XCCDF Benchmark document/,
);
reject(zip(o, x.replace("def:7", "def:99")), /definition reference/);
reject(zip(o, x.replace('href="oval.xml"', 'href="missing.xml"')), /companion/);
reject(
  zip(
    o.replace(
      'object_ref="oval:org.example:obj:7"',
      'object_ref="oval:org.example:obj:99"',
    ),
  ),
  /object reference/,
);
reject(
  zip(o.replace('<criteria operator="AND">', '<criteria operator="OR">')),
  /expected AND/,
);
reject(
  zip(
    o.replace(
      'check_existence="at_least_one_exists"',
      'check_existence="none_exist"',
    ),
  ),
  /check_existence/,
);
reject(
  zip(o.replace("<objects>", "<states><ind:bogus/></states><objects>")),
  /Unsupported bogus in states/,
);
reject(zip(o.replace('multiline="true"', 'multiline="false"')), /multiline/);
reject(zip(o, x.replace("<Profile ", '<Profile extends="other" ')), /extends/);
reject(
  zip(o.replace("<oval_definitions ", "<!DOCTYPE x><oval_definitions ")),
  /DTDs/,
);
reject(
  zipSync({ "../oval.xml": strToU8(o), "xccdf.xml": strToU8(x) }),
  /unsafe/,
);
reject(
  zipSync({
    "oval.xml": strToU8(o),
    "xccdf.xml": strToU8(x),
    "other.txt": strToU8("x"),
  }),
  /only OVAL XML and XCCDF XML/,
);
reject(zip(o.replace("</oval_definitions>", "")), /Malformed XML/);
reject(new Uint8Array(10 * 1024 * 1024 + 1), /10 MB/);
assert.equal(project.rules[0].title, "SSH & café <policy>");

const nativeProject = structuredClone(example);
nativeProject.status = "accepted";
const nativeRule = (id) => ({
  ...blankRule(id),
  title: nativeProject.rules[0].title,
  description: nativeProject.rules[0].description,
});
nativeProject.rules = [
  {
    ...nativeRule(1),
    id: 1,
    kind: "systemd",
    unit: "auditd.service",
    property: "ActiveState",
    expectedValue: "active",
  },
  { ...nativeRule(2), kind: "dpkg", packageName: "auditd" },
  { ...nativeRule(3), kind: "rpm", packageName: "audit" },
  {
    ...nativeRule(4),
    id: 4,
    kind: "file",
    path: "/etc/shadow",
    ownerId: "0",
    groupId: "42",
    fileMode: "0640",
  },
  {
    ...nativeRule(5),
    id: 5,
    kind: "sysctl",
    sysctlName: "net.ipv4.ip_forward",
    expectedValue: "0",
  },
];
const nativeOval = oval(nativeProject);
assert.match(nativeOval, /<linux:systemdunitproperty_test\b/);
assert.match(nativeOval, /<linux:dpkginfo_test\b/);
assert.match(nativeOval, /<linux:rpminfo_test\b/);
assert.match(nativeOval, /<unix:file_state\b/);
assert.match(nativeOval, /<unix:uwrite[^>]*>true<\/unix:uwrite>/);
assert.match(nativeOval, /<unix:owrite[^>]*>false<\/unix:owrite>/);
assert.match(nativeOval, /<ind:filepath>\/proc\/sys\/net\/ipv4\/ip_forward/);
assert.doesNotMatch(nativeOval, /<linux:sysctl_(?:test|object|state)\b/);
assert.match(
  nativeOval,
  /<unix:group_id[^>]*>42<\/unix:group_id><unix:user_id[^>]*>0<\/unix:user_id>/,
);
assert.match(xccdf(nativeProject), /<status[^>]*>accepted<\/status>/);
assert.deepEqual(Object.keys(unzipSync(profileArchive(nativeProject))).sort(), [
  "oval.xml",
  "xccdf.xml",
]);
assert.deepEqual(
  importProfileZip(profileArchive(nativeProject)),
  nativeProject,
);

const windowsProject = structuredClone(windowsExample);
const windowsOvalXml = windowsOval(windowsProject);
const windowsXccdfXml = windowsXccdf(windowsProject);
assert.match(windowsOvalXml, /<win:registry_test\b/);
assert.match(windowsOvalXml, /<win:registry_state\b/);
assert.match(windowsXccdfXml, /selected="true"/);
assert.deepEqual(
  readWindowsProject(JSON.stringify(windowsProject)),
  windowsProject,
);
console.log(
  "24 generator checks passed: Linux ZIP import safeguards and experimental Windows registry output.",
);
