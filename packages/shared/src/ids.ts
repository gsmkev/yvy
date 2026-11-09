import { uuidv7 } from "uuidv7";

export const newId = (): string => uuidv7();
export const now = (): number => Date.now();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isUuidV7 = (s: string): boolean => UUID_RE.test(s);
