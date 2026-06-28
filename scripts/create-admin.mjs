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

const adminEmail = process.env.ADMIN_EMAIL ?? "admin@estrategic.com";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Estrategic@2026!";
const adminName = process.env.ADMIN_NAME ?? "Administrador Estrategic";

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { count } = await supabase
  .from("profiles")
  .select("*", { count: "exact", head: true })
  .eq("role", "admin");

if ((count ?? 0) > 0) {
  console.log("Administrador já existe. Nenhuma ação necessária.");
  process.exit(0);
}

const { data, error } = await supabase.auth.admin.createUser({
  email: adminEmail,
  password: adminPassword,
  email_confirm: true,
  app_metadata: { role: "admin" },
  user_metadata: { nome: adminName },
});

if (error) {
  console.error("Erro ao criar admin:", error.message);
  process.exit(1);
}

await supabase.from("profiles").upsert({
  id: data.user.id,
  nome: adminName,
  role: "admin",
});

console.log("Administrador inicial criado com sucesso.");
console.log(`E-mail: ${adminEmail}`);
console.log(`Senha provisória: ${adminPassword}`);
console.log("Altere a senha após o primeiro login.");
