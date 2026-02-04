# 🚀 Guia de Deploy do Ancóra na Vercel

Este guia mostra como fazer o deploy do sistema Ancóra na Vercel usando GitHub.

---

## 📋 Pré-requisitos

1. **Conta no GitHub** - [Criar conta](https://github.com/join)
2. **Conta na Vercel** - [Criar conta](https://vercel.com/signup)
3. **GitHub Desktop** (opcional, mas recomendado) - [Download](https://desktop.github.com/)
4. **Conta no Supabase** com projeto configurado

---

## 🔧 Passo 1: Configurar Variáveis de Ambiente

Antes de fazer o deploy, você precisa configurar as variáveis de ambiente do Supabase.

### 1.1 Obter credenciais do Supabase

1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. Vá em **Settings** → **API**
4. Copie:
   - **Project URL** (ex: `https://ajdqvacuudavitiehopy.supabase.co`)
   - **anon public** key (a chave pública)

### 1.2 Criar arquivo .env.local

1. Renomeie o arquivo `.env.example` para `.env.local`
2. Edite o arquivo e adicione suas credenciais:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui
VITE_GEMINI_API_KEY=sua_chave_gemini_aqui (opcional)
```

**⚠️ IMPORTANTE**: O arquivo `.env.local` NÃO deve ser enviado para o GitHub (já está no .gitignore).

---

## 📦 Passo 2: Enviar Código para o GitHub

### Opção A: Usando GitHub Desktop (Recomendado)

1. **Abra o GitHub Desktop**

2. **Criar novo repositório**:
   - Clique em `File` → `New Repository`
   - Nome: `ancora`
   - Descrição: `Sistema de Gestão Empresarial`
   - Local: Selecione a pasta onde você extraiu o projeto
   - Marque: ✅ Initialize this repository with a README
   - Clique em `Create Repository`

3. **Adicionar arquivos**:
   - O GitHub Desktop vai detectar automaticamente todos os arquivos
   - Você verá a lista de arquivos no painel esquerdo

4. **Fazer o primeiro commit**:
   - No campo "Summary", escreva: `Initial commit - Sistema Ancóra`
   - Clique em `Commit to main`

5. **Publicar no GitHub**:
   - Clique em `Publish repository`
   - Escolha:
     - ✅ Keep this code private (recomendado)
     - Nome: `ancora`
   - Clique em `Publish Repository`

### Opção B: Usando Git pela linha de comando

```bash
# 1. Inicializar repositório
git init

# 2. Adicionar todos os arquivos
git add .

# 3. Fazer o primeiro commit
git commit -m "Initial commit - Sistema Ancóra"

# 4. Criar repositório no GitHub
# Acesse https://github.com/new e crie um repositório chamado "ancora"

# 5. Conectar ao repositório remoto
git remote add origin https://github.com/SEU-USUARIO/ancora.git

# 6. Enviar código
git branch -M main
git push -u origin main
```

---

## 🌐 Passo 3: Deploy na Vercel

### 3.1 Conectar GitHub à Vercel

1. Acesse [https://vercel.com](https://vercel.com)
2. Faça login (pode usar sua conta do GitHub)
3. Clique em `Add New...` → `Project`
4. Clique em `Import Git Repository`
5. Autorize a Vercel a acessar seus repositórios do GitHub
6. Selecione o repositório `ancora`

### 3.2 Configurar o Projeto

1. **Framework Preset**: Vercel deve detectar automaticamente como `Vite`
2. **Root Directory**: Deixe como `.` (raiz)
3. **Build Command**: `npm run build` (já configurado)
4. **Output Directory**: `dist` (já configurado)

### 3.3 Adicionar Variáveis de Ambiente

**⚠️ PASSO CRÍTICO**: Antes de fazer o deploy, adicione as variáveis de ambiente:

1. Na página de configuração do projeto, role até **Environment Variables**
2. Adicione as seguintes variáveis:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://seu-projeto.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sua_chave_anon_aqui` |
| `VITE_GEMINI_API_KEY` | `sua_chave_gemini_aqui` (opcional) |

3. Clique em `Add` para cada variável

### 3.4 Fazer o Deploy

1. Clique em `Deploy`
2. Aguarde o build (leva 1-3 minutos)
3. Quando terminar, você verá: 🎉 **Congratulations!**
4. Clique em `Visit` para acessar seu site

---

## ✅ Passo 4: Verificar o Deploy

1. Acesse a URL fornecida pela Vercel (ex: `https://ancora.vercel.app`)
2. Teste o login com suas credenciais do Supabase
3. Verifique se os dados estão carregando corretamente

---

## 🔄 Atualizações Futuras

Sempre que você fizer alterações no código:

### Usando GitHub Desktop:

1. Abra o GitHub Desktop
2. Você verá as mudanças no painel esquerdo
3. Escreva uma descrição do que mudou
4. Clique em `Commit to main`
5. Clique em `Push origin`
6. **A Vercel fará o deploy automaticamente!** ✨

### Usando Git:

```bash
git add .
git commit -m "Descrição das mudanças"
git push
```

---

## 🎯 Domínio Personalizado (Opcional)

Para usar seu próprio domínio (ex: `sistema.suaempresa.com`):

1. Na Vercel, vá em **Settings** → **Domains**
2. Clique em `Add`
3. Digite seu domínio
4. Siga as instruções para configurar o DNS

---

## 🐛 Solução de Problemas

### Erro: "Build failed"

- Verifique se as variáveis de ambiente estão configuradas corretamente
- Verifique os logs de build na Vercel

### Erro: "Cannot connect to Supabase"

- Verifique se `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão corretas
- Verifique se as políticas RLS do Supabase estão configuradas

### Dados não aparecem

- Verifique se você está usando o mesmo tenant_id
- Verifique as políticas de segurança (RLS) no Supabase

---

## 📞 Suporte

Se tiver problemas:

1. Verifique os logs na Vercel: **Deployments** → Clique no deployment → **View Function Logs**
2. Verifique o console do navegador (F12)
3. Verifique os logs do Supabase

---

## 🎉 Pronto!

Seu sistema Ancóra está agora rodando na Vercel! 🚀

**URL de produção**: A Vercel fornecerá uma URL como `https://ancora-seu-usuario.vercel.app`

Qualquer commit que você fizer no GitHub será automaticamente deployado na Vercel!
