export function makeId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
