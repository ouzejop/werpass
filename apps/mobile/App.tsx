import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Button,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createLocalPin,
  createDemoShare,
  confirmSmartImportResult,
  hasLocalPin,
  hasRemoteSession,
  importSyntheticDocument,
  initializeVault,
  listTimeline,
  listPendingSmartImportResults,
  openLocalDocument,
  prepareSmartImport,
  processDocumentOutbox,
  requestPatientOtp,
  revokeDemoShare,
  processSmartImportOutbox,
  queueApprovedSmartImport,
  resetLocalDemo,
  simulatePendingSmartImports,
  verifyPatientOtp,
  type TimelineDocument,
  type PendingSmartImportResult,
  type DemoShareSession,
  verifyLocalPin,
} from './src/nativeVault';
import type { SmartImportRequest } from '../../packages/contracts/src/smart-import';

export default function App() {
  const [ready, setReady] = useState(false);
  const [needsPin, setNeedsPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [documents, setDocuments] = useState<TimelineDocument[]>([]);
  const [preview, setPreview] = useState<{ title: string; imageUri?: string; detail: string } | null>(null);
  const [smartImport, setSmartImport] = useState<{ documentId: string; request: SmartImportRequest } | null>(null);
  const [smartResults, setSmartResults] = useState<PendingSmartImportResult[]>([]);
  const [remoteAuthenticated, setRemoteAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [share, setShare] = useState<DemoShareSession | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await initializeVault();
        setNeedsPin(!(await hasLocalPin()));
        setRemoteAuthenticated(await hasRemoteSession());
      } catch {
        setMessage('Initialisation sécurisée impossible. Utilisez un development build, pas Expo Go.');
      } finally {
        setReady(true);
      }
    })();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setUnlocked(false);
        setPreview(null);
        setPin('');
      }
    });
    return () => subscription.remove();
  }, []);

  const refresh = async () => {
    setDocuments(await listTimeline());
    setSmartResults(await listPendingSmartImportResults());
  };

  const submitPin = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (needsPin) {
        await createLocalPin(pin);
        setNeedsPin(false);
      } else {
        await verifyLocalPin(pin);
      }
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
        title: opened.title,
        imageUri: opened.imageDataUri,
        detail: opened.mimeType === 'application/pdf'
          ? `PDF déchiffré et authentifié (${opened.sizeBytes} octets). Consultation en lecture seule.`
          : `Image déchiffrée localement (${opened.sizeBytes} octets).`,
      });
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
      setMessage('Vérifiez et modifiez le texte. Aucun envoi n’a encore eu lieu.');
    } catch {
      setMessage('Préparation locale impossible.');
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

  const sendOtp = async () => {
    setBusy(true);
    try {
      await requestPatientOtp(email);
      setOtpRequested(true);
      setMessage('OTP patient envoyé. Il est distinct du PIN local et du code médical.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Envoi OTP impossible.');
    } finally {
      setBusy(false);
    }
  };

  const confirmOtp = async () => {
    setBusy(true);
    try {
      await verifyPatientOtp(email, otp);
      setRemoteAuthenticated(true);
      setOtp('');
      setMessage('Compte patient de démonstration authentifié.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Validation OTP impossible.');
    } finally {
      setBusy(false);
    }
  };

  const shareDocument = async (document: TimelineDocument) => {
    setBusy(true);
    try {
      const created = await createDemoShare(document.id);
      setShare(created);
      setMessage('Partage approuvé pour ce document uniquement. Code médical valable 10 minutes et à usage unique.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Partage impossible.');
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
      setMessage('Partage révoqué. Tout nouvel accès est bloqué.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Révocation impossible.');
    } finally {
      setBusy(false);
    }
  };

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

  const confirmReset = () => Alert.alert(
    'Réinitialiser la démo ?',
    'Tous les documents locaux synthétiques et les secrets de démonstration seront supprimés.',
    [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Réinitialiser',
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

  if (!unlocked) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.lockCard}>
          <Text style={styles.brand}>WérPass</Text>
          <Text style={styles.prototype}>Prototype — données synthétiques uniquement</Text>
          <Text style={styles.title}>{needsPin ? 'Créer le PIN local' : 'Coffre verrouillé'}</Text>
          <TextInput
            accessibilityLabel="PIN local"
            keyboardType="number-pad"
            maxLength={8}
            onChangeText={setPin}
            placeholder="4 à 8 chiffres"
            secureTextEntry
            style={styles.input}
            value={pin}
          />
          <Button disabled={busy || pin.length < 4} onPress={() => void submitPin()} title={needsPin ? 'Créer et ouvrir' : 'Déverrouiller'} />
          {message ? <Text style={styles.error}>{message}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>WérPass</Text>
        <Text style={styles.prototype}>Prototype — patient Démo, données synthétiques</Text>
        <View style={styles.row}>
          <Text style={styles.title}>Chronologie locale</Text>
          <Button disabled={busy} onPress={() => void importDocument()} title="Importer" />
        </View>
        <Text style={styles.hint}>Formats autorisés : prescription-demo.pdf et lab-result-demo.jpg.</Text>
        {!remoteAuthenticated ? (
          <View style={styles.preview}>
            <Text style={styles.documentTitle}>Connexion patient — OTP Supabase</Text>
            <Text style={styles.hint}>L’OTP authentifie le compte distant. Il ne déverrouille pas le coffre local.</Text>
            <TextInput
              accessibilityLabel="E-mail patient de démonstration"
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="patient-demo@exemple.test"
              style={styles.payloadInput}
              value={email}
            />
            {otpRequested ? (
              <TextInput
                accessibilityLabel="OTP patient"
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={setOtp}
                placeholder="Code OTP à 6 chiffres"
                secureTextEntry
                style={styles.input}
                value={otp}
              />
            ) : null}
            <Button disabled={busy || !email.includes('@')} onPress={() => void sendOtp()} title={otpRequested ? 'Renvoyer l’OTP' : 'Envoyer l’OTP'} />
            {otpRequested ? <Button disabled={busy || otp.length !== 6} onPress={() => void confirmOtp()} title="Valider l’OTP patient" /> : null}
          </View>
        ) : null}
        <Button disabled={busy} onPress={() => void resumeSmartImports()} title="Reprendre les analyses en attente" />
        <Button disabled={busy} onPress={() => void useLocalSimulation()} title="Prototype : simuler l’analyse localement" />
        <Button disabled={busy || !remoteAuthenticated} onPress={() => void synchronizeDocuments()} title="Synchroniser les documents chiffrés" />
        {message ? <Text style={styles.notice}>{message}</Text> : null}
        {busy ? <ActivityIndicator style={styles.loader} /> : null}
        {documents.length === 0 ? <Text style={styles.empty}>Aucun document local.</Text> : null}
        {documents.map((document) => (
          <TouchableOpacity key={document.id} onPress={() => void openDocument(document)} style={styles.documentCard}>
            <View style={styles.row}>
              <Text style={styles.documentTitle}>{document.title}</Text>
              <Text style={styles.status}>{document.syncState === 'queued' ? 'En attente' : document.syncState}</Text>
            </View>
            <Text style={styles.meta}>{document.kind === 'prescription' ? 'Ordonnance' : 'Résultat d’analyse'} · {new Date(document.createdAt).toLocaleDateString('fr-FR')}</Text>
            <Text style={styles.meta}>Outbox : {document.outboxState}</Text>
            <Button disabled={busy} onPress={() => void previewSmartImport(document)} title="Import intelligent" />
            <Button disabled={busy || !remoteAuthenticated || document.syncState !== 'synced'} onPress={() => void shareDocument(document)} title="Partager ce document" />
          </TouchableOpacity>
        ))}
        {share ? (
          <View style={styles.preview}>
            <Text style={styles.documentTitle}>Partage temporaire approuvé</Text>
            <Text style={styles.prototype}>Prototype — données synthétiques</Text>
            <Text style={styles.meta}>Identifiant QR opaque : {share.qrPayload}</Text>
            <Text style={styles.meta}>Code médical à usage unique : {share.code}</Text>
            <Text style={styles.meta}>Expiration : {new Date(share.expiresAt).toLocaleTimeString('fr-FR')}</Text>
            <Text style={styles.hint}>Le QR ne contient ni document, ni clé, ni donnée médicale. Ne communiquez jamais l’OTP patient ni le PIN local.</Text>
            <Button color="#a12424" disabled={busy} onPress={() => void revokeShare()} title="Révoquer le partage" />
          </View>
        ) : null}
        {smartImport ? (
          <View style={styles.preview}>
            <Text style={styles.documentTitle}>Aperçu pseudonymisé — éditable</Text>
            <TextInput
              accessibilityLabel="Payload pseudonymisé approuvé"
              multiline
              onChangeText={(pseudonymizedText) => setSmartImport({ ...smartImport, request: { ...smartImport.request, pseudonymizedText } })}
              style={styles.payloadInput}
              value={smartImport.request.pseudonymizedText}
            />
            <Text style={styles.hint}>Seul ce texte sera envoyé après votre consentement explicite. Jamais le PDF/JPEG original.</Text>
            <View style={styles.row}>
              <Button onPress={() => { setSmartImport(null); setMessage('Import intelligent annulé. Rien n’a été envoyé ni conservé.'); }} title="Annuler" />
              <Button disabled={!smartImport.request.pseudonymizedText.trim()} onPress={() => void approveSmartImport()} title="J’approuve" />
            </View>
          </View>
        ) : null}
        {smartResults.map((item) => (
          <View key={item.requestId} style={styles.preview}>
            <Text style={styles.documentTitle}>{item.source === 'gpt-5.6' ? 'Résultat GPT-5.6 à confirmer' : 'Simulation locale à confirmer'}</Text>
            <Text style={item.source === 'gpt-5.6' ? styles.notice : styles.prototype}>
              {item.source === 'gpt-5.6' ? 'Source : appel GPT-5.6 réel' : 'Prototype simulé — aucun appel GPT'}
            </Text>
            <Text style={styles.meta}>Type : {item.result.documentType} · Confiance : {item.result.confidence}</Text>
            <Text style={styles.meta}>Titre proposé : {item.result.suggestedTitle}</Text>
            <Text style={styles.meta}>Date : {item.result.documentDate} · Structure : {item.result.facilityType}</Text>
            {item.result.fields.map((field) => <Text key={`${field.label}:${field.value}`} style={styles.meta}>{field.label} : {field.value}</Text>)}
            {item.result.warnings.map((warning) => <Text key={warning} style={styles.error}>Attention : {warning}</Text>)}
            <Text style={styles.hint}>{item.source === 'gpt-5.6'
              ? 'Suggestion générée par GPT-5.6 à partir du texte pseudonymisé. Ce résultat n’est pas un avis médical.'
              : 'Métadonnées produites localement par des règles bornées aux fixtures. Ce résultat n’est ni une IA ni un avis médical.'}</Text>
            <Button disabled={busy} onPress={() => void confirmSmartResult(item)} title="Confirmer et enregistrer" />
          </View>
        ))}
        {preview ? (
          <View style={styles.preview}>
            <View style={styles.row}>
              <Text style={styles.documentTitle}>{preview.title}</Text>
              <Button onPress={() => setPreview(null)} title="Fermer" />
            </View>
            {preview.imageUri ? <Image resizeMode="contain" source={{ uri: preview.imageUri }} style={styles.image} /> : null}
            <Text style={styles.meta}>{preview.detail}</Text>
          </View>
        ) : null}
        <View style={styles.reset}><Button color="#a12424" disabled={busy} onPress={confirmReset} title="Réinitialiser la démo" /></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f7f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 12 },
  lockCard: { margin: 24, marginTop: 100, padding: 24, gap: 16, backgroundColor: 'white', borderRadius: 18 },
  brand: { color: '#075b4c', fontSize: 30, fontWeight: '800' },
  prototype: { color: '#8b4513', fontWeight: '700' },
  title: { fontSize: 21, fontWeight: '700', color: '#15332e' },
  input: { borderColor: '#9ab7b0', borderWidth: 1, borderRadius: 10, fontSize: 20, padding: 12, letterSpacing: 6 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  hint: { color: '#526762' },
  notice: { color: '#075b4c', backgroundColor: '#dff3ec', borderRadius: 8, padding: 10 },
  error: { color: '#a12424' },
  loader: { marginVertical: 8 },
  empty: { color: '#526762', paddingVertical: 24, textAlign: 'center' },
  documentCard: { backgroundColor: 'white', borderRadius: 14, padding: 16, gap: 8 },
  documentTitle: { color: '#15332e', flex: 1, fontSize: 17, fontWeight: '700' },
  status: { backgroundColor: '#fff1c7', borderRadius: 20, color: '#6f5000', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  meta: { color: '#526762' },
  preview: { backgroundColor: 'white', borderColor: '#75a99e', borderRadius: 14, borderWidth: 2, gap: 12, marginTop: 8, padding: 16 },
  image: { backgroundColor: '#edf2f0', height: 430, width: '100%' },
  payloadInput: { borderColor: '#9ab7b0', borderRadius: 10, borderWidth: 1, minHeight: 180, padding: 12, textAlignVertical: 'top' },
  reset: { marginTop: 28 },
});
