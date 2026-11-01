export function withTiming<T extends (...args: any[]) => Promise<any>>(name: string, fn: T): T {
  return (async (...args: any[]) => {
    const start = Date.now();
    try {
      const res = await fn(...args);
      const dur = Date.now() - start;
      if (dur > 300) {
        console.warn(`[route][slow] ${name} ${dur}ms`);
      } else if (dur > 100) {
        console.log(`[route][med] ${name} ${dur}ms`);
      }
      return res;
    } catch (err) {
      const dur = Date.now() - start;
      console.error(`[route][err] ${name} ${dur}ms`, err);
      throw err;
    }
  }) as T;
}
