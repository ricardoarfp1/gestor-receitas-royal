-- ============================================================
-- PADARIA DE VALOR — Schema Supabase (PostgreSQL)
-- Execute no SQL Editor do Supabase antes do Go-Live
-- ============================================================

-- Extensões
create extension if not exists "uuid-ossp";

-- Tipos ENUM
do $$ begin
  create type perfil_usuario as enum ('padeiro','nutri','gestor','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_receita as enum ('rascunho','validada','ativa','arquivada');
exception when duplicate_object then null; end $$;

-- Tabelas
create table if not exists usuarios (
  id              uuid primary key default uuid_generate_v4(),
  nome            text not null,
  email           text unique not null,
  perfil          perfil_usuario not null default 'padeiro',
  modo_onboarding boolean default false,
  ativo           boolean default true,
  criado_em       timestamptz default now()
);

create table if not exists categorias_receita (
  id   uuid primary key default uuid_generate_v4(),
  nome text not null unique
);

insert into categorias_receita (nome) values
  ('Pães'),('Salgados'),('Doces'),('Pizzas'),('Comida por Quilo'),('Bolos'),('Outros')
on conflict (nome) do nothing;

create table if not exists receitas (
  id                  uuid primary key default uuid_generate_v4(),
  nome                text not null,
  sku_variacao        text unique not null,
  sku_faturamento     text,
  categoria_id        uuid references categorias_receita,
  rendimento_unidades integer,
  rendimento_peso_g   numeric,
  status              status_receita not null default 'rascunho',
  foto_url            text,
  criado_por          uuid references usuarios,
  criado_em           timestamptz default now(),
  atualizado_em       timestamptz default now()
);

create table if not exists ingredientes_receita (
  id               uuid primary key default uuid_generate_v4(),
  receita_id       uuid references receitas on delete cascade,
  nome             text not null,
  quantidade_base  numeric not null,
  unidade          text not null default 'g',
  ordem            integer not null default 0,
  alergeno         boolean default false
);

create table if not exists passos_preparo (
  id             uuid primary key default uuid_generate_v4(),
  receita_id     uuid references receitas on delete cascade,
  ordem          integer not null,
  descricao      text not null,
  tempo_minutos  integer
);

create table if not exists logs_producao (
  id                   uuid primary key default uuid_generate_v4(),
  receita_id           uuid references receitas,
  padeiro_id           uuid references usuarios,
  quantidade_produzida integer not null,
  peso_real_g          numeric,
  multiplicador        numeric default 1,
  desvio_pct           numeric,
  preco_kg             numeric,
  etiqueta_gerada      boolean default false,
  modo_onboarding      boolean default false,
  produzido_em         timestamptz default now()
);

create table if not exists auditorias_semanais (
  id                 uuid primary key default uuid_generate_v4(),
  receita_id         uuid references receitas,
  nutricionista_id   uuid references usuarios,
  semana_ref         date not null,
  peso_esperado_g    numeric,
  peso_verificado_g  numeric,
  aprovada           boolean,
  observacoes        text,
  validada_em        timestamptz default now()
);

create table if not exists checklists_conformidade (
  id               uuid primary key default uuid_generate_v4(),
  data_checklist   date unique not null,
  itens_total      integer not null,
  itens_ok         integer not null,
  percentual       integer not null,
  itens_json       jsonb,
  criado_em        timestamptz default now()
);

create table if not exists historico_receitas (
  id             uuid primary key default uuid_generate_v4(),
  receita_id     uuid references receitas,
  alterado_por   uuid references usuarios,
  campo_alterado text,
  valor_anterior jsonb,
  valor_novo     jsonb,
  alterado_em    timestamptz default now()
);

-- Trigger: atualiza atualizado_em nas receitas
create or replace function set_atualizado_em()
returns trigger as $$
begin new.atualizado_em = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_receitas_updated on receitas;
create trigger trg_receitas_updated
  before update on receitas
  for each row execute function set_atualizado_em();

-- RLS (Row Level Security)
alter table receitas             enable row level security;
alter table ingredientes_receita enable row level security;
alter table passos_preparo       enable row level security;
alter table logs_producao        enable row level security;
alter table auditorias_semanais  enable row level security;
alter table checklists_conformidade enable row level security;
alter table usuarios             enable row level security;

-- Políticas (simplificadas — ajuste conforme necessidade)
-- Receitas: autenticados podem ler; gestores/admin/nutri gerenciam
drop policy if exists "auth leem receitas" on receitas;
create policy "auth leem receitas" on receitas
  for select using (auth.role() = 'authenticated');

drop policy if exists "gestores gerenciam receitas" on receitas;
create policy "gestores gerenciam receitas" on receitas
  for all using (
    exists (select 1 from usuarios u where u.id = auth.uid() and u.perfil in ('gestor','admin','nutri'))
  );

-- Ingredientes e passos: seguem a receita
drop policy if exists "auth leem ingredientes" on ingredientes_receita;
create policy "auth leem ingredientes" on ingredientes_receita
  for select using (auth.role() = 'authenticated');

drop policy if exists "auth leem passos" on passos_preparo;
create policy "auth leem passos" on passos_preparo
  for select using (auth.role() = 'authenticated');

drop policy if exists "gestores gerenciam ing" on ingredientes_receita;
create policy "gestores gerenciam ing" on ingredientes_receita
  for all using (exists (select 1 from usuarios u where u.id = auth.uid() and u.perfil in ('gestor','admin','nutri')));

drop policy if exists "gestores gerenciam passos" on passos_preparo;
create policy "gestores gerenciam passos" on passos_preparo
  for all using (exists (select 1 from usuarios u where u.id = auth.uid() and u.perfil in ('gestor','admin','nutri')));

-- Produção
drop policy if exists "padeiros inserem producao" on logs_producao;
create policy "padeiros inserem producao" on logs_producao
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "gestores leem producao" on logs_producao;
create policy "gestores leem producao" on logs_producao
  for select using (exists (select 1 from usuarios u where u.id = auth.uid() and u.perfil in ('gestor','admin')));

-- Auditorias
drop policy if exists "nutri gerenciam auditorias" on auditorias_semanais;
create policy "nutri gerenciam auditorias" on auditorias_semanais
  for all using (exists (select 1 from usuarios u where u.id = auth.uid() and u.perfil in ('nutri','admin','gestor')));

-- Checklist
drop policy if exists "auth gerenciam checklist" on checklists_conformidade;
create policy "auth gerenciam checklist" on checklists_conformidade
  for all using (auth.role() = 'authenticated');

-- Usuários: apenas admins gerenciam; cada um lê o próprio
drop policy if exists "usuario le proprio" on usuarios;
create policy "usuario le proprio" on usuarios
  for select using (id = auth.uid() or
    exists (select 1 from usuarios u where u.id = auth.uid() and u.perfil in ('gestor','admin')));

drop policy if exists "admin gerencia usuarios" on usuarios;
create policy "admin gerencia usuarios" on usuarios
  for all using (exists (select 1 from usuarios u where u.id = auth.uid() and u.perfil = 'admin'));

-- ============================================================
-- INSTRUÇÃO PÓS-DEPLOY
-- ============================================================
-- 1. Após executar este schema, vá em Authentication > Users
--    no painel do Supabase e crie o primeiro usuário admin.
-- 2. Depois insira o perfil manualmente:
--    INSERT INTO usuarios (id, nome, email, perfil)
--    VALUES ('<uid-do-auth>', 'Ricardo Pinto', 'seu@email.com', 'admin');
-- 3. Acesse o sistema e use /setup-sku para importar os produtos do SISMO.
