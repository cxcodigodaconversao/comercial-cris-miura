# Comercial Cristina Miura

App do time comercial da operação da **Cristina Miura**: registro de vendas,
pontuação, ranking e metas nos eventos (IMA BH, mentorias, congressos). Usado
no celular, em pé, no salão do evento — por isso tudo é coluna única, alvo de
toque grande e fonte 16px nos campos (abaixo disso o Safari do iPhone dá zoom
sozinho ao focar).

**Next.js 15 (App Router, TypeScript) + Tailwind 4 + Supabase.**
Ver [`BANCO-DE-DADOS.md`](BANCO-DE-DADOS.md) para subir o banco do zero.

Este projeto nasceu como uma cópia do app do mesmo grupo para outro cliente
(Tubarões da Execução) — mesma arquitetura, mesmas regras testadas, marca e
identidade próprias.

## As telas

| | |
|---|---|
| **Registrar** | O closer lança a venda; a pontuação sai ao vivo, pelas regras **do evento** |
| **Ranking** | Placar em tempo real, com meta, quanto falta e projeção de fechamento |
| **Pontos** | Visão do próprio vendedor — ele não vê o volume dos colegas |
| **Vendas** | Histórico, edição, geração do texto de contrato e exportação para Excel |
| **Contrato** | Só do promotor: monta o parcelamento em campos e recebe o texto formal |
| **Links** | Links de pagamento da Hotmart por vendedor; admin gera e distribui |
| **Usuários** | Cadastrar, editar, desativar e excluir acesso (só admin) |

No menu ☰, quem vê o evento inteiro (admin/gestor) encontra também
**Análise de dados** — um atalho para o painel de Lead Score / check-in do
evento, que é um sistema à parte, fora deste app. Veja mais abaixo.

## Rodar

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev
```

A leitura de QR precisa de HTTPS. Em `localhost` funciona; em rede local, use
um túnel.

```bash
npm test        # testes das regras de negócio
npm run build
```

## Onde está a lógica que importa

Três arquivos concentram o que não pode errar, e os três são função pura,
testados sem subir tela nem banco:

**`src/lib/pontuacao.ts`** — motor de pontuação. Cada evento define as próprias
regras (`base`, `condição`, `por faixa`, `proporcional`) e elas são avaliadas
por um interpretador. Regra vem do banco, então é dado: sem `eval`, sem
`new Function`. Mudar o cálculo altera comissão de gente — por isso a suíte
de paridade.

**`src/lib/parcelamento.ts`** — plano de pagamento do contrato. Dinheiro é
comparado em **centavos**: em float, `0,1 + 0,2` acusa diferença onde não há e
o usuário vê "não bate" sem entender. Ao dividir um valor em N parcelas, a
última absorve os centavos.

**`src/lib/links.ts`** — manipulação das URLs da Hotmart. O parâmetro `sck` é
quem recebe a comissão. Trocá-lo errado desvia dinheiro em silêncio — por isso
toda manipulação passa por aqui, com testes cobrindo inclusive o link "de
casa" (sem dono), que precisa sair sem rastreio.

**`src/lib/exportar-vendas.ts`** — monta as linhas da planilha de fechamento
(Ranking, Todas as Vendas, Vendas Detalhadas e uma aba por closer). A parte
que decide o CONTEÚDO das linhas é função pura e testada; só a escrita do
.xlsx depende do navegador.

## O campo "Análise de dados" — por que fica fora do app

O painel de Lead Score / check-in de cada evento (a nota 0–92, a classe AA–F,
os filtros por perfil e comprometimento) é um sistema **separado**: um
dashboard próprio, montado a partir da planilha de inscritos e do formulário
de perfil de cada evento. Ele não compartilha banco de dados com este app —
por isso não faz sentido reescrevê-lo aqui dentro.

O que este app faz é simples: no cadastro do evento (tela de Eventos), tem um
campo **"Link do painel de análise"**, onde você cola a URL de onde aquele
dashboard estiver publicado. Preenchido, ele aparece como atalho no menu ☰,
abrindo numa aba nova. Vazio, o atalho simplesmente não aparece.

Ou seja: a cada evento, o link muda; o app só guarda o endereço.

## Detalhes que parecem estranhos e não são

- **A pontuação fica congelada na venda** (`pontos_detalhe`). Mudar a regra
  depois não reescreve o ranking sozinho.
- **`vendas.closer_nome` é desnormalizado**, mesmo havendo `usuario_id`. O
  histórico continua legível se o cadastro mudar ou sumir.
- **`links.vendedor_nome` é texto, não chave estrangeira.** A base pode trazer
  nomes que nunca existiram como usuário do app (herança do arquivo da
  Hotmart).
- **A auditoria não tem chave estrangeira para vendas.** O rastro precisa
  sobreviver à exclusão da venda, que é justamente quando ele importa.
- **O id da venda é gerado no cliente.** Dois toques no botão viram o mesmo
  registro, não duas vendas.

## Design

Tokens em `src/app/globals.css`: papel quente `#F4F2EC`, tinta `#1C1D18`,
acento teal `#0E6B66` (a cor muda com a marca do evento selecionado), serifa
no display, mono nos números. Tema claro único, por decisão de projeto.

Componentes em `src/components/ui/`. Use `.inp` para campos em vez de
utilitários soltos — ela carrega as regras que o mobile exige.

## Integrações

- **Gemini** (`src/lib/gemini.ts`) gera o texto do plano de pagamento. O modelo
  vem de `GEMINI_MODEL` e há uma fila de candidatos: modelo cravado no código
  já foi descontinuado uma vez em produção e derrubou a função em silêncio.
- **Hotmart**: só os links de pagamento, sem API. O `sck` na URL é o rastreio.

## Scripts

`scripts/` tem as ferramentas de manutenção — importar participantes por
planilha, gerar catálogo de links para um vendedor, distribuir uma oferta para
todos, corrigir código de oferta, resetar senha.

Todos são **simulação por padrão** e só gravam com `--apply`.
