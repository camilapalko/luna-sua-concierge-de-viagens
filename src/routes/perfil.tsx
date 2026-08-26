import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toggleMultiOption, type Answers, type MilesProgram } from "@/lib/intake";
import { getMyProfile, saveMyProfile } from "@/lib/profile.functions";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil — Luna" },
      {
        name: "description",
        content: "Salve suas preferências de viagem para não responder tudo de novo toda vez.",
      },
    ],
  }),
  component: PerfilPage,
});

const AIRLINE_PREF_OPTIONS = [
  "Só quero voar por uma companhia específica",
  "Tenho preferência, mas topo outra se for mais barata ou tiver horário melhor",
  "Sem preferência",
];
const AIRLINE_NAME_OPTIONS = ["LATAM", "GOL", "Azul", "Companhia internacional"];
const DIETARY_OPTIONS = [
  "Vegetariano",
  "Vegano",
  "Sem Glúten",
  "Sem Lactose",
  "Halal",
  "Kosher",
  "Nenhuma",
];
const ACCOMMODATION_OPTIONS = ["Hotel", "Resort", "Apartamento/Airbnb", "Pousada boutique", "Hostel"];

function ChipGroup({
  options,
  selected,
  onPick,
}: {
  options: string[];
  selected: string[];
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary"
            }`}
          >
            {active && <Check className="mr-1 inline size-3.5" />}
            {option}
          </button>
        );
      })}
    </div>
  );
}

function PerfilPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const doSave = useServerFn(saveMyProfile);

  const [defaults, setDefaults] = useState<Answers>({});
  const [milesPrograms, setMilesPrograms] = useState<MilesProgram[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loading && !session) {
      void navigate({ to: "/auth", search: { redirect: "/perfil" }, replace: true });
    }
  }, [loading, session, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-profile", session?.user.id],
    queryFn: () => fetchProfile(),
    enabled: Boolean(session),
  });

  useEffect(() => {
    if (data && !loaded) {
      setDefaults(data.defaults);
      setMilesPrograms(data.milesPrograms);
      setLoaded(true);
    }
  }, [data, loaded]);

  function setSingle(id: string, value: string) {
    setDefaults((prev) => ({ ...prev, [id]: value }));
  }

  function toggleDietary(option: string) {
    const current = Array.isArray(defaults["dietary_restrictions"])
      ? (defaults["dietary_restrictions"] as string[])
      : [];
    setDefaults((prev) => ({
      ...prev,
      dietary_restrictions: toggleMultiOption("dietary_restrictions", current, option),
    }));
  }

  function updateMiles(index: number, field: keyof MilesProgram, value: string) {
    setMilesPrograms((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)),
    );
  }

  function removeMiles(index: number) {
    setMilesPrograms((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await doSave({
        data: {
          defaults,
          milesPrograms: milesPrograms.filter((m) => m.program.trim().length > 0),
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["my-profile", session?.user.id] });
      toast.success("Perfil salvo! Suas próximas viagens já começam com essas preferências.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui salvar seu perfil.");
    } finally {
      setSaving(false);
    }
  }

  const dietarySelected = Array.isArray(defaults["dietary_restrictions"])
    ? (defaults["dietary_restrictions"] as string[])
    : [];
  const airlinePref = typeof defaults["airline_pref"] === "string" ? defaults["airline_pref"] : "";
  const showAirlineName = airlinePref && airlinePref !== "Sem preferência";

  if (loading || (session && isLoading)) {
    return (
      <div className="min-h-screen bg-luna">
        <SiteHeader />
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-luna">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-3xl font-semibold">Meu perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Salve suas preferências uma vez e a Luna já começa suas próximas viagens com elas
          preenchidas. Você sempre pode mudar algo só numa viagem específica na hora do intake.
        </p>

        <div className="mt-8 space-y-8">
          <section className="card-luna p-6">
            <h2 className="font-display text-lg font-semibold">Companhia aérea</h2>
            <div className="mt-3 space-y-3">
              <ChipGroup
                options={AIRLINE_PREF_OPTIONS}
                selected={airlinePref ? [airlinePref] : []}
                onPick={(value) => setSingle("airline_pref", value)}
              />
              {showAirlineName && (
                <ChipGroup
                  options={AIRLINE_NAME_OPTIONS}
                  selected={
                    typeof defaults["airline_name"] === "string" ? [defaults["airline_name"]] : []
                  }
                  onPick={(value) => setSingle("airline_name", value)}
                />
              )}
            </div>
          </section>

          <section className="card-luna p-6">
            <h2 className="font-display text-lg font-semibold">Programas de milhas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A Luna considera isso como preferência nas sugestões de voo — ainda não é uma busca
              real de disponibilidade de assento por milhas.
            </p>
            <div className="mt-4 space-y-3">
              {milesPrograms.map((entry, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={entry.program}
                    onChange={(e) => updateMiles(i, "program", e.target.value)}
                    placeholder="Programa (ex: Smiles)"
                    className="max-w-[220px] rounded-xl"
                  />
                  <Input
                    value={entry.notes ?? ""}
                    onChange={(e) => updateMiles(i, "notes", e.target.value)}
                    placeholder="Observação (ex: ~80 mil milhas)"
                    className="max-w-xs rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMiles(i)}
                    aria-label="Remover programa"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => setMilesPrograms((prev) => [...prev, { program: "", notes: "" }])}
              >
                <Plus className="mr-1.5 size-4" /> Adicionar programa
              </Button>
            </div>
          </section>

          <section className="card-luna p-6">
            <h2 className="font-display text-lg font-semibold">Restrições alimentares</h2>
            <div className="mt-3">
              <ChipGroup
                options={DIETARY_OPTIONS}
                selected={dietarySelected}
                onPick={toggleDietary}
              />
            </div>
          </section>

          <section className="card-luna p-6">
            <h2 className="font-display text-lg font-semibold">Hospedagem preferida</h2>
            <div className="mt-3">
              <ChipGroup
                options={ACCOMMODATION_OPTIONS}
                selected={
                  typeof defaults["accommodation_type"] === "string"
                    ? [defaults["accommodation_type"]]
                    : []
                }
                onPick={(value) => setSingle("accommodation_type", value)}
              />
            </div>
          </section>

          <Button className="rounded-xl" disabled={saving} onClick={() => void handleSave()}>
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Salvar perfil
          </Button>
        </div>
      </main>
    </div>
  );
}
