import { zipSync, strToU8 } from "fflate";
import { oval, xccdf, issues, type Project } from "./generate.ts";
import {
  windowsAuthoringIssues,
  windowsOval,
  windowsXccdf,
  type WindowsProject,
} from "./windows-generate.ts";

/** Keep companion files at the same ZIP root so XCCDF's relative reference resolves. */
export function profileArchive(project: Project): Uint8Array {
  const errors = issues(project);
  if (errors.length) throw new Error(errors.join("\n"));
  const timestamp = new Date().toISOString();
  return zipSync({
    "oval.xml": strToU8(oval(project, timestamp)),
    "xccdf.xml": strToU8(xccdf(project, timestamp.slice(0, 10))),
  });
}

export function windowsProfileArchive(project: WindowsProject): Uint8Array {
  const errors = windowsAuthoringIssues(project);
  if (errors.length)
    throw new Error(errors.map((issue) => issue.message).join("\n"));
  const timestamp = new Date().toISOString();
  return zipSync({
    "oval.xml": strToU8(windowsOval(project, timestamp)),
    "xccdf.xml": strToU8(windowsXccdf(project, timestamp.slice(0, 10))),
  });
}
