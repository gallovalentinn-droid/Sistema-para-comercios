import { createClient } from "npm:@supabase/supabase-js@2.111.0";

import {
  internalEmail,
  jsonResponse,
  normalizeLoginText,
  runEmployeeCreation,
} from "../_shared/f5-auth-core.mjs";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

function envFirst(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

function respond(body: unknown, status = 200): Response {
  return jsonResponse(body, status, corsHeaders);
}

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizedUsername(value: unknown): string {
  const result = normalizeLoginText(value);
  return /^[a-z0-9._-]{1,80}$/.test(result) ? result : "";
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function safePermissions(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.values(value).some((permission) => typeof permission !== "boolean")) return null;
  return value as Record<string, boolean>;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return respond({ code: "METODO_NO_PERMITIDO" }, 405);

  const url = envFirst("SUPABASE_URL");
  const publishableKey = envFirst("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  const secretKey = envFirst("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !secretKey) {
    return respond({ code: "SERVICIO_NO_CONFIGURADO", message: "La gestión de personas no está disponible." }, 503);
  }

  const token = bearerToken(request);
  if (!token) return respond({ code: "SESION_REQUERIDA", message: "Iniciá sesión nuevamente." }, 401);

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const serviceClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const actorUserId = claimsData?.claims?.sub;
    if (claimsError || !isUuid(actorUserId)) {
      return respond({ code: "SESION_INVALIDA", message: "Iniciá sesión nuevamente." }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return respond({ code: "DATOS_INVALIDOS", message: "Revisá los datos ingresados." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body) || !isUuid(body.comercioId)) {
      return respond({ code: "DATOS_INVALIDOS", message: "Revisá los datos ingresados." }, 400);
    }

    const comercioId = body.comercioId;
    const { data: actorMembership, error: actorError } = await userClient.rpc(
      "f5_miembro_actual",
      { p_comercio_id: comercioId },
    );
    if (actorError || !actorMembership || !["duenio", "admin"].includes(actorMembership.rol)) {
      return respond({ code: "SIN_PERMISO", message: "No tenés permiso para gestionar personas." }, 403);
    }

    if (body.accion === "codigo_comercio") {
      const { data, error } = await serviceClient.rpc("f5_service_codigo_comercio", {
        p_actor_user_id: actorUserId,
        p_comercio_id: comercioId,
      });
      if (error || typeof data !== "string") throw new Error("F5_CODE_FAILED");
      return respond({ comercio: data });
    }

    if (body.accion === "listar") {
      const cursor = body.cursor && typeof body.cursor === "object" && !Array.isArray(body.cursor)
        ? body.cursor as Record<string, unknown>
        : null;
      const cursorCreatedAt = cursor && typeof cursor.created_at === "string" ? cursor.created_at : null;
      const cursorUserId = cursor && isUuid(cursor.user_id) ? cursor.user_id : null;
      if ((cursorCreatedAt === null) !== (cursorUserId === null)
        || (cursorCreatedAt !== null && !Number.isFinite(Date.parse(cursorCreatedAt)))) {
        return respond({ code: "CURSOR_INVALIDO", message: "Volvé a cargar la lista." }, 400);
      }
      const requestedLimit = Number(body.limite ?? 50);
      const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
      const { data, error } = await serviceClient.rpc("f5_service_listar_miembros", {
        p_actor_user_id: actorUserId,
        p_comercio_id: comercioId,
        p_after_created_at: cursorCreatedAt,
        p_after_user_id: cursorUserId,
        p_limit: limit,
      });
      if (error || !data || !Array.isArray(data.items)) throw new Error("F5_ROSTER_FAILED");
      return respond(data);
    }

    if (body.accion === "crear") {
      const usuario = normalizedUsername(body.usuario);
      const permisos = safePermissions(body.permisos);
      const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
      if (!usuario || !validPassword(body.clave) || !permisos || !nombre || nombre.length > 120) {
        return respond({ code: "DATOS_INVALIDOS", message: "Revisá usuario, clave, nombre y permisos." }, 400);
      }
      const email = internalEmail();
      try {
        const result = await runEmployeeCreation(
          {
            createAuthUser: async () => {
              const { data, error } = await serviceClient.auth.admin.createUser({
                email,
                password: body.clave as string,
                email_confirm: true,
              });
              if (error || !data.user) throw new Error("F5_AUTH_CREATE_FAILED");
              return data.user;
            },
            persistMembership: async (authUser: { id: string }) => {
              const { data, error } = await serviceClient.rpc("f5_service_crear_empleado", {
                p_actor_user_id: actorUserId,
                p_comercio_id: comercioId,
                p_new_user_id: authUser.id,
                p_usuario_normalizado: usuario,
                p_internal_email: email,
                p_nombre_mostrado: nombre,
                p_permisos: permisos,
              });
              if (error || !data) throw new Error("F5_MEMBERSHIP_CREATE_FAILED");
              return data;
            },
            deleteAuthUser: async (userId: string) => {
              const { error } = await serviceClient.auth.admin.deleteUser(userId);
              if (error) throw new Error("F5_AUTH_COMPENSATION_FAILED");
            },
          },
          { usuario, clave: body.clave, nombre, permisos },
        );
        return respond(result, 201);
      } catch (error) {
        if (error instanceof AggregateError) {
          return respond({ code: "REQUIERE_SOPORTE", message: "No se pudo completar el alta. Contactá a soporte." }, 503);
        }
        return respond({ code: "ALTA_NO_COMPLETADA", message: "No se pudo crear el usuario. Revisá si ya existe." }, 409);
      }
    }

    if (body.accion === "restablecer_clave") {
      const usuario = normalizedUsername(body.usuario);
      if (!usuario || !validPassword(body.clave)) {
        return respond({ code: "DATOS_INVALIDOS", message: "Revisá el usuario y la nueva clave." }, 400);
      }
      const { data: targetUserId, error: resolveError } = await serviceClient.rpc(
        "f5_service_resolver_empleado",
        {
          p_actor_user_id: actorUserId,
          p_comercio_id: comercioId,
          p_usuario_normalizado: usuario,
        },
      );
      if (resolveError || !isUuid(targetUserId)) {
        return respond({ code: "EMPLEADO_NO_ENCONTRADO", message: "No encontramos ese empleado." }, 404);
      }
      const { error: updateError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
        password: body.clave,
      });
      if (updateError) throw new Error("F5_PASSWORD_RESET_FAILED");
      return respond({ ok: true });
    }

    return respond({ code: "ACCION_INVALIDA", message: "La acción solicitada no existe." }, 400);
  } catch {
    return respond({ code: "SERVICIO_NO_DISPONIBLE", message: "No pudimos completar la operación." }, 503);
  }
});
