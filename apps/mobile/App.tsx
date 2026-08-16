import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import i18n from './src/locales/i18n';
import {
  createLocalPin,
  createDemoShare,
  createPortalKeyEnvelope,
  approveDemoShare,
  checkDemoShareRequest,
  confirmSmartImportResult,
  hasLocalPin,
  hasRemoteSession,
  importSyntheticDocument,
  initializeVault,
  loadPatientProfile,
  listTimeline,
  listPendingSmartImportResults,
  listPendingShareIntents,
  openLocalDocument,
  prepareSmartImport,
  processDocumentOutbox,
  requestPatientOtp,
  rejectSmartImportResult,
  declineDemoShare,
  revokeDemoShare,
  processSmartImportOutbox,
  processShareIntentOutbox,
  queueOfflineShareIntent,
  queueApprovedSmartImport,
  resetLocalDemo,
  savePatientProfile,
  simulatePendingSmartImports,
  syncPatientProfile,
  updateDocumentType,
  verifyPatientOtp,
  VaultRecoveryRequiredError,
  type TimelineDocument,
  type PendingSmartImportResult,
  type DemoShareSession,
  type DemoShareStatus,
  type PatientProfile,
  verifyLocalPin,
} from './src/nativeVault';
import { isUnreadableVaultDatabaseError } from './src/vaultRecovery';
import { shouldRelockAfterBackground } from './src/lockTimeout';
import { isValidSenegalNationalNumber, sanitizeSenegalNationalNumber, toSenegalE164 } from './src/senegalPhone';
import type { ShareIntent } from './src/shareIntent';
import type { SmartImportRequest } from '../../packages/contracts/src/smart-import';

type AppButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
};

function Button({ title, onPress, disabled = false, color }: AppButtonProps) {
  const danger = color === '#a12424';
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      activeOpacity={0.78}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, danger && styles.buttonDanger, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, danger && styles.buttonDangerText, disabled && styles.buttonTextDisabled]}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [needsPin, setNeedsPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [documents, setDocuments] = useState<TimelineDocument[]>([]);
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('all');
  const [documentTypeDraft, setDocumentTypeDraft] = useState('');
  const [preview, setPreview] = useState<{ document: TimelineDocument; title: string; imageUri?: string; detail: string } | null>(null);
  const [smartImport, setSmartImport] = useState<{ documentId: string; request: SmartImportRequest } | null>(null);
  const [smartResults, setSmartResults] = useState<PendingSmartImportResult[]>([]);
  const [remoteAuthenticated, setRemoteAuthenticated] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [signupStep, setSignupStep] = useState<'phone' | 'otp'>('phone');
  const [share, setShare] = useState<DemoShareSession | null>(null);
  const [shareDocumentId, setShareDocumentId] = useState<string | null>(null);
  const [shareRequest, setShareRequest] = useState<DemoShareStatus | null>(null);
  const [shareApproved, setShareApproved] = useState(false);
  const [shareIntents, setShareIntents] = useState<ShareIntent[]>([]);
  const [selectedShareDocumentId, setSelectedShareDocumentId] = useState<string | null>(null);
  const [page, setPage] = useState<'home' | 'documents' | 'profile'>('home');
  const [profile, setProfile] = useState<PatientProfile>({ displayName: '', age: '', bloodType: '', conditions: '' });
  const [vaultRecoveryRequired, setVaultRecoveryRequired] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!share?.sessionId) return;
    const interval = setInterval(async () => {
      try {
        const res = await checkDemoShareRequest(share.sessionId);
        if (res.state === 'requested') setShareRequest(res);
        if (res.state === 'approved') {
          setShareRequest(null);
          setShareApproved(true);
        }
        if (res.state === 'accessed' || res.state === 'expired' || res.state === 'revoked') {
          setShare(null);
          setShareDocumentId(null);
          setShareRequest(null);
          setShareApproved(false);
          setMessage(res.state === 'accessed' ? 'Partage utilisé et supprimé.' : 'Code de partage expiré ou supprimé.');
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [share?.sessionId]);

  const activateShare = (nextShare: DemoShareSession, documentId: string) => {
    setShare(nextShare);
    setShareDocumentId(documentId);
    setShareRequest(null);
    setShareApproved(false);
  };

  const copyShareCode = async (value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setMessage('Code de partage copié.');
    } catch {
      setMessage('Copie impossible. Sélectionnez le code manuellement.');
    }
  };

  useEffect(() => {
    if (!share) return;
    const expiresInMs = Math.max(0, Date.parse(share.expiresAt) - Date.now());
    const expiredSession = share;
    const timer = setTimeout(() => {
      setShare(null);
      setShareDocumentId(null);
      setShareRequest(null);
      setShareApproved(false);
      setMessage('Code de partage expiré et supprimé. Vous pouvez en générer un nouveau.');
      void revokeDemoShare(expiredSession.sessionId).catch(() => undefined);
    }, expiresInMs);
    return () => clearTimeout(timer);
  }, [share?.expiresAt]);

  useEffect(() => {
    void (async () => {
      try {
        await initializeVault();
        setProfile(await loadPatientProfile());
        setNeedsPin(!(await hasLocalPin()));
        setRemoteAuthenticated(await hasRemoteSession());
      } catch (error) {
        if (error instanceof VaultRecoveryRequiredError) {
          setVaultRecoveryRequired(true);
          setMessage('Une ancienne base locale ne correspond plus à la clé sécurisée de cet appareil.');
        } else {
          setMessage('Initialisation sécurisée impossible. Utilisez un development build, pas Expo Go.');
        }
      } finally {
        setReady(true);
      }
    })();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (shouldRelockAfterBackground(backgroundedAt.current)) {
          setUnlocked(false);
          setPin('');
        }
        backgroundedAt.current = null;
      } else if (backgroundedAt.current === null) {
        backgroundedAt.current = Date.now();
        setPreview(null);
        setPin('');
      }
    });
    return () => subscription.remove();
  }, []);

  const refresh = async () => {
    const nextDocuments = await listTimeline();
    setDocuments(nextDocuments);
    setSelectedShareDocumentId((current) => current && nextDocuments.some((document) => document.id === current)
      ? current
      : (nextDocuments.find((document) => document.syncState === 'synced')?.id ?? null));
    setSmartResults(await listPendingSmartImportResults());
    setShareIntents(await listPendingShareIntents());
  };

  const submitPin = async () => {
    setBusy(true);
    setMessage('');
    try {
      await verifyLocalPin(pin);
      setPin('');
      setUnlocked(true);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Déverrouillage refusé.');
    } finally {
      setBusy(false);
    }
  };

  const importDocument = async () => {
    setBusy(true);
    setMessage('');
    try {
      const imported = await importSyntheticDocument();
      if (imported) {
        await refresh();
        setPage('home');
        setMessage('Document chiffré localement et ajouté à la file de synchronisation.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import refusé.');
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (document: TimelineDocument) => {
    setBusy(true);
    setMessage('');
    try {
      const opened = await openLocalDocument(document.id);
      setPreview({
        document,
        title: opened.title,
        imageUri: opened.imageDataUri,
        detail: opened.mimeType === 'application/pdf'
          ? `PDF déchiffré et authentifié (${opened.sizeBytes} octets). Consultation en lecture seule.`
          : `Image déchiffrée localement (${opened.sizeBytes} octets).`,
      });
      setDocumentTypeDraft(document.documentType);
    } catch {
      setMessage('Document illisible : intégrité, clé ou contexte invalide.');
    } finally {
      setBusy(false);
    }
  };

  const previewSmartImport = async (document: TimelineDocument) => {
    setBusy(true);
    try {
      setSmartImport({ documentId: document.id, request: await prepareSmartImport(document.id) });
      setPreview(null);
      setMessage('Vérifiez et modifiez le texte. Aucun envoi n’a encore eu lieu.');
    } catch {
      setMessage('Préparation locale impossible.');
    } finally {
      setBusy(false);
    }
  };

  const requestSmartImportConsent = (document: TimelineDocument) => {
    if (!document.smartImportEligible) {
      Alert.alert(i18n.t('ai_unavailable_title'), i18n.t('ai_unavailable_message'), [
        { text: i18n.t('close_button') },
      ]);
      return;
    }
    Alert.alert(
      i18n.t('ai_consent_warning_title'),
      i18n.t('ai_consent_warning_message'),
      [
        { text: i18n.t('cancel_button'), style: 'cancel' },
        {
          text: i18n.t('review_anonymization_button'),
          onPress: () => void previewSmartImport(document),
        },
      ],
    );
  };

  const saveDocumentType = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const documentType = await updateDocumentType(preview.document.id, documentTypeDraft);
      setPreview({ ...preview, document: { ...preview.document, documentType } });
      await refresh();
      setMessage(`Type « ${documentType} » enregistré dans les métadonnées chiffrées.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Type de document invalide.');
    } finally {
      setBusy(false);
    }
  };

  const approveSmartImport = async () => {
    if (!smartImport) return;
    setBusy(true);
    try {
      await queueApprovedSmartImport(smartImport.documentId, smartImport.request);
      setSmartImport(null);
      const resumed = await processSmartImportOutbox().catch(() => ({ completed: 0, pending: 1 }));
      await refresh();
      setMessage(resumed.completed > 0
        ? 'Analyse reçue. Vérifiez puis confirmez les métadonnées proposées.'
        : 'Consentement enregistré. Requête en attente de connexion; aucun fichier original ne sera envoyé.');
    } catch {
      setMessage('Consentement non enregistré. Aucun envoi effectué.');
    } finally {
      setBusy(false);
    }
  };

  const resumeSmartImports = async () => {
    setBusy(true);
    try {
      const resumed = await processSmartImportOutbox();
      await refresh();
      setMessage(resumed.completed > 0 ? 'Analyse reçue : confirmation requise.' : `${resumed.pending} analyse(s) toujours en attente.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reprise réseau impossible.');
    } finally {
      setBusy(false);
    }
  };

  const useLocalSimulation = async () => {
    setBusy(true);
    try {
      const completed = await simulatePendingSmartImports();
      await refresh();
      setMessage(completed > 0
        ? 'Simulation locale terminée. Aucun appel GPT ni envoi réseau n’a été effectué.'
        : 'Aucune analyse consentie en attente de simulation.');
    } catch {
      setMessage('Simulation locale impossible.');
    } finally {
      setBusy(false);
    }
  };

  const synchronizeDocuments = async () => {
    setBusy(true);
    try {
      const synced = await processDocumentOutbox();
      await refresh();
      setMessage(synced.completed > 0 ? `${synced.completed} document(s) chiffré(s) synchronisé(s).` : `${synced.pending} synchronisation(s) en attente.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Synchronisation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const updateVault = async () => {
    setBusy(true);
    try {
      const synced = await processDocumentOutbox();
      const resumed = await processShareIntentOutbox();
      if (resumed.completed[0] && selectedShareDocumentId) activateShare(resumed.completed[0], selectedShareDocumentId);
      await refresh();
      setMessage(synced.completed > 0 ? 'Votre coffre est à jour.' : 'La mise à jour reste en attente de connexion.');
    } catch {
      setMessage('Mise à jour impossible pour le moment. Vos documents restent disponibles localement.');
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    setBusy(true);
    try {
      await requestPatientOtp(toSenegalE164(phone));
      setSignupStep('otp');
      setMessage('SMS de vérification envoyé. Saisissez-le pour terminer l’inscription.');
    } catch {
      // The verification endpoint remains authoritative. Let the patient enter
      // a code already delivered by the provider even when the send request
      // returns late, is rate-limited, or reports an ambiguous failure.
      setSignupStep('otp');
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  const confirmOtp = async () => {
    setBusy(true);
    try {
      await verifyPatientOtp(toSenegalE164(phone), otp);
      await createLocalPin(pin);
      setNeedsPin(false);
      setRemoteAuthenticated(true);
      setOtp('');
      setPin('');
      setUnlocked(true);
      await refresh();
      setMessage('Compte patient créé et coffre déverrouillé.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Validation OTP impossible.');
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      await savePatientProfile(profile);
      try {
        await syncPatientProfile();
        setMessage('Profil chiffré et synchronisé. Données synthétiques uniquement.');
      } catch {
        setMessage('Profil chiffré localement ; synchronisation en attente.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Profil invalide.');
    } finally {
      setBusy(false);
    }
  };

  const shareDocument = async (document: TimelineDocument) => {
    setBusy(true);
    try {
      const created = await createDemoShare(document.id);
      activateShare(created, document.id);
      setMessage('Code numérique et QR temporaire générés. Ils expirent après 5 minutes sans utilisation.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Partage impossible.');
    } finally {
      setBusy(false);
    }
  };

  const approveShareRequest = async () => {
    if (!share || !shareDocumentId || !shareRequest?.portalPublicKey) {
      setMessage('Clé temporaire du portail indisponible. Demandez au professionnel de relancer sa demande.');
      return;
    }
    setBusy(true);
    try {
      const keyEnvelope = await createPortalKeyEnvelope(shareDocumentId, shareRequest.portalPublicKey);
      await approveDemoShare(share.sessionId, keyEnvelope);
      setShareRequest(null);
      setShareApproved(true);
      setMessage('Demande approuvée. Le portail du professionnel reçoit maintenant l’accès directement.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Approbation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const declineShareRequest = async () => {
    if (!share) return;
    setBusy(true);
    try {
      await declineDemoShare(share.sessionId);
      setShareRequest(null);
      setShareApproved(false);
      setMessage('Demande refusée. Aucun code ni accès n’a été délivré.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Refus impossible.');
    } finally {
      setBusy(false);
    }
  };

  const prepareOfflineShare = async (document: TimelineDocument) => {
    setBusy(true);
    try {
      await queueOfflineShareIntent(document.id);
      await refresh();
      setMessage('Intention enregistrée hors ligne. Aucun accès, document ou clé ne sera délivré avant reconnexion.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Intention de partage impossible.');
    } finally {
      setBusy(false);
    }
  };

  const resumeShares = async () => {
    setBusy(true);
    try {
      const resumed = await processShareIntentOutbox();
      if (resumed.completed[0] && selectedShareDocumentId) activateShare(resumed.completed[0], selectedShareDocumentId);
      await refresh();
      setMessage(resumed.completed.length > 0
        ? 'QR activé. Votre confirmation ouvrira directement le portail demandeur.'
        : `${resumed.pending} intention(s) toujours en attente de connexion et de synchronisation.`);
    } catch {
      setMessage('Reprise impossible. Aucun accès professionnel n’a été accordé.');
    } finally {
      setBusy(false);
    }
  };

  const revokeShare = async () => {
    if (!share) return;
    setBusy(true);
    try {
      await revokeDemoShare(share.sessionId);
      setShare(null);
      setShareDocumentId(null);
      setShareRequest(null);
      setShareApproved(false);
      setMessage('Partage révoqué. Tout nouvel accès est bloqué.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Révocation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const handleQrAction = () => {
    if (documents.length === 0) {
      void importDocument();
      return;
    }
    if (!remoteAuthenticated) {
      setMessage('Connectez votre compte patient ci-dessous pour sécuriser ce partage.');
      return;
    }
    const selected = documents.find((document) => document.id === selectedShareDocumentId);
    if (selected) {
      void shareDocument(selected);
      return;
    }
    void synchronizeDocuments();
  };

  const qrActionTitle = documents.length === 0
    ? 'Importer mon premier document'
    : !remoteAuthenticated
      ? 'Se connecter pour continuer'
      : selectedShareDocumentId
        ? 'Générer un code de partage'
        : 'Synchroniser pour générer un code';

  const confirmSmartResult = async (item: PendingSmartImportResult) => {
    setBusy(true);
    try {
      await confirmSmartImportResult(item);
      await refresh();
      setMessage('Métadonnées confirmées et enregistrées dans le coffre chiffré.');
    } catch {
      setMessage('Confirmation impossible. Le résultat reste en attente.');
    } finally {
      setBusy(false);
    }
  };

  const rejectSmartResult = async (item: PendingSmartImportResult) => {
    setBusy(true);
    try {
      await rejectSmartImportResult(item);
      await refresh();
      setMessage('Analyse IA infirmée par le patient et décision enregistrée dans le coffre chiffré.');
    } catch {
      setMessage('Impossible d’infirmer le résultat. Il reste en attente.');
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = () => Alert.alert(
    i18n.t('reset_demo_title'),
    i18n.t('reset_demo_message'),
    [
      { text: i18n.t('cancel_button'), style: 'cancel' },
      {
        text: i18n.t('reset_confirm_button'),
        style: 'destructive',
        onPress: () => void (async () => {
          setBusy(true);
          try {
            await resetLocalDemo();
            await initializeVault();
            setDocuments([]);
            setPreview(null);
            setNeedsPin(true);
            setUnlocked(false);
            setVaultRecoveryRequired(false);
            setMessage('Coffre local réinitialisé. Créez votre compte patient.');
          } catch {
            setMessage('Réinitialisation locale impossible.');
          } finally {
            setBusy(false);
          }
        })(),
      },
    ],
  );

  if (!ready) return <SafeAreaView style={styles.center}><ActivityIndicator /></SafeAreaView>;

  if (vaultRecoveryRequired || isUnreadableVaultDatabaseError(message) || message === 'Réinitialisation locale impossible.') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.lockCard}>
          <Text style={styles.brand}>WérPass</Text>
          <Text style={styles.title}>{i18n.t('vault_incompatible_title')}</Text>
          <Text style={styles.hint}>{message}</Text>
          <Text style={styles.recoveryWarning}>{i18n.t('vault_incompatible_recovery_warning')}</Text>
          <Button disabled={busy} onPress={confirmReset} title={i18n.t('reset_local_vault_button')} color="#a12424" />
        </View>
      </SafeAreaView>
    );
  }

  if (!unlocked) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.lockCard}>
          <Text style={styles.brand}>WérPass</Text>
          <Text style={styles.demoBadge}>{i18n.t('synthetic_data_badge')}</Text>
          <Text style={styles.title}>
            {needsPin ? (signupStep === 'phone' ? i18n.t('create_account_title') : i18n.t('confirm_number_title')) : i18n.t('vault_locked_title')}
          </Text>
          {needsPin && signupStep === 'phone' ? (
            <>
              <Text style={styles.hint}>{i18n.t('phone_hint')}</Text>
              <Text style={styles.inputLabel}>{i18n.t('phone_label')}</Text>
              <View style={styles.phoneField}>
                <Text accessibilityLabel={i18n.t('senegal_phone_accessibility')} style={styles.phonePrefix}>+221</Text>
                <TextInput
                  accessibilityLabel={i18n.t('senegal_phone_input_accessibility')}
                  keyboardType="number-pad"
                  maxLength={9}
                  onChangeText={(value) => setPhone(sanitizeSenegalNationalNumber(value))}
                  placeholder="77 123 45 67"
                  style={styles.phoneInput}
                  value={phone}
                />
              </View>
              <Text style={styles.phoneHelp}>{i18n.t('phone_digits', { count: phone.length })}</Text>
            </>
          ) : null}
          {needsPin && signupStep === 'otp' ? (
            <>
              <Text style={styles.hint}>{i18n.t('otp_hint')}</Text>
              <Text style={styles.inputLabel}>{i18n.t('otp_label')}</Text>
              <TextInput
                accessibilityLabel={i18n.t('otp_input_accessibility')}
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={setOtp}
                placeholder={i18n.t('otp_placeholder')}
                style={styles.input}
                value={otp}
              />
              <Text style={styles.inputLabel}>{i18n.t('pin_label')}</Text>
              <TextInput
                accessibilityLabel={i18n.t('pin_input_accessibility')}
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={setPin}
                placeholder={i18n.t('pin_placeholder')}
                secureTextEntry
                style={styles.input}
                value={pin}
              />
            </>
          ) : null}
          {!needsPin ? (
            <>
              <Text style={styles.inputLabel}>{i18n.t('pin_label')}</Text>
              <TextInput
                accessibilityLabel={i18n.t('pin_input_accessibility')}
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={setPin}
                placeholder={i18n.t('pin_placeholder')}
                secureTextEntry
                style={styles.input}
                value={pin}
              />
            </>
          ) : null}
          {needsPin && signupStep === 'phone' ? (
            <Button
              disabled={busy || !isValidSenegalNationalNumber(phone)}
              onPress={() => void sendOtp()}
              title={i18n.t('next_button')}
            />
          ) : needsPin ? (
            <>
              <Button disabled={busy || otp.length !== 6 || pin.length !== 4} onPress={() => void confirmOtp()} title={i18n.t('confirm_button')} />
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  setSignupStep('phone');
                  setOtp('');
                  setMessage('');
                }}
                style={styles.secondaryAction}
              >
                <Text style={styles.secondaryActionText}>{i18n.t('edit_phone_number')}</Text>
              </TouchableOpacity>
            </>
          ) : <Button disabled={busy || pin.length !== 4} onPress={() => void submitPin()} title={i18n.t('unlock_button')} />}
          {message ? <Text style={styles.error}>{message}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  const homeQr = share?.qrPayload;
  const displayShareCode = homeQr
    ? (homeQr.match(/.{1,4}/g)?.join(' ') ?? homeQr)
    : '';
  const hasPendingChanges = documents.some((document) => document.syncState !== 'synced') || shareIntents.length > 0;
  const uncategorizedType = i18n.t('uncategorized_type');
  const documentTypes = Array.from(new Set(documents.map((document) => document.documentType || uncategorizedType)))
    .sort((left, right) => left.localeCompare(right, i18n.locale));
  const normalizedSearch = documentSearch.trim().toLocaleLowerCase(i18n.locale);
  const visibleDocuments = documents.filter((document) => {
    const type = document.documentType || uncategorizedType;
    const matchesType = documentTypeFilter === 'all' || type === documentTypeFilter;
    const matchesSearch = !normalizedSearch || `${document.title} ${type}`.toLocaleLowerCase(i18n.locale).includes(normalizedSearch);
    return matchesType && matchesSearch;
  });
  const groupedDocuments = visibleDocuments.reduce<Record<string, TimelineDocument[]>>((groups, document) => {
    const type = document.documentType || uncategorizedType;
    (groups[type] ??= []).push(document);
    return groups;
  }, {});

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{page === 'home' ? i18n.t('header_health_space') : i18n.t('header_vault')}</Text>
            <Text style={styles.brand}>WérPass</Text>
          </View>
          {page === 'home'
            ? <View style={styles.avatar}><Text style={styles.avatarText}>PD</Text></View>
            : <TouchableOpacity onPress={() => setPage('home')} style={styles.backButton}><Text style={styles.backButtonText}>{i18n.t('home_nav')}</Text></TouchableOpacity>}
        </View>
        {page === 'home' ? (
          <>
            <Text style={styles.welcome}>{i18n.t('welcome_user')}</Text>
            <Text style={styles.subtitle}>{i18n.t('qr_subtitle')}</Text>
            <View style={styles.qrCard}>
              <Text style={styles.qrTitle}>{i18n.t('my_qr_title')}</Text>
              {homeQr ? (
                <>
                  <View style={styles.qrFrame}>
                    <QRCode backgroundColor="#ffffff" color="#062f29" quietZone={14} size={224} value={homeQr} />
                  </View>
                  <Text style={styles.codeLabel}>Code de partage temporaire</Text>
                  <Text selectable style={styles.shareReference}>{displayShareCode}</Text>
                  {share && shareDocumentId ? (
                    <View style={styles.shareCodeActions}>
                      <TouchableOpacity disabled={busy} onPress={() => void copyShareCode(homeQr)} style={styles.shareCodeAction}>
                        <Text style={styles.shareCodeActionText}>Copier</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {shareRequest ? (
                    <View style={[styles.smsSentBox, { backgroundColor: '#fff3d6', borderColor: '#edd695' }]}>
                      <Text style={styles.prototype}>Demande à confirmer — données synthétiques</Text>
                      <Text style={[styles.smsSentTitle, { color: '#795b14' }]}>Demande d’accès reçue</Text>
                      <Text style={[styles.smsSentText, { color: '#55420b' }]}>Professionnel : {shareRequest.requesterName}</Text>
                      <Text style={[styles.smsSentText, { color: '#55420b' }]}>Établissement : {shareRequest.requesterFacility}</Text>
                      <Text style={[styles.smsSentText, { color: '#55420b' }]}>Autorisez-vous l’accès au document sélectionné ?</Text>
                      <View style={styles.row}>
                        <Button color="#a12424" disabled={busy} onPress={() => void declineShareRequest()} title="Refuser" />
                        <Button disabled={busy} onPress={() => void approveShareRequest()} title="Autoriser" />
                      </View>
                    </View>
                  ) : shareApproved ? (
                    <View style={styles.smsSentBox}>
                      <Text style={styles.smsSentTitle}>Accès approuvé</Text>
                      <Text style={styles.smsSentText}>Le portail du professionnel s’ouvre directement. Aucun code médical supplémentaire n’est demandé.</Text>
                    </View>
                  ) : (
                    <View style={styles.smsSentBox}>
                      <Text style={styles.smsSentTitle}>En attente d’une demande</Text>
                      <Text style={styles.smsSentText}>Aucun accès n’est accordé. Le patient devra confirmer l’identité du professionnel ici.</Text>
                    </View>
                  )}
                  <Text style={styles.qrHelp}>Ce code numérique expire dans 5 minutes s’il n’est pas utilisé.</Text>
                  <Text style={styles.pendingBadge}>Partage temporaire actif</Text>
                  <Button color="#a12424" disabled={busy} onPress={() => void revokeShare()} title="Supprimer le code" />
                </>
              ) : (
                <View style={styles.qrEmpty}>
                  <Text style={styles.qrEmptyTitle}>Aucun code de partage actif</Text>
                  <Text style={styles.qrHelp}>Générez un code seulement lorsque vous souhaitez partager un document.</Text>
                  <Button disabled={busy} onPress={handleQrAction} title={qrActionTitle} />
                </View>
              )}
            </View>
            <View style={styles.homeActions}>
              <TouchableOpacity disabled={busy} onPress={() => void importDocument()} style={styles.homeActionPrimary}>
                <Text style={styles.homeActionIcon}>＋</Text>
                <Text style={styles.homeActionTitle}>{i18n.t('add_file_title')}</Text>
                <Text style={styles.homeActionHint}>{i18n.t('add_file_hint')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPage('documents')} style={styles.homeActionSecondary}>
                <Text style={styles.homeActionIconDark}>▤</Text>
                <Text style={styles.homeActionTitleDark}>{i18n.t('view_documents_title')}</Text>
                <Text style={styles.homeActionHintDark}>
                  {documents.length === 1
                    ? i18n.t('view_documents_count_one')
                    : i18n.t('view_documents_count_other', { count: documents.length })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPage('profile')} style={styles.homeActionSecondary}>
                <Text style={styles.homeActionTitleDark}>Mon profil</Text>
                <Text style={styles.homeActionHintDark}>Informations synthétiques chiffrées</Text>
              </TouchableOpacity>
            </View>
            {message ? <Text style={styles.notice}>{message}</Text> : null}
            {busy ? <ActivityIndicator style={styles.loader} /> : null}
          </>
        ) : page === 'profile' ? (
          <View style={styles.preview}>
            <Text style={styles.welcome}>Profil patient</Text>
            <Text style={styles.hint}>Données synthétiques uniquement. Chiffrées avant enregistrement et synchronisation.</Text>
            <TextInput accessibilityLabel="Nom" onChangeText={(displayName) => setProfile({ ...profile, displayName })} placeholder="Nom affiché" style={styles.input} value={profile.displayName} />
            <TextInput accessibilityLabel="Âge" keyboardType="number-pad" maxLength={3} onChangeText={(age) => setProfile({ ...profile, age: age.replace(/\D/g, '') })} placeholder="Âge" style={styles.input} value={profile.age} />
            <TextInput accessibilityLabel="Groupe sanguin" onChangeText={(bloodType) => setProfile({ ...profile, bloodType })} placeholder="Groupe sanguin" style={styles.input} value={profile.bloodType} />
            <TextInput accessibilityLabel="Maladies chroniques" multiline onChangeText={(conditions) => setProfile({ ...profile, conditions })} placeholder="Maladies chroniques synthétiques" style={styles.payloadInput} value={profile.conditions} />
            <Button disabled={busy} onPress={() => void saveProfile()} title="Enregistrer et synchroniser" />
          </View>
        ) : (
          <>
            <View style={styles.row}>
              <View>
                <Text style={styles.welcome}>{i18n.t('my_documents_title')}</Text>
                <Text style={styles.subtitle}>{i18n.t('my_documents_subtitle')}</Text>
              </View>
              <Button disabled={busy} onPress={() => void importDocument()} title={i18n.t('add_file_title')} />
            </View>
            {hasPendingChanges ? (
              <View style={styles.updateCard}>
                <View style={styles.updateCopy}>
                  <Text style={styles.updateTitle}>{i18n.t('updates_ready_title')}</Text>
                  <Text style={styles.updateHint}>{i18n.t('updates_ready_hint')}</Text>
                </View>
                <Button disabled={busy} onPress={() => void updateVault()} title={i18n.t('update_button')} />
              </View>
            ) : null}
            {message ? <Text style={styles.notice}>{message}</Text> : null}
            {busy ? <ActivityIndicator style={styles.loader} /> : null}
            <TextInput
              accessibilityLabel={i18n.t('search_documents_accessibility')}
              onChangeText={setDocumentSearch}
              placeholder={i18n.t('search_documents_placeholder')}
              style={styles.searchInput}
              value={documentSearch}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              <TouchableOpacity
                onPress={() => setDocumentTypeFilter('all')}
                style={[styles.filterChip, documentTypeFilter === 'all' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, documentTypeFilter === 'all' && styles.filterChipTextActive]}>{i18n.t('all_types_filter')}</Text>
              </TouchableOpacity>
              {documentTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setDocumentTypeFilter(type)}
                  style={[styles.filterChip, documentTypeFilter === type && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, documentTypeFilter === type && styles.filterChipTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {documents.length === 0 ? <Text style={styles.empty}>{i18n.t('empty_documents')}</Text> : null}
            {documents.length > 0 && visibleDocuments.length === 0 ? <Text style={styles.empty}>{i18n.t('no_search_results')}</Text> : null}
            {Object.entries(groupedDocuments).map(([type, typedDocuments]) => (
              <View key={type} style={styles.documentGroup}>
                <Text style={styles.documentGroupTitle}>{type} · {typedDocuments.length}</Text>
                {typedDocuments.map((document) => (
                  <TouchableOpacity key={document.id} onPress={() => void openDocument(document)} style={styles.documentCard}>
                    <View style={styles.row}>
                      <View style={styles.documentIcon}><Text style={styles.documentIconText}>▤</Text></View>
                      <Text style={styles.documentTitle}>{document.title}</Text>
                      <Text style={styles.status}>{document.syncState === 'synced' ? i18n.t('status_synced') : i18n.t('status_local')}</Text>
                    </View>
                    <Text style={styles.categoryBadge}>{document.documentType || uncategorizedType}</Text>
                    <Text style={styles.meta}>
                      {document.kind === 'prescription' ? i18n.t('kind_prescription') : document.kind === 'lab-result' ? i18n.t('kind_lab_result') : i18n.t('kind_document')} · {new Date(document.createdAt).toLocaleDateString(i18n.locale)}
                    </Text>
                    {document.smartImportEligible ? <Text style={styles.aiAvailable}>{i18n.t('ai_available_label')}</Text> : null}
                    {document.aiAnalysis ? (
                      <Text style={document.aiAnalysis.status === 'confirmed' ? styles.aiAvailable : styles.error}>
                        Analyse IA {document.aiAnalysis.status === 'confirmed' ? 'confirmée' : 'infirmée'} par le patient
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </>
        )}
        {smartImport ? (
          <View style={styles.preview}>
            <Text style={styles.documentTitle}>{i18n.t('pseudonymized_preview_title')}</Text>
            <View style={styles.aiConsentWarning}>
              <Text style={styles.aiConsentWarningTitle}>{i18n.t('ai_consent_warning_short_title')}</Text>
              <Text style={styles.aiConsentWarningText}>{i18n.t('ai_consent_warning_short_message')}</Text>
            </View>
            <TextInput
              accessibilityLabel="Payload pseudonymisé approuvé"
              multiline
              onChangeText={(pseudonymizedText) => setSmartImport({ ...smartImport, request: { ...smartImport.request, pseudonymizedText } })}
              style={styles.payloadInput}
              value={smartImport.request.pseudonymizedText}
            />
            <Text style={styles.hint}>{i18n.t('pseudonymized_hint')}</Text>
            <View style={styles.row}>
              <Button onPress={() => { setSmartImport(null); setMessage('Import intelligent annulé. Rien n’a été envoyé ni conservé.'); }} title={i18n.t('cancel_button')} />
              <Button disabled={!smartImport.request.pseudonymizedText.trim()} onPress={() => void approveSmartImport()} title={i18n.t('approve_button')} />
            </View>
          </View>
        ) : null}
        {smartResults.map((item) => {
          const remoteResult = item.source !== 'local_demo_simulation';
          const groqResult = item.source === 'groq';
          return (
          <View key={item.requestId} style={styles.preview}>
            <Text style={styles.documentTitle}>{groqResult ? i18n.t('groq_result_title') : remoteResult ? i18n.t('legacy_result_title') : i18n.t('local_sim_title')}</Text>
            <Text style={remoteResult ? styles.notice : styles.prototype}>
              {groqResult ? i18n.t('groq_source') : remoteResult ? i18n.t('legacy_source') : i18n.t('sim_source')}
            </Text>
            <Text style={styles.inputLabel}>{i18n.t('document_type_label')}</Text>
            <TextInput
              accessibilityLabel={i18n.t('document_type_label')}
              maxLength={60}
              onChangeText={(documentType) => setSmartResults((current) => current.map((result) => result.requestId === item.requestId
                ? { ...result, result: { ...result.result, documentType } }
                : result))}
              placeholder={i18n.t('document_type_placeholder')}
              style={styles.input}
              value={item.result.documentType}
            />
            <Text style={styles.meta}>{i18n.t('confidence_label')} : {item.result.confidence}</Text>
            <Text style={styles.meta}>{i18n.t('suggested_title_label')} : {item.result.suggestedTitle}</Text>
            <Text style={styles.inputLabel}>{i18n.t('factual_summary_label')}</Text>
            <Text style={styles.meta}>{item.result.summary}</Text>
            <Text style={styles.meta}>
              {i18n.t('date_label')} : {item.result.documentDate || i18n.t('not_specified_label')} · {i18n.t('structure_label')} : {item.result.facilityType || i18n.t('not_specified_label')}
            </Text>
            {item.result.facilityName ? <Text style={styles.meta}>{i18n.t('facility_label')} : {item.result.facilityName}</Text> : null}
            <Text style={styles.inputLabel}>{i18n.t('all_extracted_information_label')}</Text>
            {item.result.fields.map((field, index) => (
              <Text key={`${field.section}:${field.label}:${index}`} style={styles.meta}>
                {field.section} · {field.label} : {field.value}
              </Text>
            ))}
            {item.result.warnings.map((warning) => <Text key={warning} style={styles.error}>{i18n.t('warning_prefix')} : {warning}</Text>)}
            <Text style={styles.hint}>{groqResult
              ? i18n.t('groq_disclaimer')
              : remoteResult ? i18n.t('legacy_disclaimer') : i18n.t('sim_disclaimer')}</Text>
            <View style={styles.row}>
              <Button color="#a12424" disabled={busy} onPress={() => void rejectSmartResult(item)} title={i18n.t('reject_analysis_button')} />
              <Button disabled={busy || !item.result.documentType.trim()} onPress={() => void confirmSmartResult(item)} title={i18n.t('confirm_and_save_button')} />
            </View>
          </View>
          );
        })}
        {preview ? (
          <View style={styles.preview}>
            <View style={styles.row}>
              <Text style={styles.documentTitle}>{preview.title}</Text>
              <Button onPress={() => setPreview(null)} title={i18n.t('close_button')} />
            </View>
            {preview.imageUri ? <Image resizeMode="contain" source={{ uri: preview.imageUri }} style={styles.image} /> : null}
            <Text style={styles.meta}>{preview.detail}</Text>
            <Text style={styles.inputLabel}>{i18n.t('document_type_label')}</Text>
            <TextInput
              accessibilityLabel={i18n.t('document_type_label')}
              maxLength={60}
              onChangeText={setDocumentTypeDraft}
              placeholder={i18n.t('document_type_placeholder')}
              style={styles.input}
              value={documentTypeDraft}
            />
            <Text style={styles.hint}>{i18n.t('document_type_hint')}</Text>
            <Button disabled={busy || !documentTypeDraft.trim()} onPress={() => void saveDocumentType()} title={i18n.t('save_document_type_button')} />
            <Button disabled={busy} onPress={() => requestSmartImportConsent(preview.document)} title={i18n.t('analyze_with_ai_button')} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7f6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  lockCard: { margin: 24, marginTop: 100, padding: 24, gap: 16, backgroundColor: 'white', borderRadius: 18 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  eyebrow: { color: '#648078', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  brand: { color: '#075b4c', fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  avatar: { alignItems: 'center', backgroundColor: '#dcece7', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  avatarText: { color: '#075b4c', fontWeight: '800' },
  backButton: { backgroundColor: '#e4efec', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 9 },
  backButtonText: { color: '#075b4c', fontWeight: '800' },
  welcome: { color: '#15332e', fontSize: 24, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#648078', fontSize: 15, marginBottom: 4 },
  demoBadge: { alignSelf: 'flex-start', backgroundColor: '#edf2f0', borderRadius: 20, color: '#526762', fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  button: {
    alignItems: 'center',
    backgroundColor: '#16a085',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#063c33',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '800', letterSpacing: 0.1, textAlign: 'center' },
  buttonDanger: { backgroundColor: '#ffffff', borderColor: '#e3a6a6', borderWidth: 1, elevation: 0, shadowOpacity: 0 },
  buttonDangerText: { color: '#a12424' },
  buttonDisabled: { backgroundColor: '#cbd7d3', elevation: 0, shadowOpacity: 0 },
  buttonTextDisabled: { color: '#6e827c' },
  prototype: { color: '#8b4513', fontWeight: '700' },
  title: { fontSize: 21, fontWeight: '700', color: '#15332e' },
  qrCard: { alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 28, gap: 14, marginTop: 12, padding: 24, shadowColor: '#073f36', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 5 },
  qrTitle: { color: '#15332e', fontSize: 22, fontWeight: '900' },
  qrHelp: { color: '#648078', fontSize: 13, lineHeight: 19, maxWidth: 280, textAlign: 'center' },
  qrEmpty: { alignItems: 'center', backgroundColor: '#f1f6f4', borderRadius: 18, gap: 8, padding: 28, width: '100%' },
  qrEmptyTitle: { color: '#15332e', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  pendingBadge: { backgroundColor: '#fff3d6', borderRadius: 20, color: '#795b14', fontSize: 12, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7 },
  homeActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  homeActionPrimary: { backgroundColor: '#0b8f78', borderRadius: 20, flex: 1, gap: 5, minHeight: 140, padding: 18 },
  homeActionSecondary: { backgroundColor: '#ffffff', borderColor: '#dce8e4', borderRadius: 20, borderWidth: 1, flex: 1, gap: 5, minHeight: 140, padding: 18 },
  homeActionIcon: { color: '#ffffff', fontSize: 30, fontWeight: '300' },
  homeActionIconDark: { color: '#0b8f78', fontSize: 27, fontWeight: '800' },
  homeActionTitle: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  homeActionTitleDark: { color: '#15332e', fontSize: 17, fontWeight: '900' },
  homeActionHint: { color: '#c9ebe4', fontSize: 12 },
  homeActionHintDark: { color: '#648078', fontSize: 12 },
  updateCard: { alignItems: 'center', backgroundColor: '#fff7df', borderColor: '#edd695', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 15 },
  updateCopy: { flex: 1, gap: 3 },
  updateTitle: { color: '#55420b', fontSize: 15, fontWeight: '900' },
  updateHint: { color: '#795f18', fontSize: 12, lineHeight: 17 },
  documentIcon: { alignItems: 'center', backgroundColor: '#e4f1ed', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  documentIconText: { color: '#0b8f78', fontSize: 20, fontWeight: '900' },
  shareHero: { alignItems: 'stretch', backgroundColor: '#073f36', borderRadius: 24, gap: 13, marginVertical: 8, padding: 22 },
  shareEyebrow: { color: '#8ed8c6', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  shareTitle: { color: '#ffffff', fontSize: 23, fontWeight: '900', letterSpacing: -0.4 },
  shareDescription: { color: '#d6e8e3', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  shareFootnote: { color: '#b8d3cc', fontSize: 12, textAlign: 'center' },
  qrFrame: { alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 20, padding: 8 },
  codeLabel: { color: '#8ed8c6', fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  medicalCode: { color: '#ffffff', fontSize: 32, fontWeight: '900', letterSpacing: 8, textAlign: 'center' },
  accessCode: { color: '#073f36', fontSize: 34, fontWeight: '900', letterSpacing: 9, textAlign: 'center' },
  shareReference: { color: '#075b4c', fontSize: 15, fontWeight: '900', letterSpacing: 1.4, lineHeight: 22, paddingHorizontal: 6, textAlign: 'center' },
  shareCodeActions: { flexDirection: 'row', gap: 10, marginTop: 4, width: '100%' },
  shareCodeAction: { alignItems: 'center', backgroundColor: '#075b4c', borderRadius: 10, flex: 1, paddingVertical: 11 },
  shareCodeActionText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  medicalCodeBox: { alignItems: 'center', backgroundColor: '#eaf5f2', borderRadius: 16, gap: 5, paddingHorizontal: 22, paddingVertical: 12 },
  medicalCodeLabel: { color: '#52756c', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  smsSentBox: { alignItems: 'center', backgroundColor: '#e4f5ed', borderColor: '#9ed4bd', borderRadius: 16, borderWidth: 1, gap: 5, padding: 15, width: '100%' },
  smsSentTitle: { color: '#075b4c', fontSize: 15, fontWeight: '900' },
  smsSentText: { color: '#456b62', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  waitingRequest: { alignItems: 'center', backgroundColor: '#eef5f3', borderRadius: 16, flexDirection: 'row', gap: 10, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 14, width: '100%' },
  waitingRequestText: { color: '#456b62', flexShrink: 1, fontSize: 13, fontWeight: '800' },
  documentChoices: { gap: 8 },
  documentChoice: { borderColor: '#4f7c71', borderRadius: 12, borderWidth: 1, padding: 12 },
  documentChoiceSelected: { backgroundColor: '#d8f2eb', borderColor: '#8ed8c6' },
  documentChoiceText: { color: '#d6e8e3', fontWeight: '700' },
  documentChoiceTextSelected: { color: '#073f36' },
  inputLabel: { color: '#15332e', fontSize: 13, fontWeight: '800', marginBottom: -4, marginTop: 8 },
  input: { backgroundColor: '#ffffff', color: '#15332e', borderColor: '#9ab7b0', borderWidth: 1, borderRadius: 10, fontSize: 20, padding: 12 },
  phoneField: { backgroundColor: '#ffffff', alignItems: 'center', borderColor: '#9ab7b0', borderRadius: 10, borderWidth: 1, flexDirection: 'row' },
  phonePrefix: { borderRightColor: '#d2dfdb', borderRightWidth: 1, color: '#15332e', fontSize: 18, fontWeight: '800', paddingHorizontal: 13, paddingVertical: 14 },
  phoneInput: { color: '#15332e', flex: 1, fontSize: 18, paddingHorizontal: 13, paddingVertical: 14 },
  phoneHelp: { color: '#648078', fontSize: 12, marginTop: -10, textAlign: 'right' },
  secondaryAction: { alignItems: 'center', padding: 8 },
  secondaryActionText: { color: '#075b4c', fontSize: 14, fontWeight: '800' },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  hint: { color: '#526762' },
  recoveryWarning: { backgroundColor: '#fff1f1', borderRadius: 10, color: '#8e2222', lineHeight: 20, padding: 12 },
  aiConsentWarning: { backgroundColor: '#fff7df', borderColor: '#edd695', borderRadius: 12, borderWidth: 1, gap: 5, padding: 12 },
  aiConsentWarningTitle: { color: '#6f5000', fontSize: 14, fontWeight: '900' },
  aiConsentWarningText: { color: '#795f18', fontSize: 12, lineHeight: 18 },
  notice: { color: '#075b4c', backgroundColor: '#dff3ec', borderRadius: 8, padding: 10 },
  error: { color: '#a12424' },
  loader: { marginVertical: 8 },
  empty: { color: '#526762', paddingVertical: 24, textAlign: 'center' },
  searchInput: { backgroundColor: '#ffffff', borderColor: '#9ab7b0', borderRadius: 12, borderWidth: 1, color: '#15332e', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  filterRow: { flexGrow: 0 },
  filterChip: { backgroundColor: '#ffffff', borderColor: '#9ab7b0', borderRadius: 20, borderWidth: 1, marginRight: 8, paddingHorizontal: 14, paddingVertical: 8 },
  filterChipActive: { backgroundColor: '#075b4c', borderColor: '#075b4c' },
  filterChipText: { color: '#526762', fontSize: 13, fontWeight: '700' },
  filterChipTextActive: { color: '#ffffff' },
  documentGroup: { gap: 8, marginTop: 6 },
  documentGroupTitle: { color: '#15332e', fontSize: 15, fontWeight: '900', marginTop: 4 },
  documentCard: { backgroundColor: 'white', borderRadius: 14, padding: 16, gap: 8 },
  categoryBadge: { alignSelf: 'flex-start', backgroundColor: '#e4f1ed', borderRadius: 14, color: '#075b4c', fontSize: 12, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  aiAvailable: { color: '#075b4c', fontSize: 12, fontWeight: '800' },
  documentTitle: { color: '#15332e', flex: 1, fontSize: 17, fontWeight: '700' },
  status: { backgroundColor: '#fff1c7', borderRadius: 20, color: '#6f5000', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  meta: { color: '#526762' },
  preview: { backgroundColor: 'white', borderColor: '#75a99e', borderRadius: 14, borderWidth: 2, gap: 12, marginTop: 8, padding: 16 },
  image: { backgroundColor: '#edf2f0', height: 430, width: '100%' },
  payloadInput: { color: '#15332e', backgroundColor: '#ffffff', borderColor: '#9ab7b0', borderRadius: 10, borderWidth: 1, minHeight: 180, padding: 12, textAlignVertical: 'top' },
});
