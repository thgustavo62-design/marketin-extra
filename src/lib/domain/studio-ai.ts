export function studioModelVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return (
    /^(?:[\w.-]+\/[\w.-]+:)?([a-f0-9]{64})$/i.exec(value.trim())?.[1] ?? null
  );
}
export function studioAiReadiness(env: Record<string, string | undefined>) {
  const token = Boolean(env.REPLICATE_API_TOKEN?.trim()),
    generateModel = Boolean(studioModelVersion(env.REPLICATE_GENERATE_VERSION)),
    removeBgModel = Boolean(
      studioModelVersion(env.REPLICATE_REMOVE_BG_VERSION),
    );
  return {
    token,
    generateModel,
    removeBgModel,
    generate: token && generateModel,
    removeBg: token && removeBgModel,
  };
}
