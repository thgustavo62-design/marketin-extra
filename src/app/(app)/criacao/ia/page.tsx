import Link from "next/link";
import { ImagePlus, ScanLine, ShieldCheck, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { studioAiReadiness } from "@/lib/domain/studio-ai";
import { TestImageConnection } from "./test-connection";
export default async function ImagesAi() {
  const user = await requireUser(),
    s = studioAiReadiness(process.env),
    admin = user.role === "admin";
  return (
    <>
      <header className="page-head">
        <span className="design-kicker">IMAGENS E IA</span>
        <h1>Mais possibilidades para suas criações.</h1>
        <p>
          Gere imagens a partir de uma descrição e prepare fotos com fundo
          transparente dentro do editor.
        </p>
      </header>
      <div className="design-ai-grid">
        {[
          {
            name: "Criar imagem com IA",
            ready: s.generate,
            icon: ImagePlus,
            description:
              "Descreva o visual que você precisa. A imagem gerada é adicionada à sua arte para você posicionar e editar.",
          },
          {
            name: "Remover fundo",
            ready: s.removeBg,
            icon: ScanLine,
            description:
              "Selecione uma imagem no editor e adicione uma cópia com transparência. O arquivo original é preservado.",
          },
        ].map(({ icon: Icon, ...f }) => (
          <article className="card design-ai-card" key={f.name}>
            <Icon size={28} />
            <span className={`pill ${f.ready ? "on" : "soft"}`}>
              {f.ready ? "Configurado" : "Aguardando configuração"}
            </span>
            <h2>{f.name}</h2>
            <p>{f.description}</p>
            <Link href="/criacao/projetos" className="design-text-link">
              Escolher um design <ArrowUpRight size={15} />
            </Link>
          </article>
        ))}
      </div>
      {admin ? (
        <section className="card design-ai-setup">
          <h2>Conectar o serviço de imagens</h2>
          <p>
            A chave fica somente no servidor. Configure o serviço na Vercel e
            publique novamente para aplicar as variáveis.
          </p>
          <ol>
            <li>
              Na sua conta Replicate, crie uma chave de API e confira o saldo do
              serviço.
            </li>
            <li>
              Adicione as variáveis abaixo nas configurações deste projeto na
              Vercel.
            </li>
            <li>
              Escolha versões fixas de modelos compatíveis com entrada{" "}
              <code>prompt</code> para gerar e <code>image</code> para remover
              fundo, com saída em URL de imagem.
            </li>
            <li>
              Depois da publicação, teste a conexão e faça a primeira geração
              dentro de um design.
            </li>
          </ol>
          <ul className="design-env-list">
            {[
              { key: "REPLICATE_API_TOKEN", ready: s.token },
              { key: "REPLICATE_GENERATE_VERSION", ready: s.generateModel },
              { key: "REPLICATE_REMOVE_BG_VERSION", ready: s.removeBgModel },
            ].map((v) => (
              <li key={v.key}>
                <code>{v.key}</code>
                <span>{v.ready ? "Configurada" : "Pendente"}</span>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <a
              href="https://vercel.com/thgustavo62-designs-projects/marketin-extra/settings/environment-variables"
              target="_blank"
              rel="noopener noreferrer"
              className="btn primary-link"
            >
              Configurar na Vercel <ArrowUpRight size={15} />
            </a>
            <TestImageConnection configured={s.token} />
          </div>
          <p className="muted">
            <ShieldCheck size={15} /> O teste apenas verifica a chave. Gerar
            imagens e remover fundos pode consumir créditos; o limite atual é de
            10 solicitações por usuário por hora.
          </p>
        </section>
      ) : (
        <p className="notice">
          A configuração do serviço é feita pelo administrador do workspace.
        </p>
      )}
    </>
  );
}
