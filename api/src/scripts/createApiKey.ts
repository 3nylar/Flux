import { prisma } from "../lib/prisma.js";
import { generateApiKey } from "../lib/apiKeys.js";

/**
 * Create an API key from the command line:
 *
 *   npm run keys:create -- --name "My App" \
 *     --scopes sessions:read,sessions:write,webhooks:read,webhooks:write
 *
 * The raw key is printed exactly once. Store it securely.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const name = getFlag(args, "--name") ?? "Default key";
  const scopesArg =
    getFlag(args, "--scopes") ?? "sessions:read,sessions:write,webhooks:read,webhooks:write";
  const mode = (getFlag(args, "--mode") as "live" | "test") ?? "test";
  const scopes = scopesArg.split(",").map((s) => s.trim()).filter(Boolean);

  const { raw, hash, prefix } = generateApiKey(mode);

  const key = await prisma.apiKey.create({
    data: { keyHash: hash, keyPrefix: prefix, name, scopes },
  });

  console.log("\nAPI key created.\n");
  console.log(`  Name:    ${key.name}`);
  console.log(`  Scopes:  ${scopes.join(", ")}`);
  console.log(`  Key ID:  ${key.id}`);
  console.log(`\n  API KEY (shown once, store it now):\n\n    ${raw}\n`);

  await prisma.$disconnect();
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx === args.length - 1) return undefined;
  return args[idx + 1];
}

void main();
