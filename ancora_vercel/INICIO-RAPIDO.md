# ⚡ Início Rápido - Deploy do Ancóra

## 📝 Resumo em 5 Passos

### 1️⃣ Configurar Variáveis de Ambiente

Renomeie `.env.example` para `.env.local` e adicione:

```env
VITE_SUPABASE_URL=https://ajdqvacuudavitiehopy.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2️⃣ Enviar para o GitHub

**Com GitHub Desktop:**
1. Abra GitHub Desktop
2. `File` → `Add Local Repository` → Selecione a pasta do projeto
3. `Publish repository` → Marque "Private" → `Publish`

**Ou via terminal:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/SEU-USUARIO/ancora.git
git push -u origin main
```

### 3️⃣ Conectar à Vercel

1. Acesse [vercel.com](https://vercel.com)
2. `Add New...` → `Project`
3. `Import` o repositório `ancora`

### 4️⃣ Configurar Variáveis na Vercel

Na página de configuração, adicione em **Environment Variables**:

- `VITE_SUPABASE_URL` = `https://ajdqvacuudavitiehopy.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `sua_chave_anon`

### 5️⃣ Deploy!

Clique em `Deploy` e aguarde 1-3 minutos. Pronto! 🎉

---

## 🔗 Links Importantes

- **Supabase Dashboard**: https://supabase.com/dashboard
- **Vercel Dashboard**: https://vercel.com/dashboard
- **GitHub Desktop**: https://desktop.github.com/

---

## ❓ Precisa de Ajuda?

Veja o guia completo em [DEPLOY.md](./DEPLOY.md)
