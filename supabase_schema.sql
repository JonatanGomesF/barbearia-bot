-- =====================================================================
-- 💈 BARBEARIA BOT & PAINEL DE AGENDAMENTOS — SCHEMA SUPABASE (POSTGRESQL)
-- =====================================================================
-- Instruções:
-- 1. Acesse https://supabase.com e entre no seu painel.
-- 2. Vá no menu "SQL Editor" na barra lateral esquerda.
-- 3. Clique em "New Query".
-- 4. Cole todo este código abaixo e clique no botão "Run" (Executar).
-- =====================================================================

-- 1. Habilita extensão para UUIDs se necessário
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Barbearias / Estabelecimentos (Multi-tenant)
CREATE TABLE IF NOT EXISTS public.barbearias (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL DEFAULT 'Barbearia do Mika',
    telefone_dono TEXT DEFAULT '5515974062762@c.us',
    chave_pix TEXT DEFAULT '15974062762',
    endereco TEXT DEFAULT 'Rua Principal, 123 - Centro',
    fechado_hoje BOOLEAN DEFAULT FALSE,
    motivo_fechado TEXT DEFAULT 'Folga da equipe',
    data_fechada_manual TEXT DEFAULT NULL,
    dias_semana JSONB DEFAULT '{"1":"Segunda","2":"Terça","3":"Quarta","4":"Quinta","5":"Sexta","6":"Sábado"}'::jsonb,
    horarios_base JSONB DEFAULT '["09:00","10:00","11:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"]'::jsonb,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Serviços
CREATE TABLE IF NOT EXISTS public.servicos (
    id SERIAL PRIMARY KEY,
    barbearia_id TEXT NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    preco NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    duracao TEXT DEFAULT '30 min',
    icone TEXT DEFAULT '✂️',
    ordem INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabela de Agendamentos
CREATE TABLE IF NOT EXISTS public.agendamentos (
    id TEXT PRIMARY KEY,
    barbearia_id TEXT NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
    cliente TEXT NOT NULL,
    telefone TEXT NOT NULL,
    data TEXT NOT NULL, -- Formato: YYYY-MM-DD
    horario TEXT NOT NULL, -- Formato: HH:MM
    servico TEXT NOT NULL,
    preco NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'confirmado', -- 'confirmado', 'cancelado', 'concluido'
    origem TEXT DEFAULT 'whatsapp', -- 'whatsapp' ou 'manual'
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    cancelado_em TIMESTAMPTZ,
    concluido_em TIMESTAMPTZ
);

-- 5. Tabela de Conversas (Estado do WhatsApp Bot)
CREATE TABLE IF NOT EXISTS public.conversas (
    barbearia_id TEXT NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
    telefone TEXT NOT NULL,
    estado JSONB NOT NULL DEFAULT '{}'::jsonb,
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (barbearia_id, telefone)
);

-- =====================================================================
-- 6. Índices para Otimização de Consultas Rápidas
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_agendamentos_barbearia_data ON public.agendamentos(barbearia_id, data, horario, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_telefone ON public.agendamentos(barbearia_id, telefone);
CREATE INDEX IF NOT EXISTS idx_servicos_barbearia ON public.servicos(barbearia_id);

-- =====================================================================
-- 7. Configuração de Segurança (Row Level Security - RLS)
-- =====================================================================
ALTER TABLE public.barbearias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;

-- Políticas para permitir leitura e escrita públicas com a anon key (acesso direto do .exe)
DROP POLICY IF EXISTS "Permitir tudo para barbearias anon" ON public.barbearias;
CREATE POLICY "Permitir tudo para barbearias anon" ON public.barbearias FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir tudo para servicos anon" ON public.servicos;
CREATE POLICY "Permitir tudo para servicos anon" ON public.servicos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir tudo para agendamentos anon" ON public.agendamentos;
CREATE POLICY "Permitir tudo para agendamentos anon" ON public.agendamentos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir tudo para conversas anon" ON public.conversas;
CREATE POLICY "Permitir tudo para conversas anon" ON public.conversas FOR ALL USING (true) WITH CHECK (true);

-- =====================================================================
-- 8. Inserção de Dados Iniciais Padrão (Seed Inicial da Barbearia)
-- =====================================================================
INSERT INTO public.barbearias (
    id,
    nome,
    telefone_dono,
    chave_pix,
    endereco,
    fechado_hoje,
    motivo_fechado,
    dias_semana,
    horarios_base
) VALUES (
    'barbearia_principal',
    'Barbearia do Mika',
    '5515974062762@c.us',
    '15974062762',
    'Rua Principal, 123 - Centro',
    false,
    'Folga da equipe',
    '{"1":"Segunda","2":"Terça","3":"Quarta","4":"Quinta","5":"Sexta","6":"Sábado"}'::jsonb,
    '["09:00","10:00","11:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Inserção dos Serviços Iniciais
INSERT INTO public.servicos (id, barbearia_id, nome, preco, duracao, icone, ordem)
VALUES
    (1, 'barbearia_principal', 'Corte Tradicional / Social', 35.00, '40 min', '✂️', 1),
    (2, 'barbearia_principal', 'Degradê / Fade / Navalhado', 40.00, '45 min', '💈', 2),
    (3, 'barbearia_principal', 'Barba Terapia Completa', 30.00, '35 min', '🧔', 3),
    (4, 'barbearia_principal', 'Combo Cabelo + Barba', 60.00, '60 min', '👑', 4),
    (5, 'barbearia_principal', 'Sobrancelha / Acabamento', 15.00, '15 min', '✨', 5)
ON CONFLICT (id) DO NOTHING;
