export function slugifyHostelName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}
