-- Permite persistir os dados agregados das séries adicionais do dashboard.
-- Não armazena respostas individuais; o acesso continua protegido pela policy admin existente.
alter table public.research_aggregate_snapshots
  add column if not exists additional_charts jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'research_additional_charts_array'
      and conrelid = 'public.research_aggregate_snapshots'::regclass
  ) then
    alter table public.research_aggregate_snapshots
      add constraint research_additional_charts_array
      check (jsonb_typeof(additional_charts) = 'array');
  end if;
end;
$$;
