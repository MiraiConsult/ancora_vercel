# 🎯 Ancóra - Sistema de Gestão Empresarial

Sistema completo de gestão empresarial com módulos de gestão financeira, comercial (CRM), tarefas, compromissos e muito mais.

## 🚀 Tecnologias

- **Frontend**: React 19 + TypeScript + Vite
- **UI**: TailwindCSS + Lucide Icons
- **Gráficos**: Recharts
- **Backend**: Supabase (PostgreSQL)
- **IA**: Google Gemini (opcional)
- **Deploy**: Vercel

## 📦 Estrutura do Projeto

```
ancora/
├── src/
│   ├── components/        # Componentes React
│   ├── lib/              # Configurações (Supabase, etc)
│   ├── services/         # Serviços (Gemini, etc)
│   ├── data/             # Dados estáticos
│   ├── App.tsx           # Componente principal
│   ├── types.ts          # Definições TypeScript
│   ├── constants.ts      # Constantes do sistema
│   └── index.tsx         # Entry point
├── index.html            # HTML principal
├── package.json          # Dependências
├── tsconfig.json         # Config TypeScript
├── vite.config.ts        # Config Vite
├── vercel.json           # Config Vercel
├── .env.example          # Exemplo de variáveis de ambiente
├── DEPLOY.md             # Guia de deploy completo
└── README.md             # Este arquivo
```

## 🛠️ Instalação Local

1. **Clone o repositório**:
```bash
git clone https://github.com/seu-usuario/ancora.git
cd ancora
```

2. **Instale as dependências**:
```bash
npm install
```

3. **Configure as variáveis de ambiente**:
```bash
cp .env.example .env.local
```

Edite `.env.local` e adicione suas credenciais do Supabase.

4. **Rode o projeto**:
```bash
npm run dev
```

Acesse: `http://localhost:5173`

## 🌐 Deploy

Veja o arquivo [DEPLOY.md](./DEPLOY.md) para instruções completas de como fazer deploy na Vercel.

## 📋 Funcionalidades

### 💼 Gestão Comercial (CRM)
- Kanban de negociações
- Gestão de empresas e contatos
- Pipeline de vendas
- Histórico de interações

### 💰 Gestão Financeira
- Lançamentos financeiros (receitas e despesas)
- DRE (Demonstração do Resultado do Exercício)
- Fluxo de Caixa
- Evolução do Caixa por Banco
- Plano de Contas
- Importação/Exportação CSV
- Categorização automática

### 📅 Tarefas e Compromissos
- Gestão de tarefas com status
- Agenda de compromissos
- Atribuição para usuários
- Filtros e busca avançada

### 👥 Gestão de Usuários
- Multi-tenant (múltiplas empresas)
- Controle de permissões
- Perfis de usuário

### 📊 Relatórios e Dashboards
- Visão geral do negócio
- Gráficos interativos
- Análises de performance
- Insights com IA (opcional)

## 🔐 Segurança

- Autenticação via Supabase Auth
- Row Level Security (RLS) no banco de dados
- Variáveis de ambiente para credenciais
- HTTPS obrigatório em produção

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto é proprietário e confidencial.

## 📞 Suporte

Para suporte, entre em contato através de: andressa_turella@hotmail.com

---

Desenvolvido com ❤️ para TaxLab Inteligência Tributária LTDA
