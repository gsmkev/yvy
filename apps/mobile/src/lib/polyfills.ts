// uuidv7 necesita crypto.getRandomValues; Hermes no lo trae.
import * as Crypto from "expo-crypto";

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto?.getRandomValues) {
  g.crypto = { ...(g.crypto ?? {}), getRandomValues: Crypto.getRandomValues };
}
