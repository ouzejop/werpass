import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((file) => file && existsSync(file));
const textFiles = files.filter((file) => /\.(?:ts|tsx|js|mjs|json|md|toml|ya?ml|txt|example|gitignore|gitattributes)$/i.test(file) || !file.includes('.'));
const forbidden = [
  { name: 'OpenAI key', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { name: 'Groq key', pattern: /\bgsk_[A-Za-z0-9_-]{16,}\b/ },
  { name: 'JWT token', pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'client OpenAI secret', pattern: /(?:EXPO_PUBLIC_|VITE_)OPENAI/i },
  { name: 'client Groq secret', pattern: /(?:EXPO_PUBLIC_|VITE_)GROQ/i },
  { name: 'client medical pepper', pattern: /(?:EXPO_PUBLIC_|VITE_)MEDICAL_CODE_PEPPER/i },
];
const findings = [];
for (const file of textFiles) {
  const content = readFileSync(file, 'utf8');
  for (const rule of forbidden) if (rule.pattern.test(content)) findings.push(`${file}: ${rule.name}`);
}
if (findings.length) {
  console.error(`Security scan failed:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`security scan passed (${textFiles.length} tracked text files)`);
