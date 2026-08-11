// Renders {{variable}} placeholders in a message template body.
// Only variables explicitly passed in `variables` can ever be substituted -
// callers must never include sensitive fields such as Aadhaar/PAN in that
// map, since anything present here is safe to send to a resident.
export function renderMessageTemplate(
  body: string,
  variables: Record<string, string>
): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in variables ? variables[key] : match
  );
}
