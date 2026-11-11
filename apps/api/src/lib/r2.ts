/** URLs firmadas de R2 (SigV4 por query): firmar es HMAC, barato en CPU. El archivo no pasa por el Worker. */
import { HTTPException } from "hono/http-exception";
import { AwsClient } from "aws4fetch";
import type { Bindings } from "../types";

export const presign = async (
  env: Pick<Bindings, "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_ACCOUNT_ID" | "MEDIA_BUCKET_NAME">,
  method: "PUT" | "GET",
  key: string,
  ttl: number,
): Promise<string> => {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
    throw new HTTPException(503, { message: "Faltan las credenciales S3 de R2" });
  }
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.MEDIA_BUCKET_NAME}/${key}`);
  url.searchParams.set("X-Amz-Expires", String(ttl));
  const signed = await client.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
};
