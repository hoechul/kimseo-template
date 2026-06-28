import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const API_KEY_ALGORITHM = "aes-256-gcm";
const API_KEY_IV_LENGTH = 12;

function getApiKeyEncryptionSecret() {
  const secret =
    process.env.API_KEY_ENCRYPTION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("API key encryption secret is not configured.");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(rawKey: string) {
  const iv = randomBytes(API_KEY_IV_LENGTH);
  const cipher = createCipheriv(API_KEY_ALGORITHM, getApiKeyEncryptionSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(rawKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}.${authTag.toString("hex")}.${encrypted.toString("hex")}`;
}

export function decryptApiKey(encryptedValue: string) {
  const [ivHex, authTagHex, encryptedHex] = encryptedValue.split(".");

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid API key ciphertext.");
  }

  const decipher = createDecipheriv(
    API_KEY_ALGORITHM,
    getApiKeyEncryptionSecret(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
