-- Perfil de viagem persistente por usuário: preferências que valem para
-- todas as viagens (companhia aérea, restrições alimentares, milhas etc.),
-- em vez de perguntar tudo de novo em cada intake.
CREATE TABLE public.traveler_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Mesma forma de "Answers" do intake (chave = id da pergunta), só que
  -- persistente entre viagens. Ex.: { "airline_pref": "...", "airline_name":
  -- "LATAM", "dietary_restrictions": ["Vegano"], "accommodation_type": "Hotel" }
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Programas de milhas/fidelidade que a pessoa participa. Formato:
  -- [{ "program": "Smiles", "notes": "cerca de 80 mil milhas" }, ...]
  -- Usado hoje só como contexto/preferência para a Luna considerar nas
  -- sugestões (não há busca real de disponibilidade de milhas ainda).
  miles_programs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.traveler_profiles TO authenticated;
GRANT ALL ON public.traveler_profiles TO service_role;
ALTER TABLE public.traveler_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.traveler_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_traveler_profiles_updated_at BEFORE UPDATE ON public.traveler_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
