"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  KeyRound,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { api } from "@/lib/api";
import { PAPEL_LABEL } from "@/lib/config";
import type { Papel, Usuario } from "@/lib/types";
import { useUsuarios } from "@/lib/useUsuarios";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, Empty } from "./ui/card";
import { Field, Input, Select } from "./ui/field";
import { Sheet } from "./ui/sheet";
import { useFeedback } from "./ui/feedback";

const PAPEIS: Papel[] = ["admin", "gestor", "closer", "promotor"];

const DESCRICAO_PAPEL: Record<Papel, string> = {
  admin: "Gere usuários, eventos e regras de pontuação. Pode excluir vendas.",
  gestor: "Vê e edita tudo do evento, mas não mexe no time nem nas regras.",
  closer: "Registra e edita as próprias vendas. Vê os próprios pontos.",
  promotor:
    "Vê as vendas de todo mundo para gerar os contratos, com o valor de cada uma. " +
    "Não vê ranking, totais nem meta, e não altera venda que não seja dele.",
};

export function Usuarios({ perfil }: { perfil: Usuario }) {
  const { toast, confirmar } = useFeedback();
  const { usuarios, carregando } = useUsuarios();

  const [busca, setBusca] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{ nome: string; senha: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = termo
      ? usuarios.filter(
          (u) => u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo)
        )
      : usuarios;
    // Desativados descem: o que interessa no dia a dia é quem está em campo.
    return [...filtrados].sort(
      (a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome)
    );
  }, [usuarios, busca]);

  const ativos = usuarios.filter((u) => u.ativo).length;

  async function alternarAtivo(u: Usuario) {
    const desativando = u.ativo;
    if (desativando) {
      const ok = await confirmar({
        titulo: `Desativar ${u.nome}?`,
        descricao: (
          <>
            A pessoa perde o acesso imediatamente, mas <strong>as vendas dela continuam</strong> no
            histórico e no ranking. Você pode reativar quando quiser.
          </>
        ),
        confirmar: "Desativar",
        perigo: true,
      });
      if (!ok) return;
    }

    setOcupado(u.id);
    try {
      await api.patch(`/api/usuarios/${u.id}`, { ativo: !u.ativo });
      toast("sucesso", desativando ? `${u.nome} foi desativado.` : `${u.nome} foi reativado.`);
    } catch (e) {
      toast("erro", "Não foi possível alterar o acesso.", (e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(u: Usuario) {
    const ok = await confirmar({
      titulo: `Excluir ${u.nome} de vez?`,
      descricao: (
        <>
          Isso apaga o acesso e o cadastro. Se a pessoa já registrou vendas, o sistema vai
          recusar — nesse caso use <strong>desativar</strong>, que preserva o histórico.
        </>
      ),
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;

    setOcupado(u.id);
    try {
      await api.del(`/api/usuarios/${u.id}`);
      toast("sucesso", `${u.nome} foi excluído.`);
    } catch (e) {
      // A guarda de vendas volta 409 com a explicação — vale mostrar inteira.
      toast("aviso", "Exclusão bloqueada", (e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function resetarSenha(u: Usuario) {
    const ok = await confirmar({
      titulo: `Gerar nova senha para ${u.nome}?`,
      descricao:
        "A senha atual deixa de funcionar na hora e as sessões abertas são encerradas. A nova é temporária: a pessoa troca no próximo acesso.",
      confirmar: "Gerar senha",
    });
    if (!ok) return;

    setOcupado(u.id);
    try {
      const r = await api.post<{ senhaTemporaria: string }>(`/api/usuarios/${u.id}/senha`);
      setSenhaGerada({ nome: u.nome, senha: r.senhaTemporaria });
    } catch (e) {
      toast("erro", "Não foi possível gerar a senha.", (e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="eyebrow">Equipe</p>
            <span className="num text-xs text-muted-foreground">
              {ativos} ativo{ativos !== 1 ? "s" : ""} · {usuarios.length} no total
            </span>
          </div>

          <Button full size="lg" onClick={() => setFormAberto(true)}>
            <UserPlus className="h-5 w-5" /> Cadastrar vendedor
          </Button>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou e-mail"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {carregando ? (
            <Empty>Carregando equipe...</Empty>
          ) : !lista.length ? (
            <Empty>Ninguém encontrado.</Empty>
          ) : (
            lista.map((u) => {
              const euMesmo = u.id === perfil.id;
              return (
                <div
                  key={u.id}
                  className="border-b border-border py-3.5 last:border-0"
                  style={{ opacity: u.ativo ? 1 : 0.6 }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-medium">{u.nome}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!u.ativo && <Badge tone="danger">desativado</Badge>}
                      {u.precisaTrocarSenha && u.ativo && (
                        <Badge tone="warning">senha temporária</Badge>
                      )}
                      <Badge tone={u.papel === "admin" ? "accent" : "neutral"}>
                        {PAPEL_LABEL[u.papel]}
                      </Badge>
                    </div>
                  </div>

                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  {u.sck && (
                    <p className="num mt-0.5 text-[11px] text-muted-foreground">sck: {u.sck}</p>
                  )}

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditando(u)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={ocupado === u.id}
                      onClick={() => resetarSenha(u)}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Nova senha
                    </Button>
                    {!euMesmo && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={ocupado === u.id}
                          onClick={() => alternarAtivo(u)}
                        >
                          {u.ativo ? (
                            <>
                              <UserRoundX className="h-3.5 w-3.5" /> Desativar
                            </>
                          ) : (
                            <>
                              <UserRoundCheck className="h-3.5 w-3.5" /> Reativar
                            </>
                          )}
                        </Button>
                        <Button
                          variant="danger-outline"
                          size="icon-sm"
                          aria-label={`Excluir ${u.nome}`}
                          disabled={ocupado === u.id}
                          onClick={() => excluir(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {(formAberto || editando) && (
        <FormUsuario
          usuario={editando}
          onClose={() => {
            setFormAberto(false);
            setEditando(null);
          }}
          onCriado={(nome, senha) => {
            setFormAberto(false);
            setSenhaGerada({ nome, senha });
          }}
        />
      )}

      {senhaGerada && <SenhaTemporaria dados={senhaGerada} onClose={() => setSenhaGerada(null)} />}
    </>
  );
}

// ── Cadastro / edição ───────────────────────────────────────────────────

function FormUsuario({
  usuario,
  onClose,
  onCriado,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onCriado: (nome: string, senha: string) => void;
}) {
  const { toast } = useFeedback();
  const editando = !!usuario;

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [papel, setPapel] = useState<Papel>(usuario?.papel ?? "closer");
  const [sck, setSck] = useState(usuario?.sck ?? "");
  const [telefone, setTelefone] = useState(usuario?.telefone ?? "");
  const [busy, setBusy] = useState(false);

  async function salvar() {
    if (!nome.trim()) return toast("aviso", "Informe o nome.");
    if (!editando && !email.trim()) return toast("aviso", "Informe o e-mail.");

    setBusy(true);
    try {
      if (editando) {
        await api.patch(`/api/usuarios/${usuario!.id}`, { nome, papel, sck, telefone });
        toast("sucesso", "Cadastro atualizado.");
        onClose();
      } else {
        const r = await api.post<{ senhaTemporaria: string }>("/api/usuarios", {
          nome,
          email,
          papel,
          sck,
          telefone,
        });
        onCriado(nome.trim(), r.senhaTemporaria);
      }
    } catch (e) {
      toast(
        "erro",
        editando ? "Não foi possível salvar." : "Não foi possível cadastrar.",
        (e as Error).message
      );
      setBusy(false);
    }
  }

  return (
    <Sheet
      titulo={editando ? `Editar ${usuario!.nome}` : "Cadastrar vendedor"}
      onClose={onClose}
      rodape={
        <Button size="lg" full disabled={busy} onClick={salvar}>
          {busy ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar e gerar senha"}
        </Button>
      }
    >
      <Field label="Nome">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome e sobrenome"
        />
      </Field>

      <Field
        label="E-mail"
        hint={
          editando ? "O e-mail não pode ser alterado — ele é a identidade do acesso." : undefined
        }
      >
        <Input
          type="email"
          inputMode="email"
          value={email}
          disabled={editando}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pessoa@empresa.com.br"
        />
      </Field>

      <Field label="Papel" hint={DESCRICAO_PAPEL[papel]}>
        <Select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {PAPEL_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Token sck (opcional)"
        hint="Identificador do vendedor nos links da Hotmart, usado para rastrear a venda."
      >
        <Input value={sck} onChange={(e) => setSck(e.target.value)} placeholder="Ex: Everton" />
      </Field>

      <Field label="Telefone (opcional)">
        <Input
          type="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
      </Field>

      {!editando && (
        <p className="mt-1 rounded-lg border border-border tint p-3 text-xs leading-relaxed">
          O sistema gera uma senha temporária e mostra na tela. Ela aparece{" "}
          <strong>uma única vez</strong> — anote antes de fechar. A pessoa troca no primeiro acesso.
        </p>
      )}
    </Sheet>
  );
}

// ── Senha temporária ────────────────────────────────────────────────────

function SenhaTemporaria({
  dados,
  onClose,
}: {
  dados: { nome: string; senha: string };
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  return (
    <Sheet
      titulo="Senha temporária"
      onClose={onClose}
      rodape={
        <Button size="lg" full onClick={onClose}>
          Já anotei, fechar
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Passe esta senha para <strong className="text-foreground">{dados.nome}</strong>. Ela vai ser
        obrigada a criar uma senha própria no primeiro acesso.
      </p>

      <div className="my-4 rounded-lg border border-border-strong bg-background p-4 text-center">
        <div className="num select-all text-2xl font-semibold tracking-wider">{dados.senha}</div>
      </div>

      <Button
        variant="outline"
        full
        onClick={async () => {
          await navigator.clipboard.writeText(dados.senha);
          toast("sucesso", "Senha copiada.");
        }}
      >
        <Copy className="h-4 w-4" /> Copiar senha
      </Button>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Esta senha não fica guardada em lugar nenhum e não dá para consultar depois. Se perder, gere
        outra em <strong>Nova senha</strong>.
      </p>
    </Sheet>
  );
}
