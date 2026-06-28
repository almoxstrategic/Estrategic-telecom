import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env");
  process.exit(1);
}

const nome = process.env.TECNICO_NOME ?? "João Silva";
const matricula = (process.env.TECNICO_MATRICULA ?? "458921").replace(/\D/g, "");
const login = (process.env.TECNICO_LOGIN ?? "joao.silva").trim().toLowerCase();
const password = process.env.TECNICO_PASSWORD ?? "Campo@2026";
const authEmail = `${login}@estrategic.internal`;

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existingLogin } = await supabase
  .from("profiles")
  .select("id")
  .eq("login", login)
  .maybeSingle();

if (existingLogin) {
  console.log(`Técnico com login "${login}" já existe. Nenhuma ação necessária.`);
  process.exit(0);
}

const { data: existingMatricula } = await supabase
  .from("profiles")
  .select("id")
  .eq("identificacao", matricula)
  .maybeSingle();

if (existingMatricula) {
  console.error(`Matrícula ${matricula} já cadastrada.`);
  process.exit(1);
}

const { data, error } = await supabase.auth.admin.createUser({
  email: authEmail,
  password,
  email_confirm: true,
  app_metadata: { role: "tecnico" },
  user_metadata: { nome, identificacao: matricula, login },
});

if (error) {
  console.error("Erro ao criar técnico:", error.message);
  process.exit(1);
}

await supabase.from("profiles").upsert({
  id: data.user.id,
  nome,
  role: "tecnico",
  identificacao: matricula,
  login,
});

console.log("Técnico criado com sucesso!");
console.log(`Nome:        ${nome}`);
console.log(`Matrícula:   ${matricula}`);
console.log(`Login:       ${login}`);
console.log(`Senha:       ${password}`);
