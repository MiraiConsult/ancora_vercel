// FIX: The content of this file is SQL, not TypeScript.
// To fix the compilation errors, the content has been wrapped in a template string and exported.
export const databaseSchemaScript = `
-- SCRIPT DE CONFIGURAÇÃO v16: PERMISSÕES & FUNIL CUSTOMIZÁVEL
-- Adiciona a tabela deal_stages e a coluna permissions para perfis.
-- Copie TUDO e execute no SQL Editor do Supabase.

-- 1. HABILITAR EXTENSÃO
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CRIAÇÃO DE TABELAS (SCHEMA ATUALIZADO)

CREATE TABLE IF NOT EXISTS public.organization_settings ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name text, plan text, sector text, website text, email text, description text );
CREATE TABLE IF NOT EXISTS public.profiles ( id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, tenant_id UUID NOT NULL REFERENCES public.organization_settings(id) ON DELETE CASCADE, name text, role text, email text, avatar text, permissions jsonb );
ALTER TABLE public.profiles DROP COLUMN IF EXISTS "accessLevel";
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb;


DO $$ BEGIN IF EXISTS(SELECT * FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN ALTER TABLE public.companies RENAME TO clients; END IF; END $$;
CREATE TABLE IF NOT EXISTS public.clients ( id text PRIMARY KEY, tenant_id UUID, name text NOT NULL, cnpj text, sector text, segment text, status text, location text, notes jsonb DEFAULT '[]'::jsonb );
ALTER TABLE public.clients DROP COLUMN IF EXISTS "ownerId";
CREATE TABLE IF NOT EXISTS public.contacts ( id text PRIMARY KEY, tenant_id UUID, name text NOT NULL, role text, email text, phone text, "companyId" text );
CREATE TABLE IF NOT EXISTS public.deals ( id text PRIMARY KEY, tenant_id UUID, title text NOT NULL, value numeric DEFAULT 0, stage text, "companyId" text, probability numeric, "lastActivity" text, temperature text, description text, products text[], "contactId" text, history jsonb DEFAULT '[]'::jsonb );
ALTER TABLE public.deals DROP COLUMN IF EXISTS owners;
CREATE TABLE IF NOT EXISTS public.tasks ( id text PRIMARY KEY DEFAULT uuid_generate_v4()::text, tenant_id UUID, title text NOT NULL, description text, type text, "dueDate" text, "createdAt" text, "completedAt" text, priority text, status text, archived boolean, "relatedTo" text, "companyId" text, "meetLink" text );
ALTER TABLE public.tasks DROP COLUMN IF EXISTS assignee;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS "collaboratorIds";
ALTER TABLE public.tasks DROP COLUMN IF EXISTS attendees;
CREATE TABLE IF NOT EXISTS public.financial_records ( id text PRIMARY KEY, tenant_id UUID, description text NOT NULL, amount numeric DEFAULT 0, type text, status text, "dueDate" text, "competenceDate" text, "paymentDate" text, category text, "companyId" text, "rubricId" text, "revenueTypeId" text, "bankId" text, "needsValidation" boolean, "dealId" text, "seriesId" text );
ALTER TABLE public.financial_records ADD COLUMN IF NOT EXISTS "seriesId" text;

CREATE TABLE IF NOT EXISTS public.general_notes ( id text PRIMARY KEY, tenant_id UUID, title text, content text, date text, author text, category text, color text, "companyId" text, "companyName" text );
ALTER TABLE public.general_notes DROP COLUMN IF EXISTS "userId";
ALTER TABLE public.general_notes DROP COLUMN IF EXISTS "collaboratorIds";
CREATE TABLE IF NOT EXISTS public.notifications ( id text PRIMARY KEY, tenant_id UUID, title text NOT NULL, message text, type text, "entityType" text, "entityId" text, "createdAt" text, read boolean );
ALTER TABLE public.notifications DROP COLUMN IF EXISTS "userId";

CREATE TABLE IF NOT EXISTS public.banks ( id text PRIMARY KEY, tenant_id UUID, name text NOT NULL, agency text, account text, "initialBalance" numeric );
CREATE TABLE IF NOT EXISTS public.revenue_types ( id text PRIMARY KEY, tenant_id UUID, name text NOT NULL );
CREATE TABLE IF NOT EXISTS public.sectors ( id text PRIMARY KEY, tenant_id UUID, name text NOT NULL );
CREATE TABLE IF NOT EXISTS public.segments ( id text PRIMARY KEY, tenant_id UUID, name text NOT NULL );
CREATE TABLE IF NOT EXISTS public.deal_stages ( id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id UUID, name TEXT NOT NULL, "order" INTEGER NOT NULL, is_fixed BOOLEAN DEFAULT false, is_visible BOOLEAN DEFAULT true );

CREATE TABLE IF NOT EXISTS public.chart_of_accounts ( id text, tenant_id UUID, "classificationCode" text, "classificationName" text, "centerCode" text, "centerName" text, "rubricCode" text, "rubricName" text );
ALTER TABLE public.chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_pkey;
ALTER TABLE public.chart_of_accounts ADD PRIMARY KEY (id);

-- Função de migração para garantir que tabelas antigas tenham tenant_id
CREATE OR REPLACE FUNCTION public.ensure_tenant_column(p_table_name text) RETURNS void AS $$ BEGIN EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID;', p_table_name); END; $$ LANGUAGE plpgsql;
DO $$ DECLARE tbl_name text; BEGIN FOR tbl_name IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != 'organization_settings' LOOP PERFORM public.ensure_tenant_column(tbl_name); END LOOP; END $$;

-- 3. FUNÇÃO HELPER PARA OBTER O TENANT_ID (CORRIGIDA)
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id', '')::uuid;
$$;

-- 4. FUNÇÃO PARA DELETAR USUÁRIOS
CREATE OR REPLACE FUNCTION delete_user_in_tenant(user_id_to_delete UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_id UUID;
    admin_tenant_id UUID;
    admin_role TEXT;
    target_tenant_id UUID;
BEGIN
    admin_id := auth.uid();
    SELECT tenant_id, "role" INTO admin_tenant_id, admin_role
    FROM public.profiles WHERE id = admin_id;

    IF admin_role IS NULL OR admin_role != 'admin' THEN
      RAISE EXCEPTION 'Permission denied: You must be an administrator.';
    END IF;

    IF admin_id = user_id_to_delete THEN
      RAISE EXCEPTION 'Administrators cannot delete their own account.';
    END IF;

    SELECT tenant_id INTO target_tenant_id
    FROM public.profiles WHERE id = user_id_to_delete;
    
    IF target_tenant_id IS NULL THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    IF target_tenant_id != admin_tenant_id THEN
        RAISE EXCEPTION 'Permission denied: Cannot delete users from another organization.';
    END IF;

    DELETE FROM auth.users WHERE id = user_id_to_delete;

    RETURN json_build_object('status', 'success', 'deleted_user_id', user_id_to_delete);
END;
$$;


-- 5. TRIGGER DE NOVOS USUÁRIOS (ATUALIZADO)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_tenant_id UUID;
  company_name_text text;
BEGIN
  company_name_text := new.raw_user_meta_data->>'company_name';
  IF company_name_text IS NULL THEN
    RETURN new;
  END IF;

  INSERT INTO public.organization_settings (name, email) VALUES (company_name_text, new.email) RETURNING id INTO new_tenant_id;
  INSERT INTO public.profiles (id, tenant_id, name, email, role, avatar) VALUES (new.id, new_tenant_id, company_name_text, new.email, 'admin', SUBSTRING(company_name_text FROM 1 FOR 2));
  UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('tenant_id', new_tenant_id) WHERE id = new.id;
  
  -- INSERIR DEAL STAGES PADRÃO PARA NOVO TENANT
  INSERT INTO public.deal_stages (tenant_id, name, "order", is_fixed, is_visible) VALUES
    (new_tenant_id, 'Prospecção', 1, false, true),
    (new_tenant_id, 'Qualificação', 2, false, true),
    (new_tenant_id, 'Proposta', 3, false, true),
    (new_tenant_id, 'Negociação', 4, false, true),
    (new_tenant_id, 'Fechado (Ganho)', 5, true, true),
    (new_tenant_id, 'Perdido', 6, true, false);

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 6. TRIGGER PARA AUTO-POPULAR TENANT_ID
CREATE OR REPLACE FUNCTION public.set_record_tenant_id() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tenant_id := public.get_my_tenant_id();
  RETURN NEW;
END;
$$;

DO $$ 
DECLARE tbl text; 
BEGIN 
    FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT IN ('organization_settings', 'profiles') LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_on_%1$s_insert ON public.%1$I', tbl);
        EXECUTE format('CREATE TRIGGER set_tenant_id_on_%1$s_insert BEFORE INSERT ON public.%1$I FOR EACH ROW EXECUTE PROCEDURE public.set_record_tenant_id()', tbl);
    END LOOP; 
END $$;


-- 7. HABILITAR E APLICAR RLS (ATUALIZADO)
DO $$ DECLARE tbl text; BEGIN FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl); END LOOP; END $$;

DROP POLICY IF EXISTS "Allow users to manage their own organization" ON public.organization_settings;
CREATE POLICY "Allow users to manage their own organization" ON public.organization_settings FOR ALL TO authenticated USING (id = public.get_my_tenant_id()) WITH CHECK (id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Allow tenant members to view and manage profiles" ON public.profiles;
CREATE POLICY "Allow tenant members to view and manage profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (
    tenant_id = public.get_my_tenant_id() AND
    ( (SELECT "role" FROM public.profiles WHERE id = auth.uid()) = 'admin' OR (id = auth.uid()) )
  );

DO $$ DECLARE tbl text; BEGIN FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT IN ('organization_settings', 'profiles') LOOP 
    EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.%I', tbl);
    EXECUTE format('CREATE POLICY "Tenant Isolation Policy" ON public.%1$I FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant_id()) WITH CHECK (tenant_id = public.get_my_tenant_id())', tbl);
END LOOP; END $$;

-- FIM DO SCRIPT
`;