import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  Smile,
  Frown,
  XCircle,
  Camera,
  Image as ImageIcon,
  AlertCircle,
  X,
  CheckCircle2,
  Circle,
  HelpCircle,
} from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';

import AppText from '../components/AppText';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  getLocalInspection,
  getLocalResponses,
  upsertLocalResponse,
} from '../services/storage';
import { enqueueInspection } from '../services/syncEngine';
import type {
  LocalInspection,
  LocalResponse,
  LocalEvidence,
  InspectionItemSnapshotApi,
  ChecklistItemTypeLocal,
} from '../types/api';
import { responseTypeToLocal, uuidv4 } from '../types/api';

// ─────────────────────────────────────────────────────────────
// Tipos de navegação
// ─────────────────────────────────────────────────────────────

type ExecRouteProp = RouteProp<RootStackParamList, 'ChecklistExecution'>;
type ExecNavProp = NativeStackNavigationProp<RootStackParamList>;

// ─────────────────────────────────────────────────────────────
// Tipo de item de checklist para a UI
// ─────────────────────────────────────────────────────────────

interface UiChecklistItem {
  snapshotId: number;
  order: number;
  title: string;
  description: string;
  type: ChecklistItemTypeLocal;
  required: boolean;
  choices: string[];
  requiresEvidence: boolean;
  // Estado da resposta
  answer: string | null; // CONFORMITY label
  textAnswer: string;
  numberAnswer: string;
  booleanAnswer: boolean | null;
  choiceAnswer: string;
  dateAnswer: string;
  evidences: LocalEvidence[];
  observation: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Converte um snapshot da API para o formato usado na UI. */
function snapshotToUiItem(
  snap: InspectionItemSnapshotApi,
  existingResponse?: LocalResponse,
): UiChecklistItem {
  // Parse choices from optionsJson
  let choices: string[] = [];
  if (snap.optionsJson) {
    try {
      const parsed = JSON.parse(snap.optionsJson);
      if (Array.isArray(parsed)) {
        choices = parsed.map(String);
      } else if (parsed.options && Array.isArray(parsed.options)) {
        choices = parsed.options.map(String);
      }
    } catch {
      // optionsJson não é JSON válido, ignora
    }
  }

  const resp = existingResponse;
  const type = responseTypeToLocal(snap.responseType);

  // Reconstrói o answer da UI a partir da resposta salva
  let answer: string | null = null;
  let textAnswer = '';
  let numberAnswer = '';
  let booleanAnswer: boolean | null = null;
  let choiceAnswer = '';
  let dateAnswer = '';
  let observation = '';
  let evidences: LocalEvidence[] = [];

  if (resp) {
    observation = resp.observation ?? '';
    evidences = resp.evidences ?? [];

    if (type === 'CONFORMITY') {
      // Mapeia valor da API de volta para rótulo da UI
      if (resp.notApplicable) {
        answer = 'Não Aplicável';
      } else if (resp.value === 'CONFORMING') {
        answer = 'Conforme';
      } else if (resp.value === 'NON_CONFORMING') {
        answer = 'Inconforme';
      }
    } else if (type === 'BOOLEAN') {
      booleanAnswer = resp.value === 'true';
    } else if (type === 'NUMBER') {
      numberAnswer = resp.value ?? '';
    } else if (type === 'TEXT' || type === 'TEXT_LONG') {
      textAnswer = resp.value ?? '';
    } else if (type === 'CHOICE') {
      choiceAnswer = resp.value ?? '';
    } else if (type === 'DATE') {
      // Converte yyyy-MM-dd de volta para DD/MM/AAAA
      if (resp.value) {
        const m = resp.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) {
          dateAnswer = `${m[3]}/${m[2]}/${m[1]}`;
        } else {
          dateAnswer = resp.value;
        }
      }
    }
  }

  return {
    snapshotId: snap.id,
    order: snap.itemDisplayOrder,
    title: snap.title,
    description: snap.description,
    type,
    required: snap.required,
    choices,
    requiresEvidence: snap.evidenceRequiredOnFailure,
    answer,
    textAnswer,
    numberAnswer,
    booleanAnswer,
    choiceAnswer,
    dateAnswer,
    evidences,
    observation,
  };
}

/** Converte o estado da UI de um item para LocalResponse. */
function uiItemToResponse(item: UiChecklistItem): LocalResponse {
  let value: string | null = null;
  let notApplicable = false;

  switch (item.type) {
    case 'CONFORMITY':
      if (item.answer === 'Não Aplicável') {
        notApplicable = true;
        value = null;
      } else if (item.answer === 'Conforme') {
        value = 'CONFORMING';
      } else if (item.answer === 'Inconforme') {
        value = 'NON_CONFORMING';
      }
      break;
    case 'BOOLEAN':
      value = item.booleanAnswer === null ? null : String(item.booleanAnswer);
      break;
    case 'NUMBER':
      value = item.numberAnswer || null;
      break;
    case 'TEXT':
    case 'TEXT_LONG':
      value = item.textAnswer || null;
      break;
    case 'CHOICE':
      value = item.choiceAnswer || null;
      break;
    case 'DATE':
      // Converte DD/MM/AAAA → yyyy-MM-dd
      if (item.dateAnswer) {
        const m = item.dateAnswer.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) {
          value = `${m[3]}-${m[2]}-${m[1]}`;
        } else {
          value = item.dateAnswer;
        }
      }
      break;
  }

  return {
    snapshotItemId: item.snapshotId,
    value,
    observation: item.observation || null,
    notApplicable,
    evidences: item.evidences,
    updatedAt: new Date().toISOString(),
  };
}

/** Retorna true se o item está respondido. */
function isAnswered(item: UiChecklistItem): boolean {
  switch (item.type) {
    case 'CONFORMITY':
      return item.answer !== null;
    case 'TEXT':
    case 'TEXT_LONG':
      return item.textAnswer.trim().length > 0;
    case 'NUMBER':
      return item.numberAnswer.trim().length > 0;
    case 'BOOLEAN':
      return item.booleanAnswer !== null;
    case 'CHOICE':
      return item.choiceAnswer.trim().length > 0;
    case 'DATE':
      return item.dateAnswer.trim().length > 0;
    default:
      return false;
  }
}

function isMissingRequired(item: UiChecklistItem): boolean {
  return item.required && !isAnswered(item);
}

// Cores de destaque por resposta de conformidade
const CONFORMITY_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  Conforme: { border: '#45A835', bg: '#F0FAF0', label: '#2E7D32' },
  Inconforme: { border: '#E53935', bg: '#FFEBEE', label: '#B71C1C' },
  'Não Aplicável': { border: '#9E9E9E', bg: '#F5F5F5', label: '#555' },
};

// ─────────────────────────────────────────────────────────────
// Sub-componentes de input por tipo
// ─────────────────────────────────────────────────────────────

interface ConformityProps {
  item: UiChecklistItem;
  onAnswer: (a: string) => void;
}

function ConformityInput({ item, onAnswer }: ConformityProps) {
  const OPTIONS: { value: string; label: string; icon: React.ReactNode }[] = [
    { value: 'Conforme', label: 'Conforme', icon: <Smile size={26} color="#132539" strokeWidth={1.5} /> },
    { value: 'Inconforme', label: 'Inconforme', icon: <Frown size={26} color="#132539" strokeWidth={1.5} /> },
    { value: 'Não Aplicável', label: 'Não Aplicável', icon: <XCircle size={26} color="#132539" strokeWidth={1.5} /> },
  ];

  return (
    <View style={inputStyles.group}>
      {OPTIONS.map((opt) => {
        const sel = item.answer === opt.value;
        const colors = CONFORMITY_COLORS[opt.value];
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              inputStyles.conformityBtn,
              sel && colors
                ? { borderColor: colors.border, backgroundColor: colors.bg }
                : null,
            ]}
            activeOpacity={0.75}
            onPress={() => onAnswer(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
          >
            <View style={inputStyles.optionIcon}>{opt.icon}</View>
            <AppText
              style={[
                inputStyles.optionLabel,
                sel && colors ? { color: colors.label, fontFamily: 'Inter_700Bold' } : null,
              ]}
            >
              {opt.label}
            </AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface BooleanProps {
  value: boolean | null;
  onChange: (v: boolean) => void;
}

function BooleanInput({ value, onChange }: BooleanProps) {
  return (
    <View style={inputStyles.group}>
      {([true, false] as boolean[]).map((opt) => {
        const sel = value === opt;
        const label = opt ? 'Sim' : 'Não';
        const selColor = opt ? '#45A835' : '#E53935';
        return (
          <TouchableOpacity
            key={String(opt)}
            style={[
              inputStyles.boolBtn,
              sel && { borderColor: selColor, backgroundColor: sel ? (opt ? '#F0FAF0' : '#FFEBEE') : '#FFF' },
            ]}
            activeOpacity={0.75}
            onPress={() => onChange(opt)}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
          >
            {sel
              ? <CheckCircle2 size={22} color={selColor} />
              : <Circle size={22} color="#BDBDBD" />}
            <AppText
              style={[
                inputStyles.boolLabel,
                sel && { color: selColor, fontFamily: 'Inter_700Bold' },
              ]}
            >
              {label}
            </AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface NumberProps {
  value: string;
  onChange: (v: string) => void;
}

function NumberInput({ value, onChange }: NumberProps) {
  return (
    <TextInput
      style={inputStyles.textBox}
      keyboardType="numeric"
      placeholder="0"
      placeholderTextColor="#BDBDBD"
      value={value}
      onChangeText={onChange}
      accessibilityLabel="Valor numérico"
    />
  );
}

interface TextProps {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}

function TextAreaInput({ value, onChange, multiline, placeholder = '' }: TextProps) {
  return (
    <TextInput
      style={[inputStyles.textBox, multiline && inputStyles.textArea]}
      multiline={multiline}
      textAlignVertical="top"
      placeholder={placeholder}
      placeholderTextColor="#BDBDBD"
      value={value}
      onChangeText={onChange}
      accessibilityLabel="Campo de texto livre"
    />
  );
}

interface DateProps {
  value: string;
  onChange: (v: string) => void;
}

function DateInput({ value, onChange }: DateProps) {
  function mask(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  }
  return (
    <TextInput
      style={inputStyles.textBox}
      keyboardType="numeric"
      placeholder="DD/MM/AAAA"
      placeholderTextColor="#BDBDBD"
      value={value}
      onChangeText={(t) => onChange(mask(t))}
      maxLength={10}
      accessibilityLabel="Data"
    />
  );
}

interface ChoiceProps {
  choices: string[];
  value: string;
  onChange: (v: string) => void;
}

function ChoiceInput({ choices, value, onChange }: ChoiceProps) {
  return (
    <View style={inputStyles.group}>
      {choices.map((opt) => {
        const sel = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[
              inputStyles.choiceBtn,
              sel && inputStyles.choiceBtnSelected,
            ]}
            activeOpacity={0.75}
            onPress={() => onChange(opt)}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
          >
            {sel
              ? <CheckCircle2 size={20} color="#45A835" />
              : <Circle size={20} color="#BDBDBD" />}
            <AppText
              style={[inputStyles.choiceLabel, sel && inputStyles.choiceLabelSelected]}
            >
              {opt}
            </AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface PhotoProps {
  evidences: LocalEvidence[];
  requiresEvidence?: boolean;
  onAdd: (ev: LocalEvidence) => void;
  onRemove: (uri: string) => void;
}

function PhotoInput({ evidences, requiresEvidence, onAdd, onRemove }: PhotoProps) {
  async function openCamera() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      onAdd({
        id: uuidv4(),
        uri: result.assets[0].uri,
        source: 'camera',
        capturedAt: new Date().toISOString(),
        synced: false,
      });
    }
  }

  async function openGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      onAdd({
        id: uuidv4(),
        uri: result.assets[0].uri,
        source: 'gallery',
        capturedAt: new Date().toISOString(),
        synced: false,
      });
    }
  }

  const missing = requiresEvidence && evidences.length === 0;

  return (
    <View>
      {missing && (
        <View style={inputStyles.evidenceWarning}>
          <AlertCircle size={16} color="#E53935" />
          <AppText style={inputStyles.evidenceWarningText}>
            Evidência fotográfica obrigatória para este item.
          </AppText>
        </View>
      )}

      <View style={inputStyles.evidenceBtns}>
        <TouchableOpacity
          style={[inputStyles.evidenceBtn, missing && inputStyles.evidenceBtnRequired]}
          activeOpacity={0.75}
          onPress={openCamera}
          accessibilityLabel="Abrir câmera"
        >
          <Camera size={22} color={missing ? '#E53935' : '#132539'} />
          <AppText style={[inputStyles.evidenceBtnLabel, missing && { color: '#E53935' }]}>
            Câmera
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[inputStyles.evidenceBtn, missing && inputStyles.evidenceBtnRequired]}
          activeOpacity={0.75}
          onPress={openGallery}
          accessibilityLabel="Abrir galeria"
        >
          <ImageIcon size={22} color={missing ? '#E53935' : '#132539'} />
          <AppText style={[inputStyles.evidenceBtnLabel, missing && { color: '#E53935' }]}>
            Galeria
          </AppText>
        </TouchableOpacity>
      </View>

      {evidences.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={inputStyles.previewScroll}
          contentContainerStyle={inputStyles.previewContent}
        >
          {evidences.map((ev) => (
            <View key={ev.id} style={inputStyles.previewThumb}>
              <Image source={{ uri: ev.uri }} style={inputStyles.previewImg} />
              {ev.synced && (
                <View style={inputStyles.syncedBadge}>
                  <CheckCircle2 size={12} color="#45A835" />
                </View>
              )}
              <TouchableOpacity
                style={inputStyles.previewRemove}
                onPress={() => onRemove(ev.uri)}
                accessibilityLabel="Remover evidência"
              >
                <X size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Tela principal
// ─────────────────────────────────────────────────────────────

export default function ChecklistExecutionScreen() {
  const navigation = useNavigation<ExecNavProp>();
  const route = useRoute<ExecRouteProp>();
  const { inspectionId } = route.params;
  const inspectionIdNum = Number(inspectionId);

  const [items, setItems] = useState<UiChecklistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showRequired, setShowRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState<LocalInspection | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  // Carrega inspeção e respostas do storage local
  useEffect(() => {
    (async () => {
      const insp = await getLocalInspection(inspectionIdNum);
      if (!insp) {
        setLoading(false);
        return;
      }
      setInspection(insp);

      const responses = await getLocalResponses(inspectionIdNum);

      // Ordena snapshots por itemDisplayOrder e converte para UI
      const sorted = [...insp.itemSnapshots].sort(
        (a, b) => a.itemDisplayOrder - b.itemDisplayOrder,
      );
      const uiItems = sorted.map((snap) =>
        snapshotToUiItem(snap, responses[snap.id]),
      );

      setItems(uiItems);
      setLoading(false);
    })();
  }, [inspectionIdNum]);

  // Salva a resposta do item atual no storage local
  const persistResponse = useCallback(
    (item: UiChecklistItem) => {
      const response = uiItemToResponse(item);
      upsertLocalResponse(inspectionIdNum, item.snapshotId, response);
    },
    [inspectionIdNum],
  );

  // ── Updaters (salvam no storage a cada mudança) ──────────

  function updateItem(patch: Partial<UiChecklistItem>) {
    setItems((prev) => {
      const updated = prev.map((it, idx) =>
        idx === currentIndex ? { ...it, ...patch } : it,
      );
      // Persiste o item atualizado
      persistResponse(updated[currentIndex]);
      return updated;
    });
  }

  const handleAnswer    = useCallback((answer: string) => updateItem({ answer }), [currentIndex]);
  const handleText      = useCallback((textAnswer: string) => updateItem({ textAnswer }), [currentIndex]);
  const handleNumber    = useCallback((numberAnswer: string) => updateItem({ numberAnswer }), [currentIndex]);
  const handleBoolean   = useCallback((booleanAnswer: boolean) => updateItem({ booleanAnswer }), [currentIndex]);
  const handleChoice    = useCallback((choiceAnswer: string) => updateItem({ choiceAnswer }), [currentIndex]);
  const handleDate      = useCallback((dateAnswer: string) => updateItem({ dateAnswer }), [currentIndex]);
  const handleObs       = useCallback((observation: string) => updateItem({ observation }), [currentIndex]);

  const handleAddEvidence = useCallback((ev: LocalEvidence) => {
    setItems((prev) => {
      const updated = prev.map((it, idx) =>
        idx === currentIndex
          ? { ...it, evidences: [...it.evidences, ev] }
          : it,
      );
      persistResponse(updated[currentIndex]);
      return updated;
    });
  }, [currentIndex]);

  const handleRemoveEvidence = useCallback((uri: string) => {
    setItems((prev) => {
      const updated = prev.map((it, idx) =>
        idx === currentIndex
          ? { ...it, evidences: it.evidences.filter((e) => e.uri !== uri) }
          : it,
      );
      persistResponse(updated[currentIndex]);
      return updated;
    });
  }, [currentIndex]);

  // ── Navegação ─────────────────────────────────────────────

  function goBack() {
    setShowRequired(false);
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      navigation.goBack();
    }
  }

  function goNext() {
    if (isMissingRequired(items[currentIndex])) {
      setShowRequired(true);
      return;
    }
    setShowRequired(false);

    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      // Finaliza: enfileira operações de sync no outbox local
      finishInspection();
    }
  }

  async function finishInspection() {
    try {
      await enqueueInspection(inspectionIdNum);
      Alert.alert(
        'Inspeção finalizada',
        'As respostas foram salvas localmente e serão sincronizadas quando houver conexão.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao finalizar.';
      Alert.alert('Erro', msg, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    }
  }

  // ── Guard ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.notFound}>
        <AppText style={styles.notFoundText}>Carregando inspeção...</AppText>
      </View>
    );
  }

  const total = items.length;
  const item = items[currentIndex];

  if (!item) {
    return (
      <View style={styles.notFound}>
        <HelpCircle size={48} color="#BDBDBD" />
        <AppText style={styles.notFoundText}>
          Nenhum item de inspeção encontrado.
        </AppText>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <AppText style={styles.backLink}>Voltar</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const progressPct = Math.round((currentIndex / total) * 100);

  // Se Inconforme e requiresEvidence, forçar evidência
  const needsEvidence =
    item.requiresEvidence ||
    (item.type === 'CONFORMITY' && item.answer === 'Inconforme');

  const missingRequired = showRequired && isMissingRequired(item);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#132539" />

      {/* ── Header ─────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
          accessibilityLabel="Voltar"
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <AppText style={styles.headerTitle}>
          <AppText style={styles.headerField}>FIELD </AppText>
          <AppText style={styles.headerOps}>OPS</AppText>
        </AppText>

        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      {/* ── Conteúdo ────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AppText style={styles.itemTitle}>
          {item.order}. {item.title}
          {item.required ? <AppText style={styles.requiredMark}> *</AppText> : null}
        </AppText>

        <AppText style={styles.itemDescription}>{item.description}</AppText>

        {missingRequired && (
          <View style={styles.requiredWarning}>
            <AlertCircle size={15} color="#E53935" />
            <AppText style={styles.requiredWarningText}>
              Este item é obrigatório. Responda antes de avançar.
            </AppText>
          </View>
        )}

        {/* ── Input dinâmico por tipo ─────────────────────── */}

        {item.type === 'CONFORMITY' && (
          <ConformityInput item={item} onAnswer={handleAnswer} />
        )}

        {item.type === 'BOOLEAN' && (
          <BooleanInput value={item.booleanAnswer} onChange={handleBoolean} />
        )}

        {item.type === 'NUMBER' && (
          <NumberInput value={item.numberAnswer} onChange={handleNumber} />
        )}

        {item.type === 'TEXT' && (
          <TextAreaInput value={item.textAnswer} onChange={handleText} placeholder="Descreva aqui..." />
        )}

        {item.type === 'TEXT_LONG' && (
          <TextAreaInput value={item.textAnswer} onChange={handleText} multiline placeholder="Descreva aqui em detalhes..." />
        )}

        {item.type === 'DATE' && (
          <DateInput value={item.dateAnswer} onChange={handleDate} />
        )}

        {item.type === 'CHOICE' && (
          <ChoiceInput
            choices={item.choices}
            value={item.choiceAnswer}
            onChange={handleChoice}
          />
        )}

        {(needsEvidence || item.evidences.length > 0) && (
          <>
            {item.type !== 'CONFORMITY' && (
              <AppText style={styles.evidenceTitle}>Evidências:</AppText>
            )}
            <PhotoInput
              evidences={item.evidences}
              requiresEvidence={needsEvidence}
              onAdd={handleAddEvidence}
              onRemove={handleRemoveEvidence}
            />
          </>
        )}

        {/* Campo de observação */}
        <AppText style={styles.observationLabel}>Campo de observação:</AppText>
        <TextInput
          style={styles.observationInput}
          multiline
          textAlignVertical="top"
          value={item.observation}
          onChangeText={handleObs}
          placeholderTextColor="#BDBDBD"
        />
      </ScrollView>

      {/* ── Rodapé ──────────────────────────────────────── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={goBack}
          activeOpacity={0.7}
          accessibilityLabel="Retornar ao item anterior"
        >
          <ArrowLeft size={16} color="#45A835" />
          <AppText style={styles.footerBtnText}>Retornar</AppText>
        </TouchableOpacity>

        <AppText style={styles.footerCounter}>
          Item {item.order} de {total}
        </AppText>

        <TouchableOpacity
          style={styles.footerBtn}
          onPress={goNext}
          activeOpacity={0.7}
          accessibilityLabel={currentIndex < total - 1 ? 'Avançar' : 'Finalizar inspeção'}
        >
          <AppText style={styles.footerBtnText}>
            {currentIndex < total - 1 ? 'Avançar' : 'Finalizar'}
          </AppText>
          <ArrowRight size={16} color="#45A835" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────
// Estilos dos inputs
// ─────────────────────────────────────────────────────────────

const inputStyles = StyleSheet.create({
  group: { gap: 10, marginBottom: 4 },

  conformityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  optionIcon: { width: 28, alignItems: 'center' },
  optionLabel: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#132539',
  },

  boolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  boolLabel: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#132539',
  },

  textBox: {
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#132539',
    backgroundColor: '#FFFFFF',
    marginBottom: 4,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },

  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 6,
    paddingVertical: 13,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  choiceBtnSelected: {
    borderColor: '#45A835',
    backgroundColor: '#F0FAF0',
  },
  choiceLabel: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#132539',
  },
  choiceLabelSelected: {
    fontFamily: 'Inter_700Bold',
    color: '#2E7D32',
  },

  evidenceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  evidenceWarningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#E53935',
  },
  evidenceBtns: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  evidenceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 6,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  evidenceBtnRequired: {
    borderColor: '#E53935',
    backgroundColor: '#FFEBEE',
  },
  evidenceBtnLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#132539',
  },
  previewScroll: { marginBottom: 12 },
  previewContent: { gap: 10, paddingVertical: 4 },
  previewThumb: {
    width: 90,
    height: 90,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImg: { width: '100%', height: '100%' },
  syncedBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ─────────────────────────────────────────────────────────────
// Estilos da tela
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    backgroundColor: '#132539',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 16,
  },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerField: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter_700Bold' },
  headerOps: { color: '#45A835', fontSize: 15, fontFamily: 'Inter_700Bold' },
  headerSpacer: { width: 30 },

  progressTrack: {
    height: 4,
    backgroundColor: '#E0E0E0',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#45A835',
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 16,
  },

  itemTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#132539',
  },
  requiredMark: { color: '#E53935', fontFamily: 'Inter_700Bold' },
  itemDescription: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    lineHeight: 20,
    marginTop: -8,
  },

  requiredWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 6,
    padding: 10,
    marginTop: -8,
  },
  requiredWarningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#E53935',
  },

  evidenceTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
    marginBottom: -8,
  },

  observationLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    marginBottom: -8,
  },
  observationInput: {
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 6,
    height: 120,
    padding: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#132539',
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 80,
  },
  footerBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#45A835',
  },
  footerCounter: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#132539',
  },

  notFound: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  notFoundText: { fontSize: 15, color: '#555', fontFamily: 'Inter_400Regular' },
  backLink: { fontSize: 14, color: '#1E88E5', fontFamily: 'Inter_700Bold' },
});
