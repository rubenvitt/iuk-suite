export function moduleUrl(key: string): string {
  const port = process.env.PORT ?? "3000";
  const base = process.env.SUITE_DEV_HOST_SUFFIX ?? "localtest.me";
  return `http://${key}.${base}:${port}`;
}
