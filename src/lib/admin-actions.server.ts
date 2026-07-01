import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  loginSchema,
  loginToAuthEmail,
  matriculaSchema,
  normalizeLogin,
  normalizeMatricula,
} from "./auth-identificacao";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "./server-env";

function getServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Valida o JWT do admin com a anon key — não usar service_role aqui. */
function getAuthedClient(accessToken: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function assertAdmin(accessToken: string) {
  const client = getAuthedClient(accessToken);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("Sessão inválida. Faça login novamente como administrador.");
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    throw new Error("Acesso restrito a administradores.");
  }

  return user;
}

const withToken = z.object({
  accessToken: z.string().min(1),
});

const matriculaField = z
  .string()
  .transform((v) => normalizeMatricula(v))
  .refine((v) => matriculaSchema.test(v), {
    message: "Matrícula deve ser alfanumérica (2 a 20 caracteres, ex: Z628337).",
  });

const celularField = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 10 || v.length === 11, {
    message: "Celular inválido. Use DDD + número (10 ou 11 dígitos).",
  });

const loginField = z
  .string()
  .transform((v) => normalizeLogin(v))
  .refine((v) => loginSchema.test(v), {
    message: "Login inválido. Use 3–30 caracteres (letras, números, . _ -).",
  });

export const createUserAccount = createServerFn({ method: "POST" })
  .validator(
    withToken.extend({
      identificacao: matriculaField,
      celular: celularField,
      login: loginField,
      password: z.string().min(6),
      nome: z.string().min(2),
      role: z.enum(["admin", "tecnico"]).default("tecnico"),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin(data.accessToken);
    const supabase = getServiceClient();
    const matricula = normalizeMatricula(data.identificacao);
    const login = normalizeLogin(data.login);
    const authEmail = loginToAuthEmail(login);

    const { data: existingLogin } = await supabase
      .from("profiles")
      .select("id")
      .eq("login", login)
      .maybeSingle();

    if (existingLogin) throw new Error("Este login já está em uso.");

    const { data: existingMatricula } = await supabase
      .from("profiles")
      .select("id")
      .eq("identificacao", matricula)
      .maybeSingle();

    if (existingMatricula) throw new Error("Esta matrícula já está cadastrada.");

    const { data: created, error } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: data.password,
      email_confirm: true,
      app_metadata: { role: data.role },
      user_metadata: { nome: data.nome, identificacao: matricula, login },
    });

    if (error) {
      if (error.message.toLowerCase().includes("invalid api key")) {
        throw new Error(
          "Chave service_role inválida no servidor. Verifique SUPABASE_SERVICE_ROLE_KEY no .env e reinicie o npm run dev.",
        );
      }
      throw new Error(error.message);
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: created.user.id,
      nome: data.nome,
      role: data.role,
      identificacao: matricula,
      login,
      celular: data.celular,
    });

    if (profileError) throw new Error(profileError.message);

    return { id: created.user.id, login, identificacao: matricula };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .validator(
    withToken.extend({
      login: loginField,
      password: z.string().min(6),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin(data.accessToken);
    const supabase = getServiceClient();
    const login = normalizeLogin(data.login);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("login", login)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) throw new Error("Usuário não encontrado.");

    const { error } = await supabase.auth.admin.updateUserById(profile.id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const createInitialAdmin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      nome: z.string().min(2),
      setupSecret: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    const expectedSecret = process.env.ADMIN_SETUP_SECRET ?? "estrategic-setup-2026";
    if (data.setupSecret !== expectedSecret) {
      throw new Error("Setup secret inválido.");
    }

    const supabase = getServiceClient();
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) throw countError;
    if ((count ?? 0) > 0) throw new Error("Administrador inicial já existe.");

    const { data: created, error } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      app_metadata: { role: "admin" },
      user_metadata: { nome: data.nome },
    });
    if (error) throw new Error(error.message);

    await supabase.from("profiles").upsert({
      id: created.user.id,
      nome: data.nome,
      role: "admin",
    });

    return { email: data.email };
  });
