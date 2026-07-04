// Turns any thrown error into a safe, human-readable message for the UI.
//
// Server-function input validation (Zod) rejects with a JSON array of issues —
// without this, that raw JSON would be shown to users. We also avoid leaking
// technical/internal error text (stack traces, network internals) for security.

type ZodIssue = {
  code?: string;
  minimum?: number;
  maximum?: number;
  type?: string;
  validation?: string;
  path?: (string | number)[];
  message?: string;
};

function fieldLabel(path?: (string | number)[]): string {
  if (!path || path.length === 0) return "This field";
  const name = String(path[path.length - 1]);
  // camelCase / snake_case → "Title Case"
  const spaced = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function humanizeIssue(issue: ZodIssue): string {
  const label = fieldLabel(issue.path);
  switch (issue.code) {
    case "too_small":
      if (issue.type === "string")
        return `${label} must be at least ${issue.minimum} character${issue.minimum === 1 ? "" : "s"}.`;
      return `${label} is too small (minimum ${issue.minimum}).`;
    case "too_big":
      if (issue.type === "string")
        return `${label} must be ${issue.maximum} characters or fewer.`;
      return `${label} is too large (maximum ${issue.maximum}).`;
    case "invalid_string":
      if (issue.validation === "email") return "Please enter a valid email address.";
      if (issue.validation === "url") return "Please enter a valid URL.";
      return `${label} is not in a valid format.`;
    case "invalid_type":
      return `${label} is required.`;
    case "invalid_enum_value":
      return `${label} has an invalid value.`;
    default:
      return issue.message && issue.message.length < 120
        ? issue.message
        : `Please check the ${label.toLowerCase()} field.`;
  }
}

export function getFriendlyError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;
  const trimmed = raw.trim();

  // Structured (Zod) validation errors arrive as JSON.
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const issues: ZodIssue[] = Array.isArray(parsed)
        ? parsed
        : (parsed?.issues ?? []);
      if (Array.isArray(issues) && issues.length > 0) {
        return humanizeIssue(issues[0]);
      }
    } catch {
      /* not JSON after all */
    }
    // Looked structured but unparseable — don't leak it.
    return fallback;
  }

  // Network / technical errors → generic message (don't expose internals).
  if (
    /failed to fetch|networkerror|fetch failed|econn|etimedout|timeout|unexpected token|<!doctype|cannot read|undefined is not|null is not/i.test(
      trimmed,
    )
  ) {
    return "Network error. Please check your connection and try again.";
  }

  // Our own handlers throw short, user-friendly sentences — show those.
  if (trimmed.length <= 200) return trimmed;
  return fallback;
}
