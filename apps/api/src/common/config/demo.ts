export function isDemoEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}
