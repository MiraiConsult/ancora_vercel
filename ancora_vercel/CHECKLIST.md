# ✅ Checklist de Deploy - Ancóra

Use este checklist para garantir que tudo está configurado corretamente.

## 📋 Antes do Deploy

### Configuração Local

- [ ] Extrair o arquivo `ancora-vercel-deploy.zip`
- [ ] Renomear `.env.example` para `.env.local`
- [ ] Adicionar `VITE_SUPABASE_URL` no `.env.local`
- [ ] Adicionar `VITE_SUPABASE_ANON_KEY` no `.env.local`
- [ ] (Opcional) Adicionar `VITE_GEMINI_API_KEY` no `.env.local`

### Teste Local (Opcional)

- [ ] Rodar `npm install`
- [ ] Rodar `npm run dev`
- [ ] Acessar `http://localhost:5173`
- [ ] Testar login
- [ ] Verificar se dados carregam

## 🐙 GitHub

### Criar Repositório

- [ ] Criar conta no GitHub (se não tiver)
- [ ] Instalar GitHub Desktop (recomendado)
- [ ] Criar novo repositório chamado `ancora`
- [ ] Marcar como **Private** (recomendado)

### Enviar Código

- [ ] Adicionar todos os arquivos
- [ ] Fazer commit inicial: "Initial commit - Sistema Ancóra"
- [ ] Publicar repositório no GitHub
- [ ] Verificar se o código aparece no GitHub.com

## 🚀 Vercel

### Criar Conta e Projeto

- [ ] Criar conta na Vercel (pode usar conta do GitHub)
- [ ] Clicar em `Add New...` → `Project`
- [ ] Conectar com GitHub
- [ ] Selecionar repositório `ancora`

### Configurar Deploy

- [ ] Verificar Framework: `Vite` ✅
- [ ] Verificar Build Command: `npm run build` ✅
- [ ] Verificar Output Directory: `dist` ✅

### Variáveis de Ambiente (CRÍTICO!)

- [ ] Adicionar `VITE_SUPABASE_URL`
- [ ] Adicionar `VITE_SUPABASE_ANON_KEY`
- [ ] (Opcional) Adicionar `VITE_GEMINI_API_KEY`

### Deploy

- [ ] Clicar em `Deploy`
- [ ] Aguardar build (1-3 minutos)
- [ ] Verificar se build passou ✅

## 🧪 Teste em Produção

### Verificações Básicas

- [ ] Acessar URL da Vercel (ex: `https://ancora-xxx.vercel.app`)
- [ ] Página carrega sem erros
- [ ] Login funciona
- [ ] Dados do Supabase carregam

### Verificações Detalhadas

- [ ] Módulo Financeiro funciona
- [ ] Módulo de Negociações funciona
- [ ] Módulo de Empresas funciona
- [ ] Módulo de Tarefas funciona
- [ ] Importação CSV funciona
- [ ] Gráficos aparecem corretamente

## 🔄 Atualizações Futuras

### Processo de Atualização

- [ ] Fazer alterações no código local
- [ ] Commit no GitHub Desktop
- [ ] Push para GitHub
- [ ] Vercel faz deploy automático ✨
- [ ] Verificar deploy na Vercel Dashboard

## 🐛 Se Algo Der Errado

### Build Failed

- [ ] Verificar logs na Vercel
- [ ] Verificar se variáveis de ambiente estão corretas
- [ ] Verificar se `package.json` está correto

### Erro de Conexão com Supabase

- [ ] Verificar `VITE_SUPABASE_URL`
- [ ] Verificar `VITE_SUPABASE_ANON_KEY`
- [ ] Verificar políticas RLS no Supabase

### Dados Não Aparecem

- [ ] Abrir console do navegador (F12)
- [ ] Verificar erros no console
- [ ] Verificar se tenant_id está correto
- [ ] Verificar políticas RLS no Supabase

## 📞 Precisa de Ajuda?

- 📖 Veja o guia completo: [DEPLOY.md](./DEPLOY.md)
- ⚡ Veja o início rápido: [INICIO-RAPIDO.md](./INICIO-RAPIDO.md)
- 📧 Contato: andressa_turella@hotmail.com

---

## 🎉 Tudo Pronto?

Se todos os checkboxes estão marcados, parabéns! 🎊

Seu sistema Ancóra está rodando em produção na Vercel!

**Próximos passos:**
- Configurar domínio personalizado (opcional)
- Adicionar mais usuários no Supabase
- Importar dados históricos
- Treinar equipe no sistema
