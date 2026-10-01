import { NextRequest, NextResponse } from "next/server";
import { autenticar, exigirAdmin, responderErro } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SELECT_USUARIO } from "@/lib/consultas";
import {
  gerarSenhaTemporaria,
  normalizarEmail,
  traduzirErro,
  validarPapel,
} from "@/lib/usuarios-server";

export const runtime = "nodejs";

/** GET /api/usuarios — lista. Qualquer membro ativo lê (o ranking precisa dos nomes). */
export async function GET(req: NextRequest) {
  try {
    await autenticar(req);
    const { data, error } = await supabaseAdmin()
      .from("usuarios")
      .select(SELECT_USUARIO)
      .order("nome");
    if (error) throw new Error(error.message);
    return NextResponse.json({ usuarios: data });
  } catch (e) {
    return responderErro(e);
  }
}

/** POST /api/usuarios — cadastra vendedor. Devolve a senha temporária UMA vez. */
export async function POST(req: NextRequest) {
  try {
    const chamador = await exigirAdmin(req);
    const corpo = await req.json();

    const email = normalizarEmail(corpo.email);
    const papel = validarPapel(corpo.papel);
    const nome = String(corpo.nome ?? "").trim();
    if (!nome) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });

    const admin = supabaseAdmin();
    const senha = gerarSenhaTemporaria();

    const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
      email,
      password: senha,
      // Não há envio de e-mail configurado: sem confirmar aqui, a pessoa
      // criada não conseguiria entrar e ficaria esperando uma mensagem
      // que nunca chega.
      email_confirm: true,
      user_metadata: { nome },
    });

    if (erroAuth || !criado?.user) {
      return NextResponse.json(
        { error: traduzirErro(erroAuth?.message ?? "Falha ao criar o acesso.") },
        { status: 409 }
      );
    }

    const { data: usuario, error: erroPerfil } = await admin
      .from("usuarios")
      .insert({
        id: criado.user.id,
        email,
        nome,
        papel,
        ativo: true,
        precisa_trocar_senha: true,
        criado_por: chamador.email,
        sck: corpo.sck ? String(corpo.sck).trim() : null,
        telefone: corpo.telefone ? String(corpo.telefone).trim() : null,
      })
      .select(SELECT_USUARIO)
      .single();

    if (erroPerfil) {
      // Sem a linha em `usuarios` a conta existiria no Auth sem conseguir
      // nada — um fantasma que ainda por cima bloqueia o e-mail. Desfaz.
      await admin.auth.admin.deleteUser(criado.user.id).catch(() => {});
      return NextResponse.json({ error: traduzirErro(erroPerfil.message) }, { status: 409 });
    }

    return NextResponse.json({ usuario, senhaTemporaria: senha }, { status: 201 });
  } catch (e) {
    return responderErro(e);
  }
}
