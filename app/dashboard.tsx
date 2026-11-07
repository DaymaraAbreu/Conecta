import React, { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppScreen } from "@/components/AppScreen";
import { AppText } from "@/components/AppText";
import { InfoBanner } from "@/components/InfoBanner";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { useApp } from "@/context/AppContext";
import { useAccountSession } from "@/context/AppSessionContext";
import { useAppColors } from "@/hooks/useAppColors";
import { esp32Ble, type Esp32ConnectionSnapshot } from "@/lib/esp32Ble";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

type SurveyItem = { category: string; count: number };
type SurveyChart = { id: string; title: string; description: string; items: SurveyItem[] };
type DashboardData = {
  surveyId?: string;
  period?: string;
  dataType: "field" | "empty";
  source?: string;
  updatedAt?: string | null;
  participantCount: number;
  responseCount: number;
  participants: SurveyItem[];
  barriers: SurveyItem[];
  additionalCharts?: SurveyChart[];
};

function parseSurveyData(value: unknown): DashboardData | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const parseItems = (items: unknown): SurveyItem[] | null => {
    if (!Array.isArray(items)) return null;
    const parsed: SurveyItem[] = [];
    for (const item of items) {
      if (typeof item !== "object" || item === null) return null;
      const entry = item as Record<string, unknown>;
      if (
        typeof entry.category !== "string" ||
        entry.category.trim().length === 0 ||
        typeof entry.count !== "number" ||
        !Number.isFinite(entry.count) ||
        entry.count < 0 ||
        !Number.isInteger(entry.count)
      ) {
        return null;
      }
      parsed.push({ category: entry.category, count: entry.count });
    }
    return parsed;
  };

  const barriers = parseItems(record.barriers);
  const participants = parseItems(record.participants);
  if (!barriers || !participants) return null;
  const additionalCharts: SurveyChart[] = [];
  if (record.additionalCharts !== undefined) {
    if (!Array.isArray(record.additionalCharts)) return null;
    for (const rawChart of record.additionalCharts) {
      if (typeof rawChart !== "object" || rawChart === null) return null;
      const chart = rawChart as Record<string, unknown>;
      const items = parseItems(chart.items);
      if (
        typeof chart.id !== "string" || chart.id.trim().length === 0 ||
        typeof chart.title !== "string" || chart.title.trim().length === 0 ||
        typeof chart.description !== "string" || !items
      ) return null;
      additionalCharts.push({ id: chart.id, title: chart.title, description: chart.description, items });
    }
  }
  const participantCount = typeof record.participantCount === "number" && Number.isInteger(record.participantCount) && record.participantCount >= 0
    ? record.participantCount
    : participants.reduce((sum, item) => sum + item.count, 0);
  const responseCount = typeof record.responseCount === "number" && Number.isInteger(record.responseCount) && record.responseCount >= 0
    ? record.responseCount
    : barriers.reduce((sum, item) => sum + item.count, 0);
  const dataType = record.dataType === "field" || record.dataType === "empty"
    ? record.dataType
    : "empty";
  if (dataType === "field" && (!record.surveyId || !record.period || !record.source)) return null;
  return {
    surveyId: typeof record.surveyId === "string" ? record.surveyId : undefined,
    period: typeof record.period === "string" ? record.period : undefined,
    dataType,
    source: typeof record.source === "string" ? record.source : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
    participantCount,
    responseCount,
    barriers,
    participants,
    additionalCharts,
  };
}

function DistributionChart({
  title,
  description,
  items,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  items: SurveyItem[];
  selected: string | null;
  onSelect: (category: string) => void;
}) {
  const colors = useAppColors();
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const maxCount = Math.max(1, ...items.map((item) => item.count));
  const selectedItem = items.find((item) => item.category === selected);

  return (
    <SectionCard title={title} description={description}>
      {items.length === 0 ? (
        <AppText size={13} muted style={{ paddingVertical: 16 }}>
          Ainda não há categorias cadastradas.
        </AppText>
      ) : (
        <>
          {items.map((item) => {
            const share = total ? Math.round((item.count / total) * 100) : 0;
            const isSelected = selected === item.category;
            return (
              <Pressable
                key={item.category}
                accessibilityRole="button"
                accessibilityLabel={`${item.category}: ${item.count} registros, ${share} por cento. Toque para ver detalhes.`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(item.category)}
                style={({ pressed }) => ({
                  paddingVertical: 11,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  opacity: pressed ? 0.72 : 1,
                })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                  <AppText size={12} weight={isSelected ? "700" : "500"} style={{ flex: 1 }}>
                    {item.category}
                  </AppText>
                  <AppText size={12} weight="700" color={colors.primary}>
                    {item.count}
                  </AppText>
                </View>
                <View style={{ height: 10, borderRadius: 6, overflow: "hidden", backgroundColor: colors.muted }}>
                  <View
                    style={{
                      width: `${Math.max(item.count > 0 ? 4 : 0, (item.count / maxCount) * 100)}%`,
                      height: "100%",
                      borderRadius: 6,
                      backgroundColor: isSelected ? colors.accentForeground : colors.primary,
                    }}
                  />
                </View>
              </Pressable>
            );
          })}
          {selectedItem ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 13,
                backgroundColor: colors.secondary,
              }}
            >
              <AppText size={12} weight="700" color={colors.primary}>
                {selectedItem.category}
              </AppText>
              <AppText size={12} muted style={{ marginTop: 4, lineHeight: 18 }}>
                {selectedItem.count} registros · {total ? Math.round((selectedItem.count / total) * 100) : 0}% das categorias exibidas
              </AppText>
            </View>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

export default function DashboardScreen() {
  const colors = useAppColors();
  const { preferences } = useApp();
  const account = useAccountSession();
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataNotice, setDataNotice] = useState('');
  const [filterText, setFilterText] = useState('');
  const [filterGroup, setFilterGroup] = useState<'all' | 'participants' | 'barriers'>('all');
  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setDataLoading(true);
      setDataNotice('');
      try {
        if (account.isSignedIn && account.userId && hasSupabaseConfig()) {
          const { data: snapshot, error } = await supabase
            .from('research_aggregate_snapshots')
            .select('survey_id, period, source, participant_count, response_count, participants, barriers, additional_charts, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          if (snapshot) {
            const remote = parseSurveyData({
              surveyId: snapshot.survey_id,
              period: snapshot.period,
              source: snapshot.source,
              dataType: 'field',
              participantCount: snapshot.participant_count,
              responseCount: snapshot.response_count,
              participants: snapshot.participants,
              barriers: snapshot.barriers,
              additionalCharts: snapshot.additional_charts,
              updatedAt: snapshot.updated_at,
            });
            if (!remote) throw new Error('O snapshot remoto foi rejeitado pela validação do painel.');
            if (active) setData(remote);
            return;
          }
          if (active) {
            setData(null);
            setDataNotice('Nenhum agregado autorizado foi publicado para esta conta.');
          }
        } else if (active) {
          setData(null);
          setDataNotice('Entre em uma conta configurada para consultar agregados autorizados.');
        }
      } catch (error) {
        if (active) {
          setData(null);
          setDataNotice(error instanceof Error ? `Dados autorizados indisponíveis: ${error.message}` : 'Dados autorizados indisponíveis.');
        }
      } finally {
        if (active) setDataLoading(false);
      }
    })();
    return () => { active = false; };
  }, [account.isSignedIn, account.userId, reload]);
  const loadError = data ? "" : "Nenhum dado agregado real disponível.";
  const sourceLabel = data
    ? data.dataType === "field" ? "Pesquisa de campo · dados agregados" : "Sem resultados reais"
    : "Agregado autorizado indisponível";
  const [selectedBarrier, setSelectedBarrier] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [esp32, setEsp32] = useState<Esp32ConnectionSnapshot>(() => esp32Ble.getSnapshot());

  const totals = useMemo(() => {
    if (!data) return { participants: 0, responses: 0, barriers: 0 };
    return {
      participants: data.participantCount,
      responses: data.responseCount,
      barriers: data.barriers.reduce((sum, item) => sum + item.count, 0),
    };
  }, [data]);

  const normalizedFilter = filterText.trim().toLocaleLowerCase('pt-BR');
  const filterItems = (items: SurveyItem[]) => items.filter((item) => !normalizedFilter || item.category.toLocaleLowerCase('pt-BR').includes(normalizedFilter));
  const visibleParticipants = filterGroup === 'barriers' ? [] : filterItems(data?.participants ?? []);
  const visibleBarriers = filterGroup === 'participants' ? [] : filterItems(data?.barriers ?? []);

  useEffect(() => {
    const unsubscribe = esp32Ble.subscribe(setEsp32);
    return () => { unsubscribe(); };
  }, []);

  return (
    <AppScreen>
      <PageHeader
        title="Pesquisa e IoT"
        subtitle="Resultados de acessibilidade e protótipo embarcado"
        back
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Atualizar dados do painel"
            onPress={() => setReload((value) => value + 1)}
            hitSlop={8}
            style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="refresh-cw" size={18} color={colors.primary} />
          </Pressable>
        }
      />

      <InfoBanner tone={data?.dataType === "field" ? "info" : "warning"}>
        {data?.dataType === "field"
          ? "Exibindo somente contagens agregadas autorizadas. O painel não recebe nomes, contatos ou respostas individuais."
          : "Nenhum resultado real foi carregado. Este painel não inventa respostas: publique um agregado anonimizado autorizado."}
      </InfoBanner>
      {dataNotice ? <AppText accessibilityRole="alert" size={11} color={colors.destructive} style={{ marginBottom: 12 }}>{dataNotice}</AppText> : null}

      <View
        accessibilityLabel="ODS 10, Redução das Desigualdades. O OCR com visão computacional no aparelho e a leitura em voz podem reduzir barreiras digitais e ampliar a autonomia de pessoas com deficiência e pessoas idosas."
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
          marginBottom: 18,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#DD1367",
          }}
        >
          <AppText size={10} weight="700" color="#FFFFFF">ODS</AppText>
          <AppText size={23} weight="700" color="#FFFFFF" style={{ lineHeight: 25 }}>10</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText size={13} weight="700">Redução das Desigualdades</AppText>
          <AppText size={11} muted style={{ marginTop: 4, lineHeight: 17 }}>
            O OCR com visão computacional no aparelho e a leitura em voz podem reduzir barreiras digitais e ampliar a autonomia de pessoas com deficiência e pessoas idosas.
          </AppText>
        </View>
      </View>

      {!data ? (
        <SectionCard title="Carregamento">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 }}>
            <Feather name={dataLoading ? "loader" : "bar-chart-2"} size={17} color={colors.primary} />
            <AppText size={13} muted accessibilityRole="alert">
              {dataLoading ? "Carregando agregado autorizado…" : dataNotice || loadError}
            </AppText>
          </View>
        </SectionCard>
      ) : (
        <>
          {dataLoading ? <AppText accessibilityLiveRegion="polite" size={11} muted style={{ marginBottom: 10 }}>Carregando dados autorizados…</AppText> : null}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
            {[
              { label: "Participantes", value: totals.participants, icon: "users" as const },
              { label: "Respostas", value: totals.responses, icon: "message-square" as const },
              { label: "Registros de barreiras", value: totals.barriers, icon: "alert-circle" as const },
            ].map((metric) => (
              <View
                key={metric.label}
                style={{
                  flex: 1,
                  minWidth: 105,
                  minHeight: 106,
                  padding: 14,
                  borderRadius: 17,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <Feather name={metric.icon} size={17} color={colors.primary} />
                <AppText size={22} weight="700" style={{ marginTop: 9 }}>{metric.value}</AppText>
                <AppText size={10} muted style={{ marginTop: 2 }}>{metric.label}</AppText>
              </View>
            ))}
          </View>

          <AppText size={11} muted style={{ marginBottom: 13 }}>
            Fonte: {sourceLabel}{data.period ? ` · ${data.period}` : ""}
          </AppText>
          <SectionCard title="Origem dos dados" description="O painel exibe apenas um snapshot agregado autorizado no Supabase.">
            <View style={{ paddingVertical: 12, gap: 6 }}>
              <AppText size={12} weight="700">{sourceLabel}</AppText>
              <AppText size={11} muted style={{ lineHeight: 17 }}>{data.source ?? "Fonte informativa não declarada."}</AppText>
              <AppText size={11} muted>Atualizado: {data.updatedAt ?? "não informado"}</AppText>
            </View>
          </SectionCard>

          <SectionCard title="Filtros" description="Filtre categorias pelo nome ou escolha qual distribuição deseja revisar.">
            <TextInput
              accessibilityLabel="Filtrar categorias"
              value={filterText}
              onChangeText={setFilterText}
              placeholder="Ex.: contraste, áudio…"
              placeholderTextColor={colors.mutedForeground}
              style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, color: colors.foreground, fontSize: 15 * preferences.fontScale, marginVertical: 12 }}
            />
            <View style={{ flexDirection: "row", gap: 8, paddingBottom: 12 }}>
              {([['all', 'Todas'], ['participants', 'Participantes'], ['barriers', 'Barreiras']] as const).map(([value, label]) => (
                <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filterGroup === value }} onPress={() => setFilterGroup(value)} style={{ minHeight: 42, paddingHorizontal: 12, borderRadius: 12, justifyContent: "center", backgroundColor: filterGroup === value ? colors.primary : colors.secondary }}>
                  <AppText size={12} weight="700" color={filterGroup === value ? colors.primaryForeground : colors.secondaryForeground}>{label}</AppText>
                </Pressable>
              ))}
            </View>
          </SectionCard>

          <DistributionChart
            title="Barreiras encontradas"
            description="Questão de múltipla seleção. Cada participante podia marcar mais de uma dificuldade; os números representam marcações, não pessoas únicas."
            items={visibleBarriers}
            selected={selectedBarrier}
            onSelect={setSelectedBarrier}
          />
          <DistributionChart
            title="Distribuição dos participantes"
            description="Distribuição por condição visual informada pelos respondentes."
            items={visibleParticipants}
            selected={selectedParticipant}
            onSelect={setSelectedParticipant}
          />
          {(data.additionalCharts ?? []).map((chart) => (
            <DistributionChart
              key={chart.id}
              title={chart.title}
              description={chart.description}
              items={chart.items.filter((item) => !normalizedFilter || item.category.toLocaleLowerCase("pt-BR").includes(normalizedFilter))}
              selected={null}
              onSelect={() => undefined}
            />
          ))}
        </>
      )}

      <SectionCard
        title="Sistemas embarcados e IoT"
        description="Integração BLE com um ESP32 real. O botão físico envia um comando para abrir as conversas e solicitar uma ação de leitura."
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 14 }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.secondary }}>
            <Feather name="smartphone" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText size={13} weight="700">Atuador de vibração</AppText>
            <AppText size={11} muted style={{ marginTop: 3 }}>
              {preferences.vibration ? "Feedback tátil ativo" : "Ative a vibração nas preferências"}
            </AppText>
          </View>
          <Feather name={preferences.vibration ? "check-circle" : "minus-circle"} size={17} color={preferences.vibration ? colors.primary : colors.mutedForeground} />
        </View>
        <View style={{ paddingVertical: 10, gap: 5 }}>
          <AppText size={13} weight="700">Estado do ESP32</AppText>
          <AppText accessibilityLiveRegion="polite" size={12} muted>
            {esp32.message}{esp32.deviceName ? ` · ${esp32.deviceName}` : ""}
          </AppText>
          {esp32.status === "reconnecting" ? (
            <AppText size={11} color={colors.primary}>Tentativa {esp32.retryAttempt} de 5</AppText>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={esp32.status === "connected" ? "Desconectar ESP32" : "Procurar e conectar um ESP32"}
          accessibilityHint="Procura um dispositivo BLE compatível próximo. A conexão só será indicada após o hardware responder."
          disabled={esp32.status === "scanning" || esp32.status === "connecting" || esp32.status === "reconnecting" || esp32.status === "unavailable"}
          onPress={() => void (esp32.status === "connected" ? esp32Ble.disconnect() : esp32Ble.scanAndConnect())}
          style={({ pressed }) => ({
            minHeight: 54,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 9,
            backgroundColor: esp32.status === "connected" ? colors.secondary : colors.primary,
            opacity: pressed || esp32.status === "scanning" || esp32.status === "connecting" || esp32.status === "reconnecting" || esp32.status === "unavailable" ? 0.55 : 1,
            marginBottom: 13,
          })}
        >
          <Feather name={esp32.status === "connected" ? "bluetooth" : "search"} size={17} color={esp32.status === "connected" ? colors.primary : colors.primaryForeground} />
          <AppText size={13} weight="700" color={esp32.status === "connected" ? colors.primary : colors.primaryForeground}>
            {esp32.status === "connected" ? "Desconectar ESP32" : esp32.status === "scanning" || esp32.status === "connecting" || esp32.status === "reconnecting" ? "Procurando ESP32…" : "Procurar ESP32 por BLE"}
          </AppText>
        </Pressable>
        <AppText size={11} muted style={{ lineHeight: 17, paddingBottom: 14 }}>
          Quando conectado, o botão físico deve enviar {`{"type":"button_press","action":"read_last_message"}`}. Comandos inválidos e falhas de comunicação são informados sem fingir que o dispositivo está conectado.
        </AppText>
      </SectionCard>
    </AppScreen>
  );
}
